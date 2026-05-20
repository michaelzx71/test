import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("../public/vendor/xlsx.full.min.js");

const FIELD_ALIASES = {
  module: ["module", "项目", "模块", "一级分类"],
  functionItem: ["function_item", "功能项", "指标", "细分指标项"],
  title: ["title", "标题", "参数标题", "功能项", "指标", "细分指标项"],
  content: ["content", "内容", "参数内容", "描述", "功能要求说明", "参数要求", "具体参数描述"],
  isStar: ["is_star", "type", "星级", "是否公有项", "参数类型", "重要性", "控标类型"],
  imageProof: ["image_proof", "图像证明", "图片证明", "图证", "是否提供截图", "是否提供截图或彩页证明", "是否提供截图 / 或彩页证明", "是否提供功能截图证明"],
  qualificationProof: ["qualification_proof", "资质证明", "资质", "是否提供资质证明", "是否提供 / 资质证明", "是否提供/资质证明", "是否有CMA报告证明"],
  remark: ["remark", "备注", "说明", "备注说明", "风险说明", "控标参数质疑应答话术"],
  requiresModule: ["requires_module", "是否需要购买模块", "需开通的模块", "产品授权", "授权"],
  tags: ["tags", "标签"],
  enabled: ["enabled", "是否启用"],
  aiSelectVisible: ["ai_select_visible", "AI筛选可见", "AI筛选是否可见", "是否上传AI", "是否上传给AI", "参数筛选可见"],
  refDocName: [
    "ref_doc_name",
    "reference_doc_name",
    "doc_name",
    "doc_version_name",
    "参考文档",
    "参考文档名称",
    "参考版本文档名称",
    "版本文档名称"
  ],
  refDocUpdatedAt: [
    "ref_doc_updated_at",
    "reference_doc_updated_at",
    "doc_updated_at",
    "更新时间",
    "文档更新时间",
    "参考文档更新时间"
  ],
  firstCategory: ["一级分类"],
  secondCategory: ["二级分类"],
  thirdCategory: ["三级分类"]
};

const WORKBOOK_CONFIG_SHEET_NAMES = new Set([
  "全局提示词",
  "ai提示词",
  "ai提示词模板",
  "提示词模板",
  "工作流提示词",
  "产品规则模板",
  "产品规则",
  "产品匹配规则",
  "规则模板",
  "产品模板"
]);

const PRODUCT_MATCH_RULE_SHEET_NAME = "产品匹配规则";

const MATCH_RULE_FIELD_ALIASES = {
  enabled: ["是否启用", "enabled"],
  priority: ["优先级", "priority", "排序"],
  ruleId: ["规则编号", "rule_id", "规则ID"],
  modelPattern: ["型号匹配", "model_pattern", "产品型号匹配"],
  keywordPattern: ["关键词匹配", "keyword_pattern", "关键词"],
  targetProduct: ["目标参数库产品", "target_product", "参数库产品"],
  description: ["说明", "备注", "description"]
};

function toText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function normalizeFieldKey(key) {
  return toText(key)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\\/／-]+/g, "_")
    .replace(/[()（）?？]/g, "");
}

function getPreferredCellValue(cell) {
  if (!cell) return "";
  if (cell.w !== undefined && cell.w !== null && toText(cell.w).trim() !== "") {
    return cell.w;
  }
  return cell.v;
}

function getSheetCellText(sheet, address, fallback = "") {
  const value = getPreferredCellValue(sheet && sheet[address]);
  const text = toText(value).trim();
  return text || fallback;
}

function getFirstFieldValue(obj, keys, fallback = "") {
  if (!obj) return fallback;
  const normalizedFieldMap = {};
  Object.keys(obj).forEach(key => {
    normalizedFieldMap[normalizeFieldKey(key)] = obj[key];
  });

  for (const key of keys) {
    const normalizedKey = normalizeFieldKey(key);
    if (!Object.prototype.hasOwnProperty.call(normalizedFieldMap, normalizedKey)) continue;
    const value = toText(normalizedFieldMap[normalizedKey]).trim();
    if (value) return value;
  }
  return fallback;
}

