const QUOTE_PRODUCT_ANALYZE_AI_FLOW_KEY="quote_product_analyze";
const QUOTE_PRODUCT_ANALYZE_AI_ENDPOINT="";
const QUOTE_PRODUCT_ANALYZE_AI_MODEL="";
const QUOTE_SELECT_AI_FLOW_KEY="quote_select";
const QUOTE_SELECT_AI_ENDPOINT="";
const QUOTE_SELECT_AI_MODEL="";
const QUOTE_SELECT_CONCURRENCY=100;
const REWRITE_AI_FLOW_KEY="rewrite";
const REWRITE_AI_ENDPOINT="";
const REWRITE_AI_MODEL="";
const FORMAT_AI_FLOW_KEY="format";
const FORMAT_AI_ENDPOINT="";
const FORMAT_AI_MODEL="";

function getQuoteSelectResponseFormat(){
  return {type:"json_object"};
}

function getQuoteProductAnalyzeResponseFormat(){
  return {type:"json_object"};
}

function compactAiValue(value){
  if(value===undefined || value===null) return "";
  if(Array.isArray(value)){
    return value.map(compactAiValue).map(item=>item.trim()).filter(Boolean).join("；");
  }
  if(typeof value==="object"){
    return Object.entries(value)
      .map(([key,item])=>{
        const text=compactAiValue(item);
        return text ? `${key}=${text}` : "";
      })
      .filter(Boolean)
      .join("；");
  }
  return toText(value).replace(/\s+/g," ").trim();
}

function compactAiLine(label,value){
  const text=compactAiValue(value);
  return text ? `${label}: ${text}` : "";
}

function preferNonEmptyArray(primary,fallback){
  return Array.isArray(primary) && primary.length ? primary : fallback;
}

function compactAiLines(lines){
  return lines.map(item=>toText(item).trim()).filter(Boolean).join("\n");
}

function compactAiListBlock(label,values){
  const sourceItems=Array.isArray(values) ? values : (values===undefined || values===null ? [] : [values]);
  const items=sourceItems
    .flatMap(item=>Array.isArray(item) ? item : [item])
    .map(item=>compactAiValue(item))
    .flatMap(item=>toText(item).split(/[，,;；\n]+/))
    .map(item=>item.trim())
    .filter(Boolean);
  return items.length ? `${label}:\n${items.map((item,index)=>`${index+1}. ${item}`).join("\n")}` : "";
}

function formatQuoteProductSimpleFactsForAi(product){
  return compactAiLines([
    compactAiLine("产品名称",product && product.quote_product_name),
    compactAiLine("产品型号",product && product.product_model),
    compactAiLine("产品说明",product && product.description),
    compactAiLine("产品备注",product && product.product_note)
  ]);
}

function formatQuoteProductForSelectAi(product,context={}){
  const analysis=product && product.product_analysis && typeof product.product_analysis==="object"
    ? product.product_analysis
    : {};
  const purchasedModules=preferNonEmptyArray(analysis.purchased_modules,product && product.modules);
  const moduleBlock=compactAiListBlock("已开通模块",purchasedModules);
  return moduleBlock ? moduleBlock.split("\n").slice(1).join("\n") : "无";
}

function formatCandidateCatalogForAi(candidateCatalog){
  const catalog=candidateCatalog && typeof candidateCatalog==="object" ? candidateCatalog : {};
  const products=Array.isArray(catalog.products) ? catalog.products : [];
  const catalogProduct=products[0] || {};
  const params=Array.isArray(catalogProduct.params) ? catalogProduct.params : [];
  return compactAiLines([
    compactAiLine("参数库产品",[
      catalogProduct.database_name,
      catalogProduct.product_line,
      catalogProduct.version
    ].filter(Boolean).join(" / ")),
    "全量参数:",
    ...params.map(param=>{
      const vendorSupport=compactVendorSupport(param && param.vendor_support);
      return [
        `#${compactAiValue(param && param.param_id)}`,
        compactAiLine("标题",param && param.title).replace(/^标题: /,"标题="),
        compactAiLine("类型",param && param.type).replace(/^类型: /,"类型="),
        compactAiLine("模块",param && param.module).replace(/^模块: /,"模块="),
        compactAiLine("功能项",param && param.function_item).replace(/^功能项: /,"功能项="),
        compactAiLine("依赖模块",param && param.requires_module).replace(/^依赖模块: /,"依赖模块="),
        compactAiLine("厂商支持",vendorSupport).replace(/^厂商支持: /,"厂商支持="),
        compactAiLine("正文",param && param.content).replace(/^正文: /,"正文="),
        compactAiLine("备注",param && param.remark).replace(/^备注: /,"备注=")
      ].map(item=>toText(item).trim()).filter(Boolean).join(" | ");
    })
  ]);
}

