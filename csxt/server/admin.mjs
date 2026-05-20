import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileDatabaseCatalogFiles } from "./database-loader.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const ADMIN_DIR = path.join(DATA_DIR, "admin");
const FEEDBACK_DIR = path.join(DATA_DIR, "feedback");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const CODE_BACKUP_DIR = path.join(BACKUP_DIR, "code");
const STAGING_DIR = path.join(ADMIN_DIR, "staging");
const ADMIN_STATIC_DIR = path.join(ROOT_DIR, "admin");
const PENDING_UPGRADE_PATH = path.join(ADMIN_DIR, "pending-upgrade.json");
const LAST_UPGRADE_PATH = path.join(ADMIN_DIR, "last-upgrade.json");
const FEEDBACK_PATH = path.join(FEEDBACK_DIR, "feedback.jsonl");
const USAGE_STATS_PATH = path.join(ADMIN_DIR, "usage-stats.json");
const SITE_NOTICE_PATH = path.join(ADMIN_DIR, "site-notice.json");
const SESSION_COOKIE = "superzxy_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const USAGE_ACTIVE_TTL_MS = 150 * 1000;
const MAX_USAGE_SESSIONS = 5000;
const MAX_ADMIN_UPLOAD_SIZE = 220 * 1024 * 1024;
const SHADOW_START_TIMEOUT_MS = 18000;
const SHADOW_HEALTH_TIMEOUT_MS = 2500;
const ALLOWED_CODE_ROOT_FILES = new Set([
  "README.md",
  "package.json",
  "package-lock.json"
]);
const REQUIRED_UPGRADE_FILES = [
  "csxt/server/server.mjs",
  "csxt/server/admin.mjs",
  "csxt/public/index.html"
];
const SERVER_CHECK_FILES = [
  "csxt/server/server.mjs",
  "csxt/server/admin.mjs",
  "csxt/server/supervisor.mjs"
];

const sessions = new Map();
const activeUsageClients = new Map();
const USAGE_STARTED_AT = new Date().toISOString();
let admZipCtorPromise = null;