function parseBooleanEnabled(value) {
  const text = toText(value).trim().toLowerCase();
  if (!text) return true;
  return !["否", "no", "false", "0", "禁用", "停用"].includes(text);
}

function parseAiSelectVisible(value) {
  const text = toText(value).trim().toLowerCase();
  if (!text) return true;
  return !["否", "no", "false", "0", "隐藏", "不上传", "不上传ai", "不上传给ai"].includes(text);
}

function splitTags(value) {
  return toText(value)
    .split(/[，,、;；\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeParamData(rawParam) {
  const param = { ...rawParam };
  param.module = getFirstFieldValue(rawParam, FIELD_ALIASES.module, toText(rawParam.module));
  param.function_item = getFirstFieldValue(rawParam, FIELD_ALIASES.functionItem, toText(rawParam.function_item));
  param.title = getFirstFieldValue(rawParam, FIELD_ALIASES.title, toText(rawParam.title));
  if (!toText(param.title).trim()) {
    param.title = toText(param.function_item || param.module || "无标题");
  }
  param.content = getFirstFieldValue(rawParam, FIELD_ALIASES.content, toText(rawParam.content));
  param.type = getFirstFieldValue(rawParam, FIELD_ALIASES.isStar, toText(rawParam.type));
  if (["/", "／", "★", "★★", "▲", "▲▲"].includes(toText(param.content).trim()) && toText(param.type).trim().length > 20) {
    const marker = toText(param.content).trim();
    param.content = param.type;
    param.type = marker === "/" || marker === "／" ? "" : marker;
  }
  param.is_star = param.type;
  param.image_proof = getFirstFieldValue(rawParam, FIELD_ALIASES.imageProof, toText(rawParam.image_proof));
  param.qualification_proof = getFirstFieldValue(rawParam, FIELD_ALIASES.qualificationProof, toText(rawParam.qualification_proof));
  param.remark = getFirstFieldValue(rawParam, FIELD_ALIASES.remark, toText(rawParam.remark));
  param.requires_module = getFirstFieldValue(rawParam, FIELD_ALIASES.requiresModule, toText(rawParam.requires_module));
  param.tags = splitTags(getFirstFieldValue(rawParam, FIELD_ALIASES.tags, toText(rawParam.tags)));
  param.enabled = parseBooleanEnabled(getFirstFieldValue(rawParam, FIELD_ALIASES.enabled, toText(rawParam.enabled, "是")));
  param.ai_select_visible = parseAiSelectVisible(getFirstFieldValue(rawParam, FIELD_ALIASES.aiSelectVisible, "是"));
  param.vendor_support = rawParam.vendor_support && typeof rawParam.vendor_support === "object"
    ? rawParam.vendor_support
    : {};
  param.vendor_headers = Array.isArray(rawParam.vendor_headers)
    ? rawParam.vendor_headers.map(item => toText(item).trim()).filter(Boolean)
    : [];
  param.ref_doc_name = getFirstFieldValue(rawParam, FIELD_ALIASES.refDocName, toText(rawParam.ref_doc_name));
  param.ref_doc_updated_at = getFirstFieldValue(rawParam, FIELD_ALIASES.refDocUpdatedAt, toText(rawParam.ref_doc_updated_at));
  return param;
}

function isValidParamData(param) {
  const title = toText(param && param.title).trim();
  const content = toText(param && param.content).trim();
  return Boolean((title || content) && (!param || param.enabled !== false));
}

function extractProductMeta(sheet, sheetParams, sheetName) {
  const fromCellDocName = getSheetCellText(sheet, "D1");
  const fromCellUpdatedAt = getSheetCellText(sheet, "D2");

  if (fromCellDocName || fromCellUpdatedAt) {
    return {
      refDocName: fromCellDocName,
      refDocUpdatedAt: fromCellUpdatedAt,
      warning: ""
    };
  }

  const docNameList = [...new Set(
    sheetParams.map(param => toText(param.ref_doc_name).trim()).filter(Boolean)
  )];
  const updatedAtList = [...new Set(
    sheetParams.map(param => toText(param.ref_doc_updated_at).trim()).filter(Boolean)
  )];

  const warningParts = [];
  if (docNameList.length > 1) warningParts.push("参考文档名称存在多值");
  if (updatedAtList.length > 1) warningParts.push("更新时间存在多值");

  return {
    refDocName: docNameList[0] || "",
    refDocUpdatedAt: updatedAtList[0] || "",
    warning: warningParts.length ? `工作表「${sheetName}」${warningParts.join("，")}，已按第一条显示` : ""
  };
}

function findHeaderRole(headerText) {
  const normalizedHeader = normalizeFieldKey(headerText);
  if (!normalizedHeader) return "";
  for (const [role, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some(alias => normalizeFieldKey(alias) === normalizedHeader)) {
      return role;
    }
  }
  return "";
}

function isWorkbookConfigSheetName(sheetName) {
  const normalized = normalizeFieldKey(sheetName);
  return Array.from(WORKBOOK_CONFIG_SHEET_NAMES).some(name => normalizeFieldKey(name) === normalized);
}

function isProductMatchRuleSheetName(sheetName) {
  return normalizeFieldKey(sheetName) === normalizeFieldKey(PRODUCT_MATCH_RULE_SHEET_NAME);
}

function getProductKey(productLine, version, sheetName) {
  const line = toText(productLine).trim() || toText(sheetName).trim();
  const versionText = toText(version).trim();
  return versionText ? `${line}|${versionText}` : line;
}

function isKnownParameterHeader(headerText) {
  return Boolean(findHeaderRole(headerText));
}

function getVendorSupportHeaders(headers) {
  return Object.entries(headers)
    .filter(([, header]) => !isKnownParameterHeader(header))
    .filter(([, header]) => toText(header).trim())
    .map(([col, header]) => ({ col: Number(col), header: toText(header).trim() }));
}

function findParameterHeader(sheet, range) {
  let best = null;
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 8); r++) {
    const headers = {};
    const roles = new Set();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      const headerText = toText(getPreferredCellValue(cell)).trim();
      if (!headerText) continue;
      headers[c] = headerText;
      const role = findHeaderRole(headerText);
      if (role) roles.add(role);
    }

    let score = roles.size;
    if (roles.has("content")) score += 5;
    if (roles.has("isStar")) score += 2;
    if (roles.has("module")) score += 1;
    if (score >= 6 && (!best || score > best.score)) {
      best = { row: r, headers, score };
    }
  }
  return best;
}

