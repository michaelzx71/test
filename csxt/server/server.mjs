import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { URL, fileURLToPath } from "node:url";
import { createAdminController } from "./admin.mjs";
import { compileDatabaseCatalogFiles } from "./database-loader.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ADMIN_PUBLIC_DIR = path.join(ROOT_DIR, "admin");
const START_PORT = readPort();
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY_SIZE = 10 * 1024 * 1024;
const MAX_UPSTREAM_RESPONSE_SIZE = 20 * 1024 * 1024;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 10 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = Math.max(
  30000,
  Number.parseInt(process.env.AI_UPSTREAM_TIMEOUT_MS || `${DEFAULT_UPSTREAM_TIMEOUT_MS}`, 10) || DEFAULT_UPSTREAM_TIMEOUT_MS
);
const MIN_UPSTREAM_RETRY_ATTEMPTS = Math.max(1, Number.parseInt(process.env.AI_UPSTREAM_RETRY_ATTEMPTS || "2", 10) || 2);
const DATA_DIR = path.join(ROOT_DIR, "data");
const GENERATED_DATA_DIR = path.join(DATA_DIR, "generated");
const DATABASE_SOURCE_PATH = path.join(DATA_DIR, "database.xlsx");
const CATALOG_BUNDLE_PATH = path.join(GENERATED_DATA_DIR, "catalog.bundle.json");
const AI_CONFIG_PATH = process.env.AI_CONFIG_PATH || path.join(__dirname, "ai-config.local.json");
let databaseCatalog = null;
let databaseCatalogBody = "";
let databaseCatalogGzipBody = null;
let databaseCatalogEtag = "";
let databaseSourceMtimeMs = 0;
let aiConfig = {};
let adminController = null;
const aiKeyCursors = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".xlsb": "application/vnd.ms-excel.sheet.binary.macroEnabled.12"
};
const STATIC_GZIP_EXTENSIONS = new Set([".html", ".js", ".mjs", ".css", ".json", ".txt", ".md"]);
const staticGzipCache = new Map();

function readPort() {
  const flagIndex = process.argv.indexOf("--port");
  const raw = flagIndex >= 0 ? process.argv[flagIndex + 1] : process.env.PORT;
  const port = Number.parseInt(raw || "7654", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return port;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function acceptsGzip(req) {
  return /\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""));
}

function sendJsonBody(req, res, statusCode, body, options = {}) {
  setCorsHeaders(res);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...options.headers
  };
  res.writeHead(statusCode, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  setCorsHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}

function shouldGzipStatic(req, ext, stats) {
  return req.method !== "HEAD" &&
    stats.size >= 1024 &&
    STATIC_GZIP_EXTENSIONS.has(ext) &&
    acceptsGzip(req);
}