function compactVendorSupport(entries){
  if(!Array.isArray(entries)) return "";
  return entries
    .map(item=>{
      const vendor=compactAiValue(item && item.vendor);
      const status=compactAiValue(item && item.status);
      return vendor && status ? `${vendor}:${status}` : "";
    })
    .filter(Boolean)
    .join(",");
}

function formatQuoteSelectStrategyForAi(strategy){
  const levelMap={
    public:"公参",
    general:"一般控",
    strict:"控死"
  };
  const vendors=Array.isArray(strategy && strategy.target_vendors)
    ? strategy.target_vendors.map(item=>toText(item).trim()).filter(Boolean)
    : [];
  return compactAiLines([
    compactAiLine("目标参数数量",`${Number(strategy && strategy.target_param_count) || 15}条`),
    compactAiLine("把控力度",levelMap[toText(strategy && strategy.control_level).trim()] || "一般控"),
    compactAiLine("控标厂商",vendors.length ? vendors.join("、") : "未指定")
  ]);
}

function buildQuoteSelectInputText(quoteAnalysis,candidateCatalog,strategy,productRule){
  const quoteText=typeof quoteAnalysis==="string"
    ? quoteAnalysis.trim()
    : formatQuoteProductForSelectAi((quoteAnalysis && quoteAnalysis.quote_products && quoteAnalysis.quote_products[0]) || {},quoteAnalysis || {});
  const catalogText=typeof candidateCatalog==="string"
    ? candidateCatalog.trim()
    : formatCandidateCatalogForAi(candidateCatalog);
  return compactAiLines([
    "[已开通模块]",
    quoteText,
    "",
    "[生成策略]",
    formatQuoteSelectStrategyForAi(strategy || {}),
    "",
    "[参数库]",
    catalogText
  ]);
}

function stripLocalAllocationHints(value){
  if(Array.isArray(value)){
    return value.map(stripLocalAllocationHints);
  }
  if(value && typeof value==="object"){
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key])=>!/^(?:per_device|allocated|final_hardware|local_base|base_param|component_interpretation|ai_first_hardware_param)/i.test(key))
        .map(([key,item])=>[key,stripLocalAllocationHints(item)])
    );
  }
  return value;
}

function buildQuoteProductAnalyzeInputText(quoteProduct,options={}){
  const product=quoteProduct && typeof quoteProduct==="object" ? quoteProduct : {};
  return formatQuoteProductSimpleFactsForAi(product);
}

function buildQuoteProductAnalyzePayload(settings,quoteProduct,options={}){
  const payload={
    model:settings.model,
    messages:[
      {
        role:"user",
        content:buildQuoteProductAnalyzeInputText(quoteProduct,options)
      }
    ],
    temperature:0,
    stream:false,
    detail:false,
    response_format:getQuoteProductAnalyzeResponseFormat()
  };
  if(toText(options.chatId).trim()){
    payload.chatId=toText(options.chatId).trim();
  }
  payload.flowKey=toText(settings.flowKey).trim();
  return payload;
}

async function requestAiCompletion(settings,payload){
  const flowKey=toText(settings.flowKey).trim();
  if(!flowKey){
    throw new Error("AI_CONFIG_MISSING");
  }
  const requestPayload={...payload};
  if(!toText(requestPayload.model).trim()){
    delete requestPayload.model;
  }
  const response=await fetch(getQuoteProxyEndpoint(),{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      flowKey,
      ...requestPayload
    })
  });
  if(!response.ok){
    const errorText=await response.text();
    let errorPayload=null;
    try{
      errorPayload=JSON.parse(errorText);
    }catch(parseErr){
      // keep raw error text
    }
    const error=new Error(
      errorPayload && errorPayload.error
        ? errorPayload.error
        : (errorText || `AI_PROXY_${response.status}`)
    );
    error.status=response.status;
    if(errorPayload && typeof errorPayload==="object"){
      error.code=errorPayload.code || "";
      error.reasonType=errorPayload.reasonType || "";
    }
    throw error;
  }
  const data=await response.json();
  const workflowError=getWorkflowNodeError(data);
  if(workflowError){
    throw new Error(workflowError);
  }
  return data;
}

function getQuoteProxyEndpoint(){
  if(window.location.protocol==="http:" || window.location.protocol==="https:"){
    return `${window.location.origin}/api/quote-parser/chat`;
  }
  throw new Error("HTTP_REQUIRED");
}

function buildQuoteSelectPayload(settings,quoteStandardText,catalogText,strategy=null,options={}){
  const content=buildQuoteSelectInputText(quoteStandardText,catalogText,strategy || null,options.productRule || null);
  const payload={
    model:settings.model,
    messages:[
      {
        role:"user",
        content
      }
    ],
    temperature:0,
    stream:false,
    detail:false,
    response_format:getQuoteSelectResponseFormat()
  };
  if(toText(options.chatId).trim()){
    payload.chatId=toText(options.chatId).trim();
  }
  payload.flowKey=toText(settings.flowKey).trim();
  return payload;
}