function findHeaderRow(sheet, range, requiredAliases) {
  const requiredKeys = requiredAliases.map(normalizeFieldKey);
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 8); r++) {
    const headers = {};
    const normalizedHeaders = new Set();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      const headerText = toText(getPreferredCellValue(cell)).trim();
      if (!headerText) continue;
      headers[c] = headerText;
      normalizedHeaders.add(normalizeFieldKey(headerText));
    }
    if (requiredKeys.every(key => normalizedHeaders.has(key))) {
      return { row: r, headers };
    }
  }
  return null;
}

function getRuleFieldValue(rawRule, aliases, fallback = "") {
  return getFirstFieldValue(rawRule, aliases, fallback);
}

function splitRulePattern(value) {
  return toText(value)
    .split(/[\n,，;；]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function loadProductMatchRules(workbook) {
  const sheetName = workbook.SheetNames.find(isProductMatchRuleSheetName);
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headerInfo = findHeaderRow(sheet, range, ["规则编号", "目标参数库产品"]);
  if (!headerInfo) return [];
  const rules = [];
  for (let r = headerInfo.row + 1; r <= range.e.r; r++) {
    const rawRule = {};
    let hasData = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = headerInfo.headers[c];
      if (!header) continue;
      const value = getPreferredCellValue(sheet[XLSX.utils.encode_cell({ r, c })]);
      if (toText(value).trim()) hasData = true;
      rawRule[header] = value;
    }
    if (!hasData) continue;
    const enabled = parseBooleanEnabled(getRuleFieldValue(rawRule, MATCH_RULE_FIELD_ALIASES.enabled, "是"));
    const targetProduct = getRuleFieldValue(rawRule, MATCH_RULE_FIELD_ALIASES.targetProduct).trim();
    const modelPatterns = splitRulePattern(getRuleFieldValue(rawRule, MATCH_RULE_FIELD_ALIASES.modelPattern));
    const keywordPatterns = splitRulePattern(getRuleFieldValue(rawRule, MATCH_RULE_FIELD_ALIASES.keywordPattern));
    if (!enabled || !targetProduct || (!modelPatterns.length && !keywordPatterns.length)) continue;
    rules.push({
      enabled,
      priority: Number(getRuleFieldValue(rawRule, MATCH_RULE_FIELD_ALIASES.priority)) || 100,
      rule_id: getRuleFieldValue(rawRule, MATCH_RULE_FIELD_ALIASES.ruleId).trim() || `rule-${rules.length + 1}`,
      model_patterns: modelPatterns,
      keyword_patterns: keywordPatterns,
      target_product: targetProduct,
      description: getRuleFieldValue(rawRule, MATCH_RULE_FIELD_ALIASES.description).trim()
    });
  }
  return rules.sort((a, b) => a.priority - b.priority || a.rule_id.localeCompare(b.rule_id));
}

function excelSerialDateToText(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 20000 || number > 80000) return "";
  const utcDays = Math.floor(number - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeMetaValue(key, value) {
  const text = toText(value).trim();
  if (normalizeFieldKey(key).includes("更新时间")) {
    return excelSerialDateToText(text) || text;
  }
  return text;
}

function extractTopRowMeta(sheet, range) {
  const meta = {};
  const firstRow = range.s.r;
  for (let c = range.s.c; c <= range.e.c; c += 2) {
    const key = toText(getPreferredCellValue(sheet[XLSX.utils.encode_cell({ r: firstRow, c })])).trim();
    if (!key) continue;
    const value = getPreferredCellValue(sheet[XLSX.utils.encode_cell({ r: firstRow, c: c + 1 })]);
    meta[normalizeFieldKey(key)] = normalizeMetaValue(key, value);
  }
  return {
    firstCategory: meta[normalizeFieldKey("一级分类")] || "",
    secondCategory: meta[normalizeFieldKey("二级分类")] || "",
    thirdCategory: meta[normalizeFieldKey("三级分类")] || "",
    refDocName: meta[normalizeFieldKey("参考参数版本")] || meta[normalizeFieldKey("参考文档")] || "",
    refDocUpdatedAt: meta[normalizeFieldKey("更新时间")] || ""
  };
}

function parseSheetNameMeta(sheetName) {
  const rawName = toText(sheetName).trim();
  if (!rawName) {
    return {
      productLine: "未命名产品",
      version: "",
      displayName: "未命名产品"
    };
  }

  const normalized = rawName.replace(/[－—_]/g, "-");
  const parts = normalized.split("-").map(item => item.trim()).filter(Boolean);
  const productLine = parts[0] || rawName;
  const version = parts.length > 1 ? parts.slice(1).join("-") : "";

  return {
    productLine,
    version,
    displayName: version ? `${productLine}（${version}）` : productLine
  };
}

function resolveDatabaseSourcePath(sourcePathOrBaseDir) {
  const inputPath = path.resolve(sourcePathOrBaseDir);
  const stats = fs.statSync(inputPath);
  if (stats.isFile()) return inputPath;

  const dataPath = path.join(inputPath, "data", "database.xlsx");
  if (fs.existsSync(dataPath)) return dataPath;
  return path.join(inputPath, "database.xlsx");
}

export function loadDatabaseCatalog(sourcePathOrBaseDir) {
  const sourcePath = resolveDatabaseSourcePath(sourcePathOrBaseDir);
  const stats = fs.statSync(sourcePath);
  const workbook = XLSX.read(fs.readFileSync(sourcePath), { type: "buffer" });

  const products = [];
  const parameters = [];
  const matchRules = loadProductMatchRules(workbook);
  let productId = 1;
  let parameterId = 1;
  let skippedSheetCount = 0;
  const metaWarnings = [];

  workbook.SheetNames.forEach(sheetName => {
    if (isWorkbookConfigSheetName(sheetName)) {
      return;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) {
      skippedSheetCount++;
      return;
    }

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const topMeta = extractTopRowMeta(sheet, range);
    const category = topMeta.firstCategory || getSheetCellText(sheet, "B1", "未分类");
    const sheetMeta = parseSheetNameMeta(sheetName);
    const productLine = topMeta.secondCategory || sheetMeta.productLine;
    const version = topMeta.thirdCategory || sheetMeta.version;
    const name = version ? `${productLine}（${version}）` : sheetMeta.displayName;
    const headerInfo = findParameterHeader(sheet, range);
    const sheetParams = [];

    if (!headerInfo) {
      skippedSheetCount++;
      return;
    }

    const headers = { ...headerInfo.headers };
    const vendorHeaders = getVendorSupportHeaders(headers);
    const moduleColumn = Number(Object.keys(headers).find(col => findHeaderRole(headers[col]) === "module"));
    const functionColumn = Number(Object.keys(headers).find(col => findHeaderRole(headers[col]) === "functionItem"));
    let lastModule = "";
    let lastFunctionItem = "";

    for (let r = headerInfo.row + 1; r <= range.e.r; r++) {
      const rawParam = {};
      const vendorSupport = {};
      let hasData = false;

      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        const header = headers[c];
        if (!header) continue;
        rawParam[header] = getPreferredCellValue(cell);
        hasData = true;
      }

      vendorHeaders.forEach(item => {
        const cell = sheet[XLSX.utils.encode_cell({ r, c: item.col })];
        const value = toText(getPreferredCellValue(cell)).trim();
        if (value) {
          vendorSupport[item.header] = value;
        }
      });

      const rawModule = Number.isFinite(moduleColumn)
        ? toText(getPreferredCellValue(sheet[XLSX.utils.encode_cell({ r, c: moduleColumn })])).trim()
        : getFirstFieldValue(rawParam, FIELD_ALIASES.module, "");
      const rawFunctionItem = Number.isFinite(functionColumn)
        ? toText(getPreferredCellValue(sheet[XLSX.utils.encode_cell({ r, c: functionColumn })])).trim()
        : getFirstFieldValue(rawParam, FIELD_ALIASES.functionItem, "");

      if (rawModule) {
        lastModule = rawModule;
      } else if (lastModule) {
        rawParam.module = lastModule;
      }
      if (rawFunctionItem) {
        lastFunctionItem = rawFunctionItem;
      } else if (lastFunctionItem) {
        rawParam.function_item = lastFunctionItem;
      }

      rawParam.vendor_support = vendorSupport;
      rawParam.vendor_headers = vendorHeaders.map(item => item.header);
      if (!hasData) continue;

      const normalizedParam = normalizeParamData(rawParam);
      if (isValidParamData(normalizedParam)) {
        sheetParams.push(normalizedParam);
      }
    }

    if (sheetParams.length === 0) {
      skippedSheetCount++;
      return;
    }

    const productMeta = extractProductMeta(sheet, sheetParams, sheetName);
    if (topMeta.refDocName || topMeta.refDocUpdatedAt) {
      productMeta.refDocName = topMeta.refDocName || productMeta.refDocName;
      productMeta.refDocUpdatedAt = topMeta.refDocUpdatedAt || productMeta.refDocUpdatedAt;
      productMeta.warning = "";
    }
    if (productMeta.warning) {
      metaWarnings.push(productMeta.warning);
    }

    const productKey = getProductKey(productLine, version, sheetName);
    const product = {
      id: productId,
      category,
      sheetName,
      productKey,
      productLine,
      version,
      name,
      refDocName: productMeta.refDocName,
      refDocUpdatedAt: productMeta.refDocUpdatedAt,
      vendorHeaders: vendorHeaders.map(item => item.header)
    };
    products.push(product);

    sheetParams.forEach(param => {
      parameters.push({ ...param, id: parameterId++, product_id: productId });
    });
    productId++;
  });

  return {
    format: "database_catalog_v1",
    source: {
      name: path.basename(sourcePath),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      loadedAt: new Date().toISOString()
    },
	    products,
	    parameters,
	    matchRules,
	    skippedSheetCount,
	    metaWarnings
	  };
}

function getFileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJsonFile(filePath, data, pretty = true) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, pretty ? 2 : 0), "utf-8");
}