function writeStaticHeaders(req, res, headers, bodyLength) {
  res.writeHead(200, {
    ...headers,
    "Content-Length": bodyLength
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  return false;
}

function sendStaticStream(req, res, absolutePath, stats, headers) {
  if (writeStaticHeaders(req, res, headers, stats.size)) return;
  fs.createReadStream(absolutePath).pipe(res);
}

function getStaticEtag(stats) {
  return `"static-${Math.round(stats.mtimeMs).toString(36)}-${stats.size.toString(36)}"`;
}

function resolveStaticPath(baseDir, requestPath, defaultFile = "index.html") {
  const normalizedPath = requestPath === "/" ? `/${defaultFile}` : requestPath;
  let decodedPath = "";
  try {
    decodedPath = decodeURIComponent(normalizedPath);
  } catch (err) {
    return null;
  }
  const relativePath = decodedPath.replace(/^[/\\]+/, "");
  const absolutePath = path.resolve(baseDir, relativePath);
  const relativeToBase = path.relative(baseDir, absolutePath);
  if (relativeToBase.startsWith("..") || path.isAbsolute(relativeToBase)) {
    return null;
  }
  return absolutePath;
}

function serveStaticFrom(req, res, baseDir, requestPath) {
  const absolutePath = resolveStaticPath(baseDir, requestPath);
  if (!absolutePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(absolutePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      sendText(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const cacheControl = ext === ".html"
      ? "no-cache"
      : ([".js", ".mjs", ".css"].includes(ext) ? "public, max-age=300, must-revalidate" : "public, max-age=300");
    const etag = getStaticEtag(stats);
    const headers = {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "ETag": etag,
      "Last-Modified": stats.mtime.toUTCString()
    };
    setCorsHeaders(res);

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    if (!shouldGzipStatic(req, ext, stats)) {
      sendStaticStream(req, res, absolutePath, stats, headers);
      return;
    }

    const cacheKey = `${stats.mtimeMs}:${stats.size}`;
    const cached = staticGzipCache.get(absolutePath);
    if (cached && cached.key === cacheKey) {
      writeStaticHeaders(req, res, { ...headers, "Content-Encoding": "gzip", "Vary": "Accept-Encoding" }, cached.body.length);
      res.end(cached.body);
      return;
    }

    fs.readFile(absolutePath, (readErr, raw) => {
      if (readErr) {
        if (!res.headersSent) sendText(res, 500, "Internal Server Error");
        return;
      }
      zlib.gzip(raw, { level: 6 }, (gzipErr, body) => {
        if (gzipErr) {
          if (!res.headersSent) sendStaticStream(req, res, absolutePath, stats, headers);
          return;
        }
        if (staticGzipCache.size > 64) staticGzipCache.clear();
        staticGzipCache.set(absolutePath, { key: cacheKey, body });
        writeStaticHeaders(req, res, { ...headers, "Content-Encoding": "gzip", "Vary": "Accept-Encoding" }, body.length);
        res.end(body);
      });
    });
  });
}

function serveAiParamsStatic(req, res, requestPath) {
  const strippedPath = requestPath === "/ai-params" || requestPath === "/ai-params/"
    ? "/"
    : requestPath.replace(/^\/ai-params(?=\/)/, "");
  serveStaticFrom(req, res, PUBLIC_DIR, strippedPath);
}

function serveAdminStatic(req, res, requestPath) {
  const strippedPath = requestPath.replace(/^\/superzxy(?=\/)/, "");
  serveStaticFrom(req, res, ADMIN_PUBLIC_DIR, strippedPath);
}

function serveOfficialStatic(req, res, requestPath) {
  const strippedPath = requestPath === "/official" || requestPath === "/official/"
    ? "/official/index.html"
    : requestPath;
  serveStaticFrom(req, res, PUBLIC_DIR, strippedPath);
}

function isAiParamsPublicPath(requestPath) {
  return requestPath === "/" ||
    requestPath === "/index.html" ||
    requestPath === "/favicon.png" ||
    requestPath === "/apple-touch-icon.png" ||
    requestPath.startsWith("/css/") ||
    requestPath.startsWith("/js/") ||
    requestPath.startsWith("/vendor/");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", chunk => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        reject(new Error("BAD_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function splitSecretList(value) {
  return String(value || "")
    .split(/[\n,;]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map(item => String(item || "").trim()).filter(Boolean))];
}

function loadAiConfigFromDisk() {
  if (!fs.existsSync(AI_CONFIG_PATH)) {
    console.warn(`未找到 AI 配置文件: ${path.relative(ROOT_DIR, AI_CONFIG_PATH)}，将仅使用环境变量或前端传入配置。`);
    aiConfig = {};
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, "utf-8"));
    aiConfig = parsed && typeof parsed === "object" ? parsed : {};
    console.log(`AI 配置已加载: ${path.relative(ROOT_DIR, AI_CONFIG_PATH)}`);
  } catch (err) {
    console.warn(`AI 配置读取失败: ${err.message}`);
    aiConfig = {};
  }
}

function compileDatabaseSourceForRuntime() {
  try {
    const { meta, report, elapsed } = compileDatabaseCatalogFiles(ROOT_DIR);
    console.log(
      `database.xlsx 已自动编译: ${meta.product_count} 个产品, ${meta.parameter_count} 条参数, ` +
      `${elapsed}ms`
    );
    if (report && report.summary && report.summary.warning_count) {
      console.warn(`database.xlsx 编译提示/警告: ${report.summary.warning_count} 条，请查看 data/generated/compile-report.json`);
    }
    return true;
  } catch (err) {
    console.warn(`database.xlsx 自动编译失败，将尝试使用已有 JSON: ${err.message}`);
    return false;
  }
}

function normalizeFlowKey(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  const aliases = {
    extract: "quote_extract",
    quote_extract: "quote_extract",
    quote_parser_extract: "quote_extract",
    component: "quote_component_interpret",
    component_interpret: "quote_component_interpret",
    quote_component_interpret: "quote_component_interpret",
    interpret_components: "quote_component_interpret",
    analyze: "quote_product_analyze",
    product_analyze: "quote_product_analyze",
    quote_product_analyze: "quote_product_analyze",
    single_product_analyze: "quote_product_analyze",
    quote_analyze: "quote_product_analyze",
    select: "quote_select",
    quote_select: "quote_select",
    select_params: "quote_select",
    rewrite: "rewrite",
    param_rewrite: "rewrite",
    format: "format",
    normalize_format: "format"
  };
  return aliases[text] || text;
}

function getConfiguredFlow(flowKey) {
  const key = normalizeFlowKey(flowKey);
  if (!key) return {};
  const fromConfig = aiConfig[key] || (aiConfig.flows && aiConfig.flows[key]) || {};
  const envPrefixMap = {
    quote_extract: "QUOTE_EXTRACT_AI",
    quote_component_interpret: "QUOTE_COMPONENT_INTERPRET_AI",
    quote_product_analyze: "QUOTE_PRODUCT_ANALYZE_AI",
    quote_select: "QUOTE_SELECT_AI",
    rewrite: "REWRITE_AI",
    format: "FORMAT_AI"
  };
  const prefix = envPrefixMap[key] || key.toUpperCase();
  const envEndpoint = process.env[`${prefix}_ENDPOINT`];
  const envModel = process.env[`${prefix}_MODEL`];
  const envSingleKey = splitSecretList(process.env[`${prefix}_API_KEY`]);
  const envLegacyKeys = splitSecretList(process.env[`${prefix}_API_KEYS`]);
  const configSingleKey = splitSecretList(fromConfig.apiKey);
  const configLegacyKeys = Array.isArray(fromConfig.apiKeys)
    ? fromConfig.apiKeys.map(item => String(item || "").trim()).filter(Boolean)
    : [];
  const apiKeys = uniqueNonEmpty([
    ...envSingleKey,
    ...configSingleKey,
    ...envLegacyKeys,
    ...configLegacyKeys
  ]);
  return {
    endpoint: String(envEndpoint || fromConfig.endpoint || "").trim(),
    model: String(envModel ?? fromConfig.model ?? ""),
    apiKeys
  };
}

function getAiFlowStatus() {
  const keys = ["quote_extract", "quote_component_interpret", "quote_product_analyze", "quote_select", "rewrite", "format"];
  return Object.fromEntries(keys.map(key => {
    const flow = getConfiguredFlow(key);
    return [key, {
      configured: Boolean(String(flow.endpoint || "").trim() && flow.apiKeys && flow.apiKeys.length),
      hasEndpoint: Boolean(String(flow.endpoint || "").trim()),
      hasApiKey: Boolean(flow.apiKeys && flow.apiKeys.length),
      hasPrompt: true
    }];
  }));
}

function resolveAiRequest(body, fallbackFlowKey = "") {
  const flowKey = normalizeFlowKey(body.flowKey || fallbackFlowKey);
  const flow = getConfiguredFlow(flowKey);
  const endpoint = String(flow.endpoint || "").trim();
  const model = flow.model !== undefined && String(flow.model).trim() ? flow.model : body.model;
  const apiKeys = flow.apiKeys && flow.apiKeys.length ? flow.apiKeys : [];
  const { endpoint: _endpoint, apiKey: _apiKey, apiKeys: _apiKeys, ...safeBody } = body;
  return {
    requestBody: {
      ...safeBody,
      flowKey,
      endpoint,
      model
    },
    apiKeys
  };
}

function getNextAiKeyOffset(flowKey, apiKeys) {
  if (!apiKeys || apiKeys.length <= 1) return 0;
  const key = normalizeFlowKey(flowKey) || "default";
  const current = aiKeyCursors.get(key) || 0;
  aiKeyCursors.set(key, (current + 1) % apiKeys.length);
  return current;
}

function buildUpstreamPayload(body) {
  const endpoint = String(body.endpoint || "").trim();
  const model = String(body.model || "");
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const temperature = body.temperature ?? 0;
  const stream = body.stream ?? false;
  const detail = body.detail ?? false;
  const responseFormat = body.response_format;

  if (!endpoint || messages.length === 0) {
    throw new Error("缺少 endpoint 或 messages");
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(endpoint);
  } catch (err) {
    throw new Error("endpoint 格式不正确");
  }
  if (!["http:", "https:"].includes(upstreamUrl.protocol)) {
    throw new Error("endpoint 只支持 http 或 https");
  }

  const payloadData = {
    messages,
    temperature,
    stream,
    detail
  };
  if (model) {
    payloadData.model = model;
  }
  if (body.chatId) {
    payloadData.chatId = String(body.chatId);
  }
  if (body.variables && typeof body.variables === "object" && !Array.isArray(body.variables)) {
    payloadData.variables = body.variables;
  }
  if (responseFormat && typeof responseFormat === "object") {
    payloadData.response_format = responseFormat;
  }
  return {
    upstreamUrl,
    payload: JSON.stringify(payloadData)
  };
}

function summarizeAiMessageContent(value) {
  const text = String(value || "").replace(/\r/g, "\n");
  const firstLine = text.split("\n").map(line => line.trim()).find(Boolean) || "";
  return {
    length: text.length,
    firstLine: firstLine.slice(0, 120)
  };
}

function logAiRequestSummary(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userMessage = messages.find(message => message && message.role === "user") || messages[0] || {};
  const summary = summarizeAiMessageContent(userMessage.content);
  const firstLine = process.env.DEBUG_AI_LOGS === "1" ? ` first="${summary.firstLine}"` : "";
  console.log(`[AI请求] flow=${body.flowKey || "-"} chatId=${body.chatId || "-"} chars=${summary.length}${firstLine}`);
}

function formatServerDuration(ms) {
  const value = Math.max(0, Number(ms) || 0);
  if (value >= 60000) {
    const minutes = Math.round(value / 60000);
    return `${minutes} 分钟`;
  }
  return `${Math.round(value / 1000)} 秒`;
}

function requestUpstreamChatCompletion(body, apiKey) {
  return new Promise((resolve, reject) => {
    const { upstreamUrl, payload } = buildUpstreamPayload(body);
    const requestOptions = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
      path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Bearer ${apiKey}`
      },
      timeout: UPSTREAM_TIMEOUT_MS
    };

    const transport = upstreamUrl.protocol === "http:" ? http : https;
    const upstreamReq = transport.request(requestOptions, upstreamRes => {
      const chunks = [];
      let total = 0;
      upstreamRes.on("data", chunk => {
        total += chunk.length;
        if (total > MAX_UPSTREAM_RESPONSE_SIZE) {
          upstreamReq.destroy(new Error("UPSTREAM_RESPONSE_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });
      upstreamRes.on("end", () => {
        const bodyText = Buffer.concat(chunks).toString("utf-8");
        resolve({
          statusCode: upstreamRes.statusCode || 502,
          contentType: upstreamRes.headers["content-type"] || "application/json; charset=utf-8",
          bodyText
        });
      });
    });

    upstreamReq.on("timeout", () => {
      upstreamReq.destroy(new Error("UPSTREAM_TIMEOUT"));
    });
    upstreamReq.on("error", reject);
    upstreamReq.write(payload);
    upstreamReq.end();
  });
}

async function submitFeedback(req, body) {
  return getAdminController().appendFeedback(req, body);
}

function shouldRetryUpstream(resultOrError) {
  if (!resultOrError) return false;
  if (resultOrError instanceof Error) {
    if (Number(resultOrError.statusCode)) {
      return resultOrError.statusCode === 429 || resultOrError.statusCode >= 500;
    }
    return true;
  }
  return resultOrError.statusCode === 429 || resultOrError.statusCode >= 500;
}

async function requestUpstreamWithRetry(body, apiKeys, keyOffset = 0, maxAttempts = 2) {
  let lastError = null;
  const attempts = Math.max(1, maxAttempts, MIN_UPSTREAM_RETRY_ATTEMPTS);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const key = apiKeys[(keyOffset + attempt) % apiKeys.length];
    try {
      const result = await requestUpstreamChatCompletion(body, key);
      if (result.statusCode >= 200 && result.statusCode < 300) {
        if (attempt > 0) {
          console.log(`[AI重试成功] flow=${body.flowKey || "-"} chatId=${body.chatId || "-"} attempt=${attempt + 1}/${attempts}`);
        }
        return result;
      }
      lastError = new Error(result.bodyText || `AI_PROXY_${result.statusCode}`);
      lastError.statusCode = result.statusCode;
      if (!shouldRetryUpstream(result) || attempt === attempts - 1) {
        throw lastError;
      }
      console.warn(`[AI重试] flow=${body.flowKey || "-"} chatId=${body.chatId || "-"} status=${result.statusCode} attempt=${attempt + 1}/${attempts}`);
    } catch (err) {
      lastError = err;
      if (!shouldRetryUpstream(err) || attempt === attempts - 1) {
        throw lastError;
      }
      console.warn(`[AI重试] flow=${body.flowKey || "-"} chatId=${body.chatId || "-"} error=${String(err && err.code || err && err.message || err)} attempt=${attempt + 1}/${attempts}`);
    }
  }
  throw lastError || new Error("AI_PROXY_FAILED");
}

async function proxyChatCompletion(body, res) {
  try {
    const resolved = resolveAiRequest(body);
    const apiKeys = resolved.apiKeys;
    if (!String(resolved.requestBody.endpoint || "").trim()) {
      sendJson(res, 400, { code: "AI_ENDPOINT_MISSING", reasonType: "config", error: "后端 AI 流程配置缺少 endpoint" });
      return;
    }
    if (apiKeys.length === 0) {
      sendJson(res, 400, { code: "AI_KEY_MISSING", reasonType: "config", error: "后端 AI 流程配置缺少 API Key" });
      return;
    }
    const keyOffset = getNextAiKeyOffset(resolved.requestBody.flowKey, apiKeys);
    logAiRequestSummary(resolved.requestBody);
    const result = await requestUpstreamWithRetry(resolved.requestBody, apiKeys, keyOffset, apiKeys.length || 1);
    setCorsHeaders(res);
    res.writeHead(result.statusCode, {
      "Content-Type": result.contentType
    });
    res.end(result.bodyText);
  } catch (err) {
    const classified = classifyProxyError(err);
    const statusCode = Number(classified.statusCode) || Number(err && err.statusCode) || 502;
    sendJson(res, statusCode, {
      code: classified.code,
      reasonType: classified.reasonType,
      error: classified.message
    });
  }
}

function classifyProxyError(err) {
  const rawMessage = String(err && err.message || err || "");
  const statusCode = Number(err && err.statusCode) || 0;
  if (/unAuthApiKey|error_message\.514|\"code\"\s*:\s*514/.test(rawMessage)) {
    return {
      code: "AI_AUTH_FAILED",
      reasonType: "auth",
      message: "AI 接口鉴权失败，请检查当前 FastGPT 工作流 API Key 是否有效或有权限。"
    };
  }
  if (rawMessage.includes("UPSTREAM_TIMEOUT")) {
    return {
      code: "AI_UPSTREAM_TIMEOUT",
      reasonType: "timeout",
      statusCode: 504,
      message: `AI 接口等待超过 ${formatServerDuration(UPSTREAM_TIMEOUT_MS)} 仍未返回，FastGPT 供应商可能仍在后台生成，请稍后重试或降低并发。`
    };
  }
  if (rawMessage.includes("UPSTREAM_RESPONSE_TOO_LARGE")) {
    return {
      code: "AI_RESPONSE_TOO_LARGE",
      reasonType: "upstream",
      message: "AI 接口返回内容过大，请缩小输入或检查工作流输出。"
    };
  }
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return {
      code: "AI_UPSTREAM_TIMEOUT",
      reasonType: "timeout",
      statusCode,
      message: `AI 接口请求超时或上游服务不可用（HTTP ${statusCode}），请检查零信任网络、FastGPT 工作流或应用服务器状态。`
    };
  }
  if (err && err.code === "ENOTFOUND") {
    return {
      code: "AI_DNS_FAILED",
      reasonType: "network",
      message: `AI 域名解析失败：${err.hostname || rawMessage}`
    };
  }
  if (err && ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ETIMEDOUT"].includes(err.code)) {
    return {
      code: `AI_${err.code}`,
      reasonType: "network",
      message: `AI 网络连接失败：${err.code}`
    };
  }
  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "AI_AUTH_FAILED",
      reasonType: "auth",
      message: "AI 接口鉴权失败，请检查 API Key 或权限。"
    };
  }
  if (statusCode === 429) {
    return {
      code: "AI_RATE_LIMITED",
      reasonType: "rate_limit",
      message: "AI 接口限流，请稍后重试。"
    };
  }
  return {
    code: "AI_PROXY_FAILED",
    reasonType: "upstream",
    message: `AI 转发失败：${rawMessage || "未知错误"}`
  };
}

function loadCatalogBundleFromDisk() {
  const startedAt = Date.now();
  const body = fs.readFileSync(CATALOG_BUNDLE_PATH, "utf-8");
  const catalog = JSON.parse(body);
  if (!catalog || !Array.isArray(catalog.products) || !Array.isArray(catalog.parameters)) {
    throw new Error("CATALOG_BUNDLE_INVALID");
  }
  databaseCatalog = catalog;
  databaseCatalogBody = body;
  databaseCatalogGzipBody = zlib.gzipSync(Buffer.from(body, "utf-8"), { level: 9 });
  databaseCatalogEtag = `"catalog-${Buffer.byteLength(body)}-${databaseCatalogGzipBody.length}"`;
  databaseSourceMtimeMs = Number(catalog && catalog.source && catalog.source.mtimeMs) || getDatabaseSourceMtimeMs();
  const elapsed = Date.now() - startedAt;
  console.log(
    `参数库 JSON 已加载: ${catalog.products.length} 个产品, ${catalog.parameters.length} 条参数, ${elapsed}ms, gzip ${databaseCatalogGzipBody.length} bytes`
  );
}

function getDatabaseSourceMtimeMs() {
  try {
    return fs.statSync(DATABASE_SOURCE_PATH).mtimeMs;
  } catch (err) {
    return 0;
  }
}

function refreshDatabaseCatalogIfStale() {
  const sourceMtimeMs = getDatabaseSourceMtimeMs();
  if (!sourceMtimeMs) return;
  if (databaseCatalogBody && databaseSourceMtimeMs >= sourceMtimeMs) return;

  console.log("检测到 database.xlsx 有更新，正在重新编译参数库...");
  const compiled = compileDatabaseSourceForRuntime();
  if (!compiled && databaseCatalogBody) {
    return;
  }
  loadDatabaseCatalogOnce();
}

function loadDatabaseCatalogOnce() {
  if (!fs.existsSync(CATALOG_BUNDLE_PATH)) {
    console.warn("未找到 data/generated/catalog.bundle.json，请检查 data/database.xlsx 自动编译是否成功。");
    return;
  }
  try {
    loadCatalogBundleFromDisk();
  } catch (err) {
    databaseCatalog = null;
    databaseCatalogBody = "";
    databaseCatalogGzipBody = null;
    databaseCatalogEtag = "";
    console.warn(`参数库 JSON 读取失败: ${err.message}`);
    console.warn("本地服务仍会启动，但 /api/database 会暂时返回“参数库尚未加载”。");
  }
}

function getAdminController() {
  if (!adminController) {
    adminController = createAdminController({
      rootDir: ROOT_DIR,
      databaseSourcePath: DATABASE_SOURCE_PATH,
      getAiConfig: () => aiConfig,
      reloadDatabaseCatalog: () => {
        loadDatabaseCatalogOnce();
      }
    });
  }
  return adminController;
}

function createAppServer(port) {
  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${port}`}`);

    if (req.method === "OPTIONS") {
      setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (requestUrl.pathname === "/superzxy" || requestUrl.pathname === "/superzxy/") {
      if (req.method === "GET" || req.method === "HEAD") {
        getAdminController().servePage(req, res);
        return;
      }
      sendText(res, 405, "Method Not Allowed");
      return;
    }

    if (requestUrl.pathname === "/superzxy/admin.css" || requestUrl.pathname === "/superzxy/admin.js") {
      if (req.method === "GET" || req.method === "HEAD") {
        serveAdminStatic(req, res, requestUrl.pathname);
        return;
      }
      sendText(res, 405, "Method Not Allowed");
      return;
    }

    if (requestUrl.pathname.startsWith("/api/admin/")) {
      await getAdminController().handleApi(req, res, requestUrl);
      return;
    }

    if (requestUrl.pathname === "/api/usage/heartbeat" && req.method === "POST") {
      try {
        await getAdminController().handleUsageHeartbeat(req, res);
      } catch (err) {
        if (err.message === "BODY_TOO_LARGE") {
          sendJson(res, 413, { error: "请求体过大" });
          return;
        }
        if (err.message === "BAD_JSON") {
          sendJson(res, 400, { error: "请求体不是合法 JSON" });
          return;
        }
        if (err.message === "USAGE_ID_REQUIRED") {
          sendJson(res, 400, { error: "使用统计标识缺失" });
          return;
        }
        sendJson(res, Number(err.statusCode) || 500, { error: "使用统计上报失败" });
      }
      return;
    }

    if (requestUrl.pathname === "/api/analytics/event" && req.method === "POST") {
      try {
        await getAdminController().handleAnalyticsEvent(req, res);
      } catch (err) {
        if (err.message === "BODY_TOO_LARGE") {
          sendJson(res, 413, { error: "请求体过大" });
          return;
        }
        if (err.message === "BAD_JSON") {
          sendJson(res, 400, { error: "请求体不是合法 JSON" });
          return;
        }
        sendJson(res, Number(err.statusCode) || 500, { error: "统计事件上报失败" });
      }
      return;
    }

    if (requestUrl.pathname === "/api/site-notice" && (req.method === "GET" || req.method === "HEAD")) {
      getAdminController().handleSiteNotice(req, res);
      return;
    }

    if (requestUrl.pathname === "/api/app-settings" && (req.method === "GET" || req.method === "HEAD")) {
      getAdminController().handleAppSettings(req, res);
      return;
    }

    if (requestUrl.pathname === "/api/quote-parser/chat" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        await proxyChatCompletion(body, res);
      } catch (err) {
        if (err.message === "BODY_TOO_LARGE") {
          sendJson(res, 413, { error: "请求体过大" });
          return;
        }
        if (err.message === "BAD_JSON") {
          sendJson(res, 400, { error: "请求体不是合法 JSON" });
          return;
        }
        sendJson(res, 500, { error: `本地服务异常: ${err.message}` });
      }
      return;
    }

    if (requestUrl.pathname === "/api/feedback" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        await submitFeedback(req, body);
        sendJson(res, 200, { ok: true });
      } catch (err) {
        if (err.message === "BODY_TOO_LARGE") {
          sendJson(res, 413, { error: "请求体过大" });
          return;
        }
        if (err.message === "BAD_JSON") {
          sendJson(res, 400, { error: "请求体不是合法 JSON" });
          return;
        }
        if (err.message === "EMPLOYEE_ID_REQUIRED") {
          sendJson(res, 400, { error: "请填写工号" });
          return;
        }
        if (err.message === "SUGGESTION_REQUIRED") {
          sendJson(res, 400, { error: "请填写建议内容" });
          return;
        }
        if (err.message === "FEEDBACK_TOO_LONG") {
          sendJson(res, 400, { error: "反馈内容过长，请精简后再提交" });
          return;
        }
        console.warn(`反馈提交失败: ${err.message}${err.detail ? ` ${err.detail.slice(0, 200)}` : ""}`);
        sendJson(res, Number(err.statusCode) || 502, { error: "反馈提交失败，请稍后重试" });
      }
      return;
    }

    if (requestUrl.pathname === "/api/ai-flows" && (req.method === "GET" || req.method === "HEAD")) {
      const body = JSON.stringify({
        flows: getAiFlowStatus()
      });
      sendJsonBody(req, res, 200, body);
      return;
    }

    if (requestUrl.pathname === "/api/database" && (req.method === "GET" || req.method === "HEAD")) {
      refreshDatabaseCatalogIfStale();
      if (!databaseCatalogBody) {
        sendJson(res, 503, { error: "参数库尚未加载" });
        return;
      }
      const cacheHeaders = {
        "Cache-Control": "no-store",
        "ETag": databaseCatalogEtag,
        "Vary": "Accept-Encoding"
      };
      if (databaseCatalogEtag && req.headers["if-none-match"] === databaseCatalogEtag) {
        setCorsHeaders(res);
        res.writeHead(304, cacheHeaders);
        res.end();
        return;
      }
      if (databaseCatalogGzipBody && acceptsGzip(req)) {
        sendJsonBody(req, res, 200, databaseCatalogGzipBody, {
          headers: {
            ...cacheHeaders,
            "Content-Encoding": "gzip",
            "Content-Length": databaseCatalogGzipBody.length
          }
        });
        return;
      }
      sendJsonBody(req, res, 200, databaseCatalogBody, { headers: cacheHeaders });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      if (requestUrl.pathname === "/official") {
        res.writeHead(302, { Location: "/official/" });
        res.end();
        return;
      }
      if (requestUrl.pathname === "/official/" || requestUrl.pathname.startsWith("/official/")) {
        serveOfficialStatic(req, res, requestUrl.pathname);
        return;
      }
      if (requestUrl.pathname === "/ai-params" || requestUrl.pathname === "/ai-params/") {
        res.writeHead(302, { Location: "/" });
        res.end();
        return;
      }
      if (requestUrl.pathname.startsWith("/ai-params/")) {
        serveAiParamsStatic(req, res, requestUrl.pathname);
        return;
      }
      if (isAiParamsPublicPath(requestUrl.pathname)) {
        serveAiParamsStatic(req, res, requestUrl.pathname);
        return;
      }
      sendText(res, 404, "Not Found");
      return;
    }

    sendText(res, 405, "Method Not Allowed");
  });
}

function listenWithFallback(port) {
  const server = createAppServer(port);
  server.once("error", err => {
    if (err && err.code === "EADDRINUSE") {
      const nextPort = port + 1;
      if (nextPort > START_PORT + 20) {
        console.error("附近端口都被占用了，请稍后重试。");
        process.exit(1);
        return;
      }
      console.warn(`端口 ${port} 已被占用，尝试使用 ${nextPort} ...`);
      listenWithFallback(nextPort);
      return;
    }
    console.error(err);
    process.exit(1);
  });

  server.listen(port, HOST, () => {
    console.log(`本地服务已启动: http://${HOST}:${port}`);
  });
}

try {
  loadAiConfigFromDisk();
  compileDatabaseSourceForRuntime();
  loadDatabaseCatalogOnce();
  listenWithFallback(START_PORT);
} catch (err) {
  console.error(`本地服务启动失败: ${err.message}`);
  process.exit(1);
}
