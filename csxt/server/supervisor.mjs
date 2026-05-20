import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const SERVER_ENTRY = path.join(__dirname, "server.mjs");
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const CSXT_ROOT = path.resolve(__dirname, "..");
const LAST_UPGRADE_PATH = path.join(CSXT_ROOT, "data", "admin", "last-upgrade.json");
const CODE_BACKUP_DIR = path.join(CSXT_ROOT, "data", "backups", "code");
const RESTART_DELAY_MS = Number(process.env.CSXT_RESTART_DELAY_MS || 1000);
const UPGRADE_STABLE_AFTER_MS = Number(process.env.CSXT_UPGRADE_STABLE_AFTER_MS || 15000);
const UPGRADE_ROLLBACK_WINDOW_MS = Number(process.env.CSXT_UPGRADE_ROLLBACK_WINDOW_MS || 5 * 60 * 1000);

let child = null;
let stopping = false;
let restartCount = 0;
let childStartedAt = 0;

function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function startServer() {
  restartCount += 1;
  childStartedAt = Date.now();
  console.log(`[${now()}] 启动 AI 参数服务，第 ${restartCount} 次`);
  child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      CSXT_SUPERVISOR: "1"
    },
    stdio: "inherit",
    windowsHide: false
  });

  const stableTimer = setTimeout(() => {
    markUpgradeStable();
  }, UPGRADE_STABLE_AFTER_MS);

  child.on("exit", (code, signal) => {
    clearTimeout(stableTimer);
    const runtimeMs = Date.now() - childStartedAt;
    child = null;
    if (stopping) return;
    if (runtimeMs < UPGRADE_STABLE_AFTER_MS && tryRollbackFailedUpgrade()) {
      console.log(`[${now()}] 已尝试回滚失败升级，${RESTART_DELAY_MS}ms 后启动回滚版本`);
      setTimeout(startServer, RESTART_DELAY_MS);
      return;
    }
    console.log(`[${now()}] 服务已退出 code=${code ?? "-"} signal=${signal ?? "-"}，${RESTART_DELAY_MS}ms 后自动重启`);
    setTimeout(startServer, RESTART_DELAY_MS);
  });

  child.on("error", err => {
    console.error(`[${now()}] 服务启动失败: ${err.message}`);
  });
}

function readJsonSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    return null;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function markUpgradeStable() {
  const log = readJsonSafe(LAST_UPGRADE_PATH);
  if (!log || log.status !== "applied") return;
  writeJson(LAST_UPGRADE_PATH, {
    ...log,
    status: "stable",
    stableAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  console.log(`[${now()}] 升级版本已稳定运行`);
}

function normalizeZipEntryName(name) {
  return String(name || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function removePath(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFilePreserve(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  fs.readdirSync(src, { withFileTypes: true }).forEach(entry => {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      copyFilePreserve(from, to);
    }
  });
}

function applyExtractedBackup(extractRoot) {
  ["public", "admin", "server"].forEach(name => {
    const src = path.join(extractRoot, "csxt", name);
    if (!fs.existsSync(src)) return;
    const target = path.join(CSXT_ROOT, name);
    removePath(target);
    copyDir(src, target);
  });
}

function shouldRollback(log) {
  if (!log || log.status !== "applied" || log.rollbackAttempted) return false;
  if (!log.backup || !/^code-\d{14}\.zip$/.test(log.backup)) return false;
  const appliedAt = Date.parse(log.appliedAt || log.updatedAt || "");
  if (!Number.isFinite(appliedAt)) return false;
  return Date.now() - appliedAt <= UPGRADE_ROLLBACK_WINDOW_MS;
}

function tryRollbackFailedUpgrade() {
  const log = readJsonSafe(LAST_UPGRADE_PATH);
  if (!shouldRollback(log)) return false;
  const backupPath = path.join(CODE_BACKUP_DIR, log.backup);
  if (!fs.existsSync(backupPath)) {
    console.error(`[${now()}] 升级失败但找不到回滚备份: ${log.backup}`);
    return false;
  }
  try {
    const AdmZip = requireAdmZip();
    const zip = new AdmZip(backupPath);
    const stageDir = path.join(CSXT_ROOT, "data", "admin", `supervisor-rollback-${Date.now()}`);
    const extractRoot = path.join(stageDir, "extract");
    removePath(stageDir);
    ensureDir(extractRoot);
    zip.getEntries().forEach(entry => {
      if (entry.isDirectory) return;
      const safeName = normalizeZipEntryName(entry.entryName);
      if (!safeName.startsWith("csxt/public/") && !safeName.startsWith("csxt/admin/") && !safeName.startsWith("csxt/server/")) return;
      if (safeName === "csxt/server/ai-config.local.json" || safeName.includes("/../")) return;
      const dest = path.resolve(extractRoot, safeName);
      if (!dest.startsWith(extractRoot + path.sep)) return;
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, entry.getData());
    });
    const localConfig = path.join(CSXT_ROOT, "server", "ai-config.local.json");
    const localConfigBuffer = fs.existsSync(localConfig) ? fs.readFileSync(localConfig) : null;
    applyExtractedBackup(extractRoot);
    if (localConfigBuffer && fs.existsSync(path.join(CSXT_ROOT, "server"))) {
      fs.writeFileSync(path.join(CSXT_ROOT, "server", "ai-config.local.json"), localConfigBuffer);
    }
    removePath(stageDir);
    writeJson(LAST_UPGRADE_PATH, {
      ...log,
      status: "auto-rollback-applied",
      rollbackAttempted: true,
      rollbackAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log(`[${now()}] 新版本快速失败，已自动回滚到 ${log.backup}`);
    return true;
  } catch (err) {
    writeJson(LAST_UPGRADE_PATH, {
      ...log,
      status: "auto-rollback-failed",
      rollbackAttempted: true,
      rollbackError: err.message,
      updatedAt: new Date().toISOString()
    });
    console.error(`[${now()}] 自动回滚失败: ${err.stack || err.message}`);
    return false;
  }
}

function requireAdmZip() {
  try {
    return require("adm-zip");
  } catch (err) {
    const modulePath = path.join(PROJECT_ROOT, "node_modules", "adm-zip");
    return require(modulePath);
  }
}

function stop() {
  stopping = true;
  if (child && !child.killed) {
    child.kill();
    return;
  }
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("uncaughtException", err => {
  console.error(`[${now()}] 守护进程异常: ${err.stack || err.message}`);
});

startServer();