function normalizeCatalogLookupKey(value) {
  return toText(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()\-_/｜|]/g, "");
}

function buildProductLookupKeys(product) {
  return [
    product && product.name,
    product && product.sheetName,
    product && product.productKey,
    product && product.productLine,
    product && product.version,
    product && product.productLine && product.version ? `${product.productLine}${product.version}` : "",
    product && product.productLine && product.version ? `${product.productLine}-${product.version}` : ""
  ]
    .map(normalizeCatalogLookupKey)
    .filter(Boolean);
}

function buildMatchRuleIssues(catalog) {
  const productLookupKeys = new Set(catalog.products.flatMap(buildProductLookupKeys));
  const ruleIdCounts = new Map();
  catalog.matchRules.forEach(rule => {
    const ruleId = toText(rule.rule_id).trim();
    if (!ruleId) return;
    ruleIdCounts.set(ruleId, (ruleIdCounts.get(ruleId) || 0) + 1);
  });

  return catalog.matchRules.flatMap(rule => {
    const issues = [];
    const targetKey = normalizeCatalogLookupKey(rule.target_product);
    if (targetKey && !productLookupKeys.has(targetKey)) {
      issues.push({
        rule_id: rule.rule_id,
        severity: "warning",
        type: "target_product_not_found",
        message: `产品匹配规则「${rule.rule_id}」的目标参数库产品「${rule.target_product}」未匹配到参数库产品`
      });
    }
    if (ruleIdCounts.get(toText(rule.rule_id).trim()) > 1) {
      issues.push({
        rule_id: rule.rule_id,
        severity: "warning",
        type: "duplicate_rule_id",
        message: `产品匹配规则编号「${rule.rule_id}」重复`
      });
    }
    return issues;
  });
}