async function getAdmZipCtor() {
  if (!admZipCtorPromise) {
    admZipCtorPromise = import("adm-zip")
      .then(module => module.default || module)
      .catch(err => {
        admZipCtorPromise = null;
        const wrapped = new Error("ZIP 功能依赖缺失，请先在项目根目录执行 npm install 后再上传或回滚代码包。");
        wrapped.cause = err;
        throw wrapped;
      });
  }
  return admZipCtorPromise;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function jsonResponse(res, statusCode, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function textResponse(res, statusCode, text, contentType = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(text);
}

function createId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${crypto.randomBytes(5).toString("hex")}`;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function safeBasename(value) {
  return path.basename(String(value || "").replace(/\\/g, "/"));
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  const cookies = new Map();
  raw.split(";").forEach(pair => {
    const index = pair.indexOf("=");
    if (index < 0) return;
    cookies.set(pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim()));
  });
  return cookies;
}

function readRawBody(req, maxSize = MAX_ADMIN_UPLOAD_SIZE) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", chunk => {
      total += chunk.length;
      if (total > maxSize) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readRawBody(req, 1024 * 1024);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf-8"));
  } catch (err) {
    throw new Error("BAD_JSON");
  }
}

function parseMultipartBuffer(buffer, contentType) {
  const match = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error("BAD_MULTIPART");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const result = { fields: {}, files: {} };
  let offset = 0;
  while (offset < buffer.length) {
    const start = buffer.indexOf(boundary, offset);
    if (start < 0) break;
    let partStart = start + boundary.length;
    if (buffer.slice(partStart, partStart + 2).toString() === "--") break;
    if (buffer.slice(partStart, partStart + 2).toString() === "\r\n") partStart += 2;
    const next = buffer.indexOf(boundary, partStart);
    if (next < 0) break;
    let part = buffer.slice(partStart, next);
    if (part.slice(-2).toString() === "\r\n") part = part.slice(0, -2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) {
      offset = next;
      continue;
    }
    const headerText = part.slice(0, headerEnd).toString("utf-8");
    const body = part.slice(headerEnd + 4);
    const disposition = headerText.match(/content-disposition:[^\r\n]+/i);
    const name = disposition && disposition[0].match(/name="([^"]+)"/i);
    if (!name) {
      offset = next;
      continue;
    }
    const filename = disposition[0].match(/filename="([^"]*)"/i);
    if (filename && filename[1]) {
      result.files[name[1]] = {
        filename: safeBasename(filename[1]),
        data: body,
        size: body.length,
        contentType: (headerText.match(/content-type:\s*([^\r\n]+)/i) || [])[1] || ""
      };
    } else {
      result.fields[name[1]] = body.toString("utf-8");
    }
    offset = next;
  }
  return result;
}

async function readMultipart(req) {
  const raw = await readRawBody(req);
  return parseMultipartBuffer(raw, req.headers["content-type"]);
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0]
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function copyFilePreserve(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function pathExists(target) {
  try {
    fs.accessSync(target);
    return true;
  } catch (err) {
    return false;
  }
}

function removePath(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest, options = {}) {
  if (!fs.existsSync(src)) return;
  const shouldInclude = typeof options.shouldInclude === "function" ? options.shouldInclude : () => true;
  ensureDir(dest);
  fs.readdirSync(src, { withFileTypes: true }).forEach(entry => {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (!shouldInclude(from, entry)) return;
    if (entry.isDirectory()) {
      copyDir(from, to, options);
    } else if (entry.isFile()) {
      copyFilePreserve(from, to);
    }
  });
}

function movePath(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.renameSync(src, dest);
  return true;
}

function nowIso() {
  return new Date().toISOString();
}

function listFilesRecursive(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  });
  return files;
}

function addDirectoryToZip(zip, src, zipRoot, shouldInclude = () => true) {
  if (!fs.existsSync(src)) return;
  fs.readdirSync(src, { withFileTypes: true }).forEach(entry => {
    const full = path.join(src, entry.name);
    const zipPath = `${zipRoot}/${entry.name}`.replace(/\\/g, "/");
    if (!shouldInclude(full, zipPath, entry)) return;
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, full, zipPath, shouldInclude);
    } else if (entry.isFile()) {
      zip.addLocalFile(full, zipRoot);
    }
  });
}

async function createCodeBackup(rootDir) {
  const AdmZip = await getAdmZipCtor();
  ensureDir(CODE_BACKUP_DIR);
  const file = path.join(CODE_BACKUP_DIR, `code-${timestamp()}.zip`);
  const zip = new AdmZip();
  addDirectoryToZip(zip, path.join(rootDir, "public"), "csxt/public");
  addDirectoryToZip(zip, path.join(rootDir, "admin"), "csxt/admin");
  addDirectoryToZip(zip, path.join(rootDir, "server"), "csxt/server", (_full, zipPath) => {
    return zipPath !== "csxt/server/ai-config.local.json";
  });
  ALLOWED_CODE_ROOT_FILES.forEach(name => {
    const full = path.join(path.dirname(rootDir), name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      zip.addLocalFile(full, "", name);
    }
  });
  zip.writeZip(file);
  await verifyCodeBackup(file);
  return file;
}

async function verifyCodeBackup(file) {
  const AdmZip = await getAdmZipCtor();
  const zip = new AdmZip(file);
  const names = new Set(zip.getEntries()
    .filter(entry => !entry.isDirectory)
    .map(entry => normalizeZipEntryName(entry.entryName)));
  const missing = REQUIRED_UPGRADE_FILES.filter(required => !names.has(required));
  if (missing.length) {
    throw new Error(`代码备份不完整，缺少: ${missing.join(", ")}`);
  }
  return true;
}

function normalizeZipEntryName(name) {
  return String(name || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function findCsxtPrefix(entries) {
  for (const entry of entries) {
    const name = normalizeZipEntryName(entry.entryName);
    const index = name.indexOf("csxt/server/");
    if (index >= 0) return name.slice(0, index);
  }
  return "";
}

function validateRelativeCodePath(rel) {
  const normalized = normalizeZipEntryName(rel);
  if (!normalized || normalized.includes("\0") || normalized.startsWith("../") || normalized.includes("/../")) {
    return null;
  }
  if (normalized.startsWith("csxt/data/")) return null;
  if (normalized.startsWith("node_modules/") || normalized.includes("/node_modules/")) return null;
  if (normalized.startsWith("csxt/data/")) return null;
  if (normalized.startsWith("csxt/data")) return null;
  if (normalized.startsWith("csxt/server/ai-config.local.json")) return null;
  if (normalized === "csxt/server/ai-config.local.json") return null;
  if (normalized.startsWith("csxt/public/") || normalized.startsWith("csxt/server/") || normalized.startsWith("csxt/admin/")) return normalized;
  if (ALLOWED_CODE_ROOT_FILES.has(normalized)) return normalized;
  return null;
}

function createUpgradeReport(sourceName = "") {
  return {
    sourceName,
    fileCount: 0,
    directories: [],
    rootFiles: [],
    warnings: [],
    errors: [],
    canApply: false
  };
}

function addReportPath(report, safeRel) {
  report.fileCount += 1;
  const parts = safeRel.split("/");
  if (parts[0] === "csxt" && parts[1]) {
    report.directories.push(`csxt/${parts[1]}`);
  } else if (parts.length === 1) {
    report.rootFiles.push(parts[0]);
  }
}

function finalizeUpgradeReport(report, extractedFiles) {
  const fileSet = new Set(extractedFiles);
  REQUIRED_UPGRADE_FILES.forEach(required => {
    if (!fileSet.has(required)) report.errors.push(`缺少必要文件: ${required}`);
  });
  const hasAdminFiles = extractedFiles.some(file => file.startsWith("csxt/admin/"));
  if (hasAdminFiles && !fileSet.has("csxt/admin/index.html")) {
    report.errors.push("包含 csxt/admin/ 时必须包含 csxt/admin/index.html");
  }
  report.directories = Array.from(new Set(report.directories)).sort();
  report.rootFiles = Array.from(new Set(report.rootFiles)).sort();
  report.canApply = report.errors.length === 0;
  return report;
}

function checkServerSyntax(extractRoot, report) {
  SERVER_CHECK_FILES.forEach(relativeFile => {
    const full = path.join(extractRoot, relativeFile);
    if (!fs.existsSync(full)) return;
    const result = spawnSync(process.execPath, ["--check", full], {
      encoding: "utf-8",
      windowsHide: true
    });
    if (result.status !== 0) {
      const message = (result.stderr || result.stdout || "").trim().split(/\r?\n/).slice(0, 8).join("\n");
      report.errors.push(`${relativeFile} 语法检查失败: ${message || `exit ${result.status}`}`);
    }
  });
}

async function validateAndExtractUpgradeZip(zipBuffer, stageDir, sourceName = "") {
  const AdmZip = await getAdmZipCtor();
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const prefix = findCsxtPrefix(entries);
  const report = createUpgradeReport(sourceName);
  const extractedFiles = [];
  const extractRoot = path.join(stageDir, "extract");
  removePath(extractRoot);
  ensureDir(extractRoot);

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const rawName = normalizeZipEntryName(entry.entryName);
    const rel = prefix && rawName.startsWith(prefix) ? rawName.slice(prefix.length) : rawName;
    const safeRel = validateRelativeCodePath(rel);
    if (!safeRel) {
      report.errors.push(`ZIP 包含不允许覆盖的路径: ${rawName}`);
      continue;
    }
    const dest = path.resolve(extractRoot, safeRel);
    if (!dest.startsWith(extractRoot + path.sep)) {
      report.errors.push(`ZIP 路径不安全: ${rawName}`);
      continue;
    }
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, entry.getData());
    extractedFiles.push(safeRel);
    addReportPath(report, safeRel);
  }

  finalizeUpgradeReport(report, extractedFiles);
  if (report.errors.length === 0) {
    checkServerSyntax(extractRoot, report);
    report.canApply = report.errors.length === 0;
  }
  return { extractRoot, report };
}

function copyRuntimeDataForShadow(rootDir, shadowRootDir) {
  const dataSrc = path.join(rootDir, "data");
  const dataDest = path.join(shadowRootDir, "data");
  ensureDir(dataDest);
  ["database.xlsx", "generated"].forEach(name => {
    const src = path.join(dataSrc, name);
    const dest = path.join(dataDest, name);
    if (!fs.existsSync(src)) return;
    if (fs.statSync(src).isDirectory()) {
      copyDir(src, dest);
    } else {
      copyFilePreserve(src, dest);
    }
  });
}

function overlayExtractedCode(rootDir, extractRoot, targetRootDir) {
  ["public", "admin", "server"].forEach(name => {
    copyDir(path.join(rootDir, name), path.join(targetRootDir, name));
  });
  ["public", "admin", "server"].forEach(name => {
    const src = path.join(extractRoot, "csxt", name);
    if (!fs.existsSync(src)) return;
    copyDir(src, path.join(targetRootDir, name));
  });
  const currentConfig = path.join(rootDir, "server", "ai-config.local.json");
  if (fs.existsSync(currentConfig)) {
    copyFilePreserve(currentConfig, path.join(targetRootDir, "server", "ai-config.local.json"));
  }
}

function prepareShadowProject(rootDir, stageDir, extractRoot) {
  const shadowProjectRoot = path.join(stageDir, "shadow-project");
  const shadowCsxtRoot = path.join(shadowProjectRoot, "csxt");
  removePath(shadowProjectRoot);
  ensureDir(shadowCsxtRoot);
  overlayExtractedCode(rootDir, extractRoot, shadowCsxtRoot);
  copyRuntimeDataForShadow(rootDir, shadowCsxtRoot);
  ALLOWED_CODE_ROOT_FILES.forEach(name => {
    const currentRootFile = path.join(path.dirname(rootDir), name);
    const stagedRootFile = path.join(extractRoot, name);
    if (fs.existsSync(currentRootFile) && fs.statSync(currentRootFile).isFile()) {
      copyFilePreserve(currentRootFile, path.join(shadowProjectRoot, name));
    }
    if (fs.existsSync(stagedRootFile) && fs.statSync(stagedRootFile).isFile()) {
      copyFilePreserve(stagedRootFile, path.join(shadowProjectRoot, name));
    }
  });
  return shadowProjectRoot;
}

function findFreeLocalPort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function requestStatus(port, requestPath, timeoutMs = SHADOW_HEALTH_TIMEOUT_MS) {
  return new Promise(resolve => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method: "GET",
      timeout: timeoutMs
    }, response => {
      response.resume();
      response.on("end", () => resolve(response.statusCode || 0));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(0);
    });
    req.on("error", () => resolve(0));
    req.end();
  });
}

async function waitForShadowHealthy(port, child, outputLines) {
  const checks = [
    { path: "/", status: 0, ok: false },
    { path: "/api/database", status: 0, ok: false },
    { path: "/superzxy", status: 0, ok: false }
  ];
  const startedAt = Date.now();
  while (Date.now() - startedAt < SHADOW_START_TIMEOUT_MS) {
    if (child.exitCode !== null || child.signalCode) break;
    let allOk = true;
    for (const check of checks) {
      if (check.ok) continue;
      check.status = await requestStatus(port, check.path);
      check.ok = check.status >= 200 && check.status < 400;
      if (!check.ok) allOk = false;
    }
    if (allOk) return { ok: true, checks, output: outputLines.slice(-40) };
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { ok: false, checks, output: outputLines.slice(-80) };
}

async function runShadowValidation(rootDir, pending) {
  const extractRoot = path.join(pending.stageDir, "extract");
  const shadowProjectRoot = prepareShadowProject(rootDir, pending.stageDir, extractRoot);
  const shadowPort = await findFreeLocalPort();
  const outputLines = [];
  const child = spawn(process.execPath, [path.join(shadowProjectRoot, "csxt", "server", "server.mjs")], {
    cwd: shadowProjectRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(shadowPort),
      CSXT_SHADOW: "1",
      AI_CONFIG_PATH: path.join(shadowProjectRoot, "csxt", "server", "ai-config.local.json")
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const collect = chunk => {
    outputLines.push(...String(chunk).split(/\r?\n/).filter(Boolean));
    while (outputLines.length > 160) outputLines.shift();
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  try {
    const result = await waitForShadowHealthy(shadowPort, child, outputLines);
    return { shadowPort, ...result };
  } finally {
    if (!child.killed) child.kill();
    await new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode) return resolve();
      const timer = setTimeout(resolve, 1500);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

function applyExtractedCode(rootDir, extractRoot) {
  const projectRoot = path.dirname(rootDir);
  const publicSrc = path.join(extractRoot, "csxt", "public");
  const serverSrc = path.join(extractRoot, "csxt", "server");
  const adminSrc = path.join(extractRoot, "csxt", "admin");
  const localConfigPath = path.join(rootDir, "server", "ai-config.local.json");
  const localConfigBuffer = fs.existsSync(localConfigPath) ? fs.readFileSync(localConfigPath) : null;
  const switchId = timestamp();
  const nextRoot = path.join(rootDir, `.upgrade-next-${switchId}`);
  const previousRoot = path.join(ADMIN_DIR, `previous-code-${switchId}`);
  const switched = [];
  removePath(nextRoot);
  removePath(previousRoot);
  ensureDir(nextRoot);
  ensureDir(previousRoot);

  [
    { name: "public", src: publicSrc },
    { name: "admin", src: adminSrc },
    { name: "server", src: serverSrc }
  ].forEach(item => {
    if (fs.existsSync(item.src)) {
      copyDir(item.src, path.join(nextRoot, item.name));
    }
  });

  try {
    ["public", "admin", "server"].forEach(name => {
      const next = path.join(nextRoot, name);
      if (!fs.existsSync(next)) return;
      const current = path.join(rootDir, name);
      const previous = path.join(previousRoot, name);
      if (fs.existsSync(current)) movePath(current, previous);
      movePath(next, current);
      switched.push({ name, current, previous });
    });
    if (localConfigBuffer && fs.existsSync(path.join(rootDir, "server"))) {
      fs.writeFileSync(path.join(rootDir, "server", "ai-config.local.json"), localConfigBuffer);
    }
    ALLOWED_CODE_ROOT_FILES.forEach(name => {
      const src = path.join(extractRoot, name);
      if (fs.existsSync(src) && fs.statSync(src).isFile()) {
        copyFilePreserve(src, path.join(projectRoot, name));
      }
    });
  } catch (err) {
    for (const item of switched.reverse()) {
      removePath(item.current);
      if (fs.existsSync(item.previous)) movePath(item.previous, item.current);
    }
    throw err;
  } finally {
    removePath(nextRoot);
  }
  return { previousRoot };
}

function readPendingUpgrade() {
  if (!fs.existsSync(PENDING_UPGRADE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(PENDING_UPGRADE_PATH, "utf-8"));
  } catch (err) {
    return null;
  }
}

function writePendingUpgrade(data) {
  ensureDir(path.dirname(PENDING_UPGRADE_PATH));
  fs.writeFileSync(PENDING_UPGRADE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function clearPendingUpgrade() {
  removePath(PENDING_UPGRADE_PATH);
}

function writeLastUpgradeLog(data) {
  ensureDir(ADMIN_DIR);
  fs.writeFileSync(LAST_UPGRADE_PATH, JSON.stringify({
    updatedAt: nowIso(),
    ...data
  }, null, 2), "utf-8");
}

function readLastUpgradeLog() {
  return readJsonFileSafe(LAST_UPGRADE_PATH);
}

async function summarizeCodeBackup(file) {
  const AdmZip = await getAdmZipCtor();
  const zip = new AdmZip(file);
  const directories = new Set();
  let fileCount = 0;
  zip.getEntries().forEach(entry => {
    if (entry.isDirectory) return;
    fileCount += 1;
    const name = normalizeZipEntryName(entry.entryName);
    const parts = name.split("/");
    if (parts[0] === "csxt" && parts[1]) directories.add(`csxt/${parts[1]}`);
  });
  return { fileCount, directories: Array.from(directories).sort() };
}

function listCodeBackups() {
  ensureDir(CODE_BACKUP_DIR);
  return fs.readdirSync(CODE_BACKUP_DIR)
    .filter(name => /^code-\d{14}\.zip$/.test(name))
    .sort()
    .reverse()
    .map(name => {
      const full = path.join(CODE_BACKUP_DIR, name);
      const stat = fs.statSync(full);
      return { name, size: stat.size, mtime: stat.mtime.toISOString() };
    });
}

function listDatabaseBackups() {
  ensureDir(BACKUP_DIR);
  return fs.readdirSync(BACKUP_DIR)
    .filter(name => /^database-\d{14}\.(xlsx|xlsm|xls)$/i.test(name))
    .sort()
    .reverse()
    .map(name => {
      const full = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(full);
      return { name, size: stat.size, mtime: stat.mtime.toISOString() };
    });
}

function readJsonFileSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    return null;
  }
}

function normalizeSiteNotice(data = {}) {
  const message = String(data.message || "").trim().slice(0, 300);
  return {
    enabled: Boolean(data.enabled) && Boolean(message),
    title: String(data.title || "").trim().slice(0, 40),
    message,
    updatedAt: String(data.updatedAt || "").trim()
  };
}

function readSiteNotice() {
  return normalizeSiteNotice(readJsonFileSafe(SITE_NOTICE_PATH) || {});
}

function writeSiteNotice(input = {}) {
  const message = String(input.message || "").trim().slice(0, 300);
  const payload = {
    enabled: Boolean(input.enabled),
    title: String(input.title || "").trim().slice(0, 40),
    message,
    updatedAt: nowIso()
  };
  ensureDir(ADMIN_DIR);
  fs.writeFileSync(SITE_NOTICE_PATH, JSON.stringify(payload, null, 2), "utf-8");
  return normalizeSiteNotice(payload);
}

function normalizeUsageId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 96);
}

function readUsageStats() {
  const data = readJsonFileSafe(USAGE_STATS_PATH);
  if (!data || typeof data !== "object") {
    return { totalUses: 0, sessions: {}, updatedAt: null };
  }
  const sessionsData = data.sessions && typeof data.sessions === "object" ? data.sessions : {};
  return {
    totalUses: Math.max(0, Number(data.totalUses) || 0),
    sessions: sessionsData,
    updatedAt: data.updatedAt || null
  };
}

function pruneUsageSessions(sessionsData) {
  const entries = Object.entries(sessionsData || {})
    .filter(([key, value]) => key && value)
    .sort((left, right) => String(right[1]).localeCompare(String(left[1])));
  return Object.fromEntries(entries.slice(0, MAX_USAGE_SESSIONS));
}

function writeUsageStats(stats) {
  ensureDir(ADMIN_DIR);
  const payload = {
    totalUses: Math.max(0, Number(stats.totalUses) || 0),
    sessions: pruneUsageSessions(stats.sessions),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(USAGE_STATS_PATH, JSON.stringify(payload, null, 2), "utf-8");
  return payload;
}

function pruneActiveUsageClients(now = Date.now()) {
  for (const [clientId, lastSeenAt] of activeUsageClients.entries()) {
    if (!clientId || now - lastSeenAt > USAGE_ACTIVE_TTL_MS) {
      activeUsageClients.delete(clientId);
    }
  }
}

function getUsageSnapshot() {
  const now = Date.now();
  pruneActiveUsageClients(now);
  const stats = readUsageStats();
  let lastSeenAt = null;
  for (const lastSeen of activeUsageClients.values()) {
    if (!lastSeenAt || lastSeen > lastSeenAt) lastSeenAt = lastSeen;
  }
  return {
    activeUsers: activeUsageClients.size,
    totalUses: stats.totalUses,
    startedAt: USAGE_STARTED_AT,
    lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null
  };
}

function recordUsageHeartbeat(body) {
  const clientId = normalizeUsageId(body.clientId);
  const sessionId = normalizeUsageId(body.sessionId);
  if (!clientId || !sessionId) {
    const err = new Error("USAGE_ID_REQUIRED");
    err.statusCode = 400;
    throw err;
  }
  const nowIso = new Date().toISOString();
  const stats = readUsageStats();
  if (!stats.sessions[sessionId]) {
    stats.totalUses += 1;
    stats.sessions[sessionId] = nowIso;
    writeUsageStats(stats);
  }
  activeUsageClients.set(clientId, Date.now());
  return getUsageSnapshot();
}

function getProcessManager() {
  if (process.env.CSXT_SUPERVISOR === "1") return "supervisor";
  if (process.env.pm_id || process.env.pm_id === "0" || process.env.PM2_HOME || process.env.pm_exec_path) return "pm2";
  return "manual";
}

function sendRestartAwareResponse(res, payload = {}) {
  const processManager = getProcessManager();
  const managedRuntime = processManager !== "manual";
  jsonResponse(res, 200, {
    ok: true,
    restartScheduled: managedRuntime,
    manualRestartRequired: !managedRuntime,
    processManager,
    ...payload
  });
  if (managedRuntime) {
    setTimeout(() => process.exit(0), 600);
  }
}

function readAdminHtml() {
  const version = ["index.html", "admin.js", "admin.css"]
    .map(name => {
      try {
        return Math.round(fs.statSync(path.join(ADMIN_STATIC_DIR, name)).mtimeMs).toString(36);
      } catch (err) {
        return "";
      }
    })
    .filter(Boolean)
    .join("-");
  return fs.readFileSync(path.join(ADMIN_STATIC_DIR, "index.html"), "utf-8")
    .replace(/__ADMIN_ASSET_VERSION__/g, version || timestamp());
}

export function createAdminController(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const projectRoot = path.dirname(rootDir);
  const databaseSourcePath = options.databaseSourcePath || path.join(rootDir, "data", "database.xlsx");
  const getAiConfig = typeof options.getAiConfig === "function" ? options.getAiConfig : () => ({});
  const reloadDatabaseCatalog = typeof options.reloadDatabaseCatalog === "function" ? options.reloadDatabaseCatalog : () => {};

  ensureDir(ADMIN_DIR);
  ensureDir(FEEDBACK_DIR);
  ensureDir(BACKUP_DIR);
  ensureDir(CODE_BACKUP_DIR);
  ensureDir(STAGING_DIR);

  function getAdminPassword() {
    const config = getAiConfig() || {};
    return String(process.env.SUPERZXY_ADMIN_PASSWORD || (config.admin && config.admin.password) || "").trim();
  }

  function requireSession(req, res) {
    const token = parseCookies(req).get(SESSION_COOKIE);
    const session = token && sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      if (token) sessions.delete(token);
      jsonResponse(res, 401, { error: "请先登录后台" });
      return null;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return session;
  }

  async function appendFeedback(req, body) {
    const employeeId = String(body.employeeId || body.workerId || "").trim();
    const suggestion = String(body.suggestion || body.feedback || "").trim();
    if (!employeeId) throw Object.assign(new Error("EMPLOYEE_ID_REQUIRED"), { statusCode: 400 });
    if (!suggestion) throw Object.assign(new Error("SUGGESTION_REQUIRED"), { statusCode: 400 });
    if (employeeId.length > 80 || suggestion.length > 4000) throw Object.assign(new Error("FEEDBACK_TOO_LONG"), { statusCode: 400 });
    ensureDir(FEEDBACK_DIR);
    const record = {
      id: createId("fb"),
      created_at: new Date().toISOString(),
      employeeId,
      suggestion,
      ip: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || "")
    };
    fs.appendFileSync(FEEDBACK_PATH, `${JSON.stringify(record)}\n`, "utf-8");
    return record;
  }

  function readFeedback(limit = 50, offset = 0) {
    if (!fs.existsSync(FEEDBACK_PATH)) return { total: 0, items: [] };
    const items = fs.readFileSync(FEEDBACK_PATH, "utf-8")
      .split(/\n+/)
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch (err) { return null; }
      })
      .filter(Boolean)
      .reverse();
    return {
      total: items.length,
      items: items.slice(offset, offset + limit)
    };
  }

  async function handleLogin(req, res) {
    const password = getAdminPassword();
    if (!password) {
      jsonResponse(res, 503, { error: "后台密码未配置，请设置 SUPERZXY_ADMIN_PASSWORD 或 admin.password" });
      return;
    }
    const body = await readJson(req);
    if (!constantTimeEqual(body.password, password)) {
      jsonResponse(res, 401, { error: "密码不正确" });
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
    jsonResponse(res, 200, { ok: true }, {
      "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    });
  }

  async function handleUsageHeartbeat(req, res) {
    const body = await readJson(req);
    const snapshot = recordUsageHeartbeat(body);
    jsonResponse(res, 200, { ok: true, ...snapshot });
  }

  function handleSiteNotice(req, res) {
    jsonResponse(res, 200, readSiteNotice());
  }

  async function updateSiteNotice(req, res) {
    const body = await readJson(req);
    jsonResponse(res, 200, { ok: true, notice: writeSiteNotice(body) });
  }

  async function uploadDatabase(req, res) {
    const form = await readMultipart(req);
    const file = form.files.database || form.files.file;
    if (!file) throw new Error("请选择数据库文件");
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.filename)) throw new Error("仅支持 .xlsx/.xlsm/.xls");
    const id = createId("db");
    const stageRoot = path.join(STAGING_DIR, id);
    const stageDataDir = path.join(stageRoot, "data");
    ensureDir(stageDataDir);
    const stagedDatabase = path.join(stageDataDir, "database.xlsx");
    fs.writeFileSync(stagedDatabase, file.data);
    const { meta, report } = compileDatabaseCatalogFiles(stageRoot);
    const backupName = `database-${timestamp()}${path.extname(databaseSourcePath) || ".xlsx"}`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    if (fs.existsSync(databaseSourcePath)) copyFilePreserve(databaseSourcePath, backupPath);
    try {
      copyFilePreserve(stagedDatabase, databaseSourcePath);
      compileDatabaseCatalogFiles(rootDir);
      reloadDatabaseCatalog();
    } catch (err) {
      if (fs.existsSync(backupPath)) copyFilePreserve(backupPath, databaseSourcePath);
      compileDatabaseCatalogFiles(rootDir);
      reloadDatabaseCatalog();
      throw err;
    } finally {
      removePath(stageRoot);
    }
    jsonResponse(res, 200, { ok: true, backup: backupName, meta, report });
  }

  async function rollbackDatabase(req, res) {
    const body = await readJson(req);
    const backup = safeBasename(body.backup);
    if (!/^database-\d{14}\.(xlsx|xlsm|xls)$/i.test(backup)) throw new Error("备份文件名不合法");
    const backupPath = path.join(BACKUP_DIR, backup);
    if (!fs.existsSync(backupPath)) throw new Error("备份不存在");
    const currentBackup = `database-${timestamp()}${path.extname(databaseSourcePath) || ".xlsx"}`;
    if (fs.existsSync(databaseSourcePath)) copyFilePreserve(databaseSourcePath, path.join(BACKUP_DIR, currentBackup));
    copyFilePreserve(backupPath, databaseSourcePath);
    compileDatabaseCatalogFiles(rootDir);
    reloadDatabaseCatalog();
    jsonResponse(res, 200, { ok: true, backup });
  }

  async function uploadUpgrade(req, res) {
    const form = await readMultipart(req);
    const file = form.files.package || form.files.zip || form.files.file;
    if (!file) throw new Error("请选择 ZIP 文件");
    if (!/\.zip$/i.test(file.filename)) throw new Error("仅支持 .zip");
    const previousPending = readPendingUpgrade();
    if (previousPending && previousPending.stageDir) removePath(previousPending.stageDir);
    const id = createId("up");
    const stageDir = path.join(STAGING_DIR, id);
    ensureDir(stageDir);
    fs.writeFileSync(path.join(stageDir, "source.zip"), file.data);
    const { report } = await validateAndExtractUpgradeZip(file.data, stageDir, file.filename);
    const pending = {
      id,
      stageDir,
      sourceName: file.filename,
      fileCount: report.fileCount,
      report,
      canApply: report.canApply,
      createdAt: nowIso()
    };
    writePendingUpgrade(pending);
    jsonResponse(res, 200, { ok: true, ...pending });
  }

  async function applyUpgrade(req, res) {
    if (getProcessManager() === "manual") {
      jsonResponse(res, 409, { error: "当前服务不是守护模式或 PM2 启动，已拒绝应用代码升级，避免服务下线。请使用“启动生产守护服务.bat”或 PM2 启动后再应用。" });
      return;
    }
    const pending = readPendingUpgrade();
    if (!pending || !fs.existsSync(pending.stageDir)) throw new Error("没有待应用的升级包");
    if (!pending.canApply || (pending.report && pending.report.errors && pending.report.errors.length)) {
      throw new Error(`升级包预检未通过: ${(pending.report && pending.report.errors || ["未知错误"]).join("；")}`);
    }
    const shadow = await runShadowValidation(rootDir, pending);
    if (!shadow.ok) {
      writeLastUpgradeLog({
        status: "shadow-failed",
        sourceName: pending.sourceName,
        pendingId: pending.id,
        shadowPort: shadow.shadowPort,
        healthChecks: shadow.checks,
        shadowOutput: shadow.output
      });
      jsonResponse(res, 400, {
        error: "影子服务健康检查失败，正式服务未受影响。",
        shadowPort: shadow.shadowPort,
        healthChecks: shadow.checks,
        shadowOutput: shadow.output
      });
      return;
    }
    const backup = await createCodeBackup(rootDir);
    const applied = applyExtractedCode(rootDir, path.join(pending.stageDir, "extract"));
    writeLastUpgradeLog({
      status: "applied",
      sourceName: pending.sourceName,
      pendingId: pending.id,
      backup: path.basename(backup),
      shadowPort: shadow.shadowPort,
      healthChecks: shadow.checks,
      previousRoot: applied.previousRoot,
      appliedAt: nowIso(),
      rollbackAttempted: false
    });
    clearPendingUpgrade();
    removePath(pending.stageDir);
    sendRestartAwareResponse(res, {
      backup: path.basename(backup),
      shadowPort: shadow.shadowPort,
      healthChecks: shadow.checks
    });
  }

  async function rollbackCode(req, res) {
    if (getProcessManager() === "manual") {
      jsonResponse(res, 409, { error: "当前服务不是守护模式或 PM2 启动，已拒绝代码回滚，避免服务下线。请使用“启动生产守护服务.bat”或 PM2 启动后再回滚。" });
      return;
    }
    const body = await readJson(req);
    const backup = safeBasename(body.backup);
    if (!/^code-\d{14}\.zip$/.test(backup)) throw new Error("备份文件名不合法");
    const backupPath = path.join(CODE_BACKUP_DIR, backup);
    if (!fs.existsSync(backupPath)) throw new Error("备份不存在");
    const stageDir = path.join(STAGING_DIR, createId("rollback"));
    ensureDir(stageDir);
    const { report } = await validateAndExtractUpgradeZip(fs.readFileSync(backupPath), stageDir, backup);
    if (!report.canApply) {
      removePath(stageDir);
      throw new Error(`备份预检未通过: ${report.errors.join("；")}`);
    }
    const pending = {
      id: createId("rollback"),
      stageDir,
      sourceName: backup,
      report,
      canApply: true
    };
    const shadow = await runShadowValidation(rootDir, pending);
    if (!shadow.ok) {
      writeLastUpgradeLog({
        status: "rollback-shadow-failed",
        sourceName: backup,
        shadowPort: shadow.shadowPort,
        healthChecks: shadow.checks,
        shadowOutput: shadow.output
      });
      jsonResponse(res, 400, {
        error: "回滚包影子健康检查失败，正式服务未受影响。",
        shadowPort: shadow.shadowPort,
        healthChecks: shadow.checks,
        shadowOutput: shadow.output
      });
      return;
    }
    const currentBackup = await createCodeBackup(rootDir);
    const applied = applyExtractedCode(rootDir, path.join(stageDir, "extract"));
    writeLastUpgradeLog({
      status: "rollback-applied",
      sourceName: backup,
      backup: path.basename(currentBackup),
      rollbackTarget: backup,
      shadowPort: shadow.shadowPort,
      healthChecks: shadow.checks,
      previousRoot: applied.previousRoot,
      appliedAt: nowIso(),
      rollbackAttempted: true
    });
    removePath(stageDir);
    sendRestartAwareResponse(res, {
      backup,
      currentBackup: path.basename(currentBackup),
      shadowPort: shadow.shadowPort,
      healthChecks: shadow.checks
    });
  }

  async function handleApi(req, res, requestUrl) {
    try {
      if (requestUrl.pathname === "/api/admin/login" && req.method === "POST") return await handleLogin(req, res);
      const session = requireSession(req, res);
      if (!session) return;
      if (requestUrl.pathname === "/api/admin/logout" && req.method === "POST") {
        const token = parseCookies(req).get(SESSION_COOKIE);
        if (token) sessions.delete(token);
        jsonResponse(res, 200, { ok: true }, { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
        return;
      }
      if (requestUrl.pathname === "/api/admin/session" && req.method === "GET") return jsonResponse(res, 200, { ok: true });
      if (requestUrl.pathname === "/api/admin/usage" && req.method === "GET") return jsonResponse(res, 200, getUsageSnapshot());
      if (requestUrl.pathname === "/api/admin/site-notice" && req.method === "GET") return handleSiteNotice(req, res);
      if (requestUrl.pathname === "/api/admin/site-notice" && req.method === "PUT") return await updateSiteNotice(req, res);
      if (requestUrl.pathname === "/api/admin/feedback" && req.method === "GET") {
        const limit = Math.min(200, Math.max(1, Number(requestUrl.searchParams.get("limit")) || 50));
        const offset = Math.max(0, Number(requestUrl.searchParams.get("offset")) || 0);
        return jsonResponse(res, 200, readFeedback(limit, offset));
      }
      if (requestUrl.pathname === "/api/admin/feedback/export.csv" && req.method === "GET") {
        const rows = readFeedback(100000, 0).items;
        const csv = [
          ["id", "created_at", "employeeId", "suggestion", "ip", "userAgent"].map(csvCell).join(","),
          ...rows.map(item => [item.id, item.created_at, item.employeeId, item.suggestion, item.ip, item.userAgent].map(csvCell).join(","))
        ].join("\n");
        return textResponse(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": "attachment; filename=feedback.csv" });
      }
      if (requestUrl.pathname === "/api/admin/database/status" && req.method === "GET") {
        return jsonResponse(res, 200, {
          meta: readJsonFileSafe(path.join(rootDir, "data", "generated", "catalog.meta.json")),
          report: readJsonFileSafe(path.join(rootDir, "data", "generated", "compile-report.json")),
          databaseBackups: listDatabaseBackups()
        });
      }
      if (requestUrl.pathname === "/api/admin/database/upload" && req.method === "POST") return await uploadDatabase(req, res);
      if (requestUrl.pathname === "/api/admin/database/rollback" && req.method === "POST") return await rollbackDatabase(req, res);
      if (requestUrl.pathname === "/api/admin/upgrade/upload" && req.method === "POST") return await uploadUpgrade(req, res);
      if (requestUrl.pathname === "/api/admin/upgrade/backups" && req.method === "GET") {
        return jsonResponse(res, 200, {
          pending: readPendingUpgrade(),
          codeBackups: listCodeBackups(),
          databaseBackups: listDatabaseBackups(),
          lastUpgrade: readLastUpgradeLog()
        });
      }
      if (requestUrl.pathname === "/api/admin/upgrade/apply" && req.method === "POST") return await applyUpgrade(req, res);
      if (requestUrl.pathname === "/api/admin/upgrade/rollback" && req.method === "POST") return await rollbackCode(req, res);
      if (requestUrl.pathname === "/api/admin/system/restart" && req.method === "POST") {
        if (getProcessManager() === "manual") {
          jsonResponse(res, 409, { error: "当前服务不是守护模式或 PM2 启动，后台不能自动重启。请使用“启动生产守护服务.bat”启动，或手动关闭并重新启动服务。" });
          return;
        }
        sendRestartAwareResponse(res);
        return;
      }
      jsonResponse(res, 404, { error: "后台接口不存在" });
    } catch (err) {
      const status = err.message === "BODY_TOO_LARGE" ? 413 : err.message === "BAD_JSON" ? 400 : 400;
      jsonResponse(res, status, { error: err.message || "后台操作失败" });
    }
  }

  function servePage(req, res) {
    textResponse(res, 200, readAdminHtml(), "text/html; charset=utf-8");
  }

  return {
    appendFeedback,
    handleUsageHeartbeat,
    handleSiteNotice,
    handleApi,
    servePage
  };
}
