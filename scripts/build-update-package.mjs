import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "update-packages");

const REQUIRED_FILES = [
  "csxt/public/index.html",
  "csxt/server/server.mjs",
  "csxt/server/admin.mjs",
  "csxt/admin/index.html"
];

const ROOT_FILES = [
  "README.md",
  "package.json",
  "package-lock.json"
];

const SOURCE_DIRS = [
  "csxt/public",
  "csxt/admin",
  "csxt/server"
];

const FORBIDDEN_EXACT = new Set([
  "AGENTS.md",
  ".gitignore",
  "启动本地服务.bat",
  "启动生产守护服务.bat",
  "csxt/server/ai-config.local.json"
]);

const FORBIDDEN_PARTS = new Set([
  ".git",
  "node_modules",
  "data",
  "update-packages"
]);

const FORBIDDEN_SUFFIXES = [
  ".DS_Store",
  ".bak",
  ".tmp"
];

function toZipPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function timestamp() {
  const date = new Date();
  const pad = value => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function shouldInclude(zipPath) {
  const normalized = toZipPath(zipPath);
  if (!normalized) return false;
  if (FORBIDDEN_EXACT.has(normalized)) return false;
  if (FORBIDDEN_SUFFIXES.some(suffix => normalized.endsWith(suffix))) return false;
  const parts = normalized.split("/");
  if (parts.some(part => FORBIDDEN_PARTS.has(part))) return false;
  return true;
}

function addFile(zip, absolutePath, zipPath) {
  const normalized = toZipPath(zipPath);
  if (!shouldInclude(normalized)) return;
  zip.addFile(normalized, fs.readFileSync(absolutePath));
}

function addDirectory(zip, absoluteDir, zipRoot) {
  if (!fs.existsSync(absoluteDir)) return;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const zipPath = toZipPath(path.join(zipRoot, entry.name));
    if (!shouldInclude(zipPath)) continue;
    if (entry.isDirectory()) {
      addDirectory(zip, absolutePath, zipPath);
    } else if (entry.isFile()) {
      addFile(zip, absolutePath, zipPath);
    }
  }
}

function validateZipEntries(entries) {
  const names = new Set(entries.filter(name => !name.endsWith("/")).map(toZipPath));
  const missing = REQUIRED_FILES.filter(name => !names.has(name));
  const forbidden = [...names].filter(name => !shouldInclude(name));
  const outsideAllowedRoots = [...names].filter(name => {
    return !(
      name.startsWith("csxt/public/") ||
      name.startsWith("csxt/admin/") ||
      name.startsWith("csxt/server/") ||
      ROOT_FILES.includes(name)
    );
  });
  const errors = [];
  if (missing.length) errors.push(`缺少必需文件: ${missing.join(", ")}`);
  if (forbidden.length) errors.push(`包含禁止文件: ${forbidden.join(", ")}`);
  if (outsideAllowedRoots.length) errors.push(`包含不允许路径: ${outsideAllowedRoots.join(", ")}`);
  return { names, errors };
}

function buildUpdatePackage() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const packagePath = path.join(OUTPUT_DIR, `csxt-update-${timestamp()}.zip`);
  const zip = new AdmZip();

  for (const dir of SOURCE_DIRS) {
    addDirectory(zip, path.join(PROJECT_ROOT, dir), dir);
  }
  for (const file of ROOT_FILES) {
    addFile(zip, path.join(PROJECT_ROOT, file), file);
  }

  const entries = zip.getEntries().map(entry => entry.entryName);
  const { names, errors } = validateZipEntries(entries);
  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  zip.writeZip(packagePath);

  const verifyZip = new AdmZip(packagePath);
  const verification = validateZipEntries(verifyZip.getEntries().map(entry => entry.entryName));
  if (verification.errors.length) {
    fs.rmSync(packagePath, { force: true });
    throw new Error(`写入后校验失败:\n${verification.errors.join("\n")}`);
  }

  const sizeMb = fs.statSync(packagePath).size / 1024 / 1024;
  return {
    packagePath,
    fileCount: names.size,
    sizeMb
  };
}

try {
  const result = buildUpdatePackage();
  console.log("更新包已生成");
  console.log(`路径: ${path.relative(PROJECT_ROOT, result.packagePath)}`);
  console.log(`文件数: ${result.fileCount}`);
  console.log(`大小: ${result.sizeMb.toFixed(1)} MB`);
} catch (err) {
  console.error("生成更新包失败");
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