function buildCompileReport(catalog, meta) {
  const duplicateProductNames = [];
  const productNameCounts = new Map();
  catalog.products.forEach(product => {
    const name = toText(product.name || product.sheetName).trim();
    if (!name) return;
    productNameCounts.set(name, (productNameCounts.get(name) || 0) + 1);
  });
  productNameCounts.forEach((count, name) => {
    if (count > 1) duplicateProductNames.push({ name, count });
  });
  const matchRuleIssues = buildMatchRuleIssues(catalog);

  return {
    format: "compile_report_v1",
    built_at: meta.built_at,
    source_file_hash: meta.source_file_hash,
	    summary: {
	      product_count: meta.product_count,
	      parameter_count: meta.parameter_count,
	      skipped_sheet_count: meta.skipped_sheet_count,
      warning_count: catalog.metaWarnings.length + matchRuleIssues.length,
      duplicate_product_name_count: duplicateProductNames.length,
      match_rule_issue_count: matchRuleIssues.length
    },
    warnings: catalog.metaWarnings,
    duplicate_product_names: duplicateProductNames,
    match_rule_issues: matchRuleIssues
  };
}

export function compileDatabaseCatalogFiles(baseDir) {
  const rootDir = path.resolve(baseDir);
  const dataDir = path.join(rootDir, "data");
  const generatedDir = path.join(dataDir, "generated");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });

  const sourcePath = resolveDatabaseSourcePath(rootDir);
  const sourceStats = fs.statSync(sourcePath);
  const startedAt = Date.now();
  const catalog = loadDatabaseCatalog(sourcePath);
  const builtAt = new Date().toISOString();
  const meta = {
    format: "catalog_meta_v1",
    version: builtAt.replace(/[-:.TZ]/g, "").slice(0, 14),
    built_at: builtAt,
    source_file: path.relative(rootDir, sourcePath),
    source_file_hash: getFileHash(sourcePath),
    source_file_size: sourceStats.size,
    source_file_mtime_ms: sourceStats.mtimeMs,
	    product_count: catalog.products.length,
	    parameter_count: catalog.parameters.length,
	    skipped_sheet_count: catalog.skippedSheetCount,
    warning_count: catalog.metaWarnings.length
  };
  const report = buildCompileReport(catalog, meta);

  fs.writeFileSync(path.join(generatedDir, "catalog.bundle.json"), JSON.stringify(catalog), "utf-8");
  writeJsonFile(path.join(generatedDir, "catalog.meta.json"), meta);
  writeJsonFile(path.join(generatedDir, "compile-report.json"), report);

  return {
    catalog,
    meta,
    report,
    elapsed: Date.now() - startedAt
  };
}
