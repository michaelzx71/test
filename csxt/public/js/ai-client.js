const QUOTE_PRODUCT_ANALYZE_AI_FLOW_KEY="quote_product_analyze";
const QUOTE_PRODUCT_ANALYZE_AI_ENDPOINT="";
const QUOTE_PRODUCT_ANALYZE_AI_MODEL="";
const QUOTE_SELECT_AI_FLOW_KEY="quote_select";
const QUOTE_SELECT_AI_ENDPOINT="";
const QUOTE_SELECT_AI_MODEL="";
const REWRITE_AI_FLOW_KEY="rewrite";
const REWRITE_AI_ENDPOINT="";
const REWRITE_AI_MODEL="";
const FORMAT_AI_FLOW_KEY="format";
const FORMAT_AI_ENDPOINT="";
const FORMAT_AI_MODEL="";
const AI_CLIENT_RETRY_ATTEMPTS=2;

function getQuoteSelectResponseFormat(){
  return {type:"json_object"};
}

function getQuoteProductAnalyzeResponseFormat(){
  return {type:"json_object"};
}

function normalizeAiClientText(value){
  if(value===undefined || value===null) return "";
  if(typeof value==="string") return value;
  try{
    return JSON.stringify(value);
  }catch(err){
    return String(value);
  }
}

function decodeBasicHtmlEntities(text){
  return normalizeAiClientText(text)
    .replace(/&quot;/g,'"')
    .replace(/&#47;/g,"/")
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&#39;/g,"'");
}

function stripHtmlForAiError(text){
  return decodeBasicHtmlEntities(text)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function getReadableAiClientErrorMessage(rawText,status=0){
  const text=normalizeAiClientText(rawText).trim();
  const numericStatus=Number(status) || 0;
  if(!text && numericStatus){
    return `AI 接口请求失败（HTTP ${numericStatus}）`;
  }
  const looksLikeHtml=/<!doctype html|<html[\s>]|<\/html>|sf-webproxy|aTrust/i.test(text);
  if(looksLikeHtml){
    const decoded=decodeBasicHtmlEntities(text);
    const statusDesc=(decoded.match(/statusDesc\s*=\s*"([^"]+)"/) || [])[1] || "";
    const reason=(decoded.match(/reason\s*=\s*"([^"]*)"\s*\?/) || [])[1] || "";
    const suggestion=(decoded.match(/suggestion\s*=\s*"([^"]*)"\s*\?/) || [])[1] || "";
    const parts=[statusDesc,reason,suggestion].map(item=>item.trim()).filter(Boolean);
    if(parts.length) return parts.join("；");
    const stripped=stripHtmlForAiError(text);
    return stripped
      ? stripped.slice(0,240)
      : `AI 接口等待时间较长或上游服务不可用（HTTP ${numericStatus || 504}），FastGPT 供应商繁忙时可能仍在后台生成。`;
  }
  if(numericStatus===502 || numericStatus===503 || numericStatus===504){
    return text
      ? stripHtmlForAiError(text).slice(0,240)
      : `AI 接口等待时间较长或上游服务不可用（HTTP ${numericStatus}），请稍后重试或检查零信任/FastGPT 应用服务器。`;
  }
  if(text.length>500){
    return stripHtmlForAiError(text).slice(0,300);
  }
  return text;
}

function isRetryableAiClientError(error){
  const status=Number(error && error.status) || 0;
  const code=normalizeAiClientText(error && error.code);
  const reasonType=normalizeAiClientText(error && error.reasonType);
  const message=normalizeAiClientText(error && error.message);
  if(status===429 || status===502 || status===503 || status===504) return true;
  if(code==="AI_UPSTREAM_TIMEOUT" || code==="AI_RATE_LIMITED") return true;
  if(reasonType==="timeout" || reasonType==="network" || reasonType==="rate_limit") return true;
  if(/Failed to fetch|NetworkError|Load failed|请求超时|响应超时|上游服务不可用|应用服务器连接失败/i.test(message)) return true;
  return false;
}

function waitAiClientRetry(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function buildRetryPayload(payload,attemptIndex){
  const requestPayload={...payload};
  if(!toText(requestPayload.model).trim()){
    delete requestPayload.model;
  }
  if(attemptIndex>0 && toText(requestPayload.chatId).trim()){
    requestPayload.chatId=`${toText(requestPayload.chatId).trim()}-retry${attemptIndex+1}`;
  }
  return requestPayload;
}

async function requestAiCompletionOnce(settings,payload,attemptIndex=0){
  const requestPayload=buildRetryPayload(payload,attemptIndex);
  const response=await fetch(getQuoteProxyEndpoint(),{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      flowKey:toText(settings.flowKey).trim(),
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
    const rawMessage=errorPayload && errorPayload.error
      ? errorPayload.error
      : (errorText || `AI_PROXY_${response.status}`);
    const error=new Error(getReadableAiClientErrorMessage(rawMessage,response.status));
    error.status=response.status;
    if(errorPayload && typeof errorPayload==="object"){
      error.code=errorPayload.code || "";
      error.reasonType=errorPayload.reasonType || "";
    }else if(response.status===502 || response.status===503 || response.status===504){
      error.code="AI_UPSTREAM_TIMEOUT";
      error.reasonType="timeout";
    }
    throw error;
  }
  const data=await response.json();
  const workflowError=getWorkflowNodeError(data);
  if(workflowError){
    const error=new Error(getReadableAiClientErrorMessage(workflowError));
    if(isRetryableAiClientError(error)){
      error.code="AI_UPSTREAM_TIMEOUT";
      error.reasonType="timeout";
    }
    throw error;
  }
  return data;
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
  const rawTargetParamCount=Number(strategy && strategy.target_param_count);
  const targetParamCount=Number.isFinite(rawTargetParamCount)
    ? Math.max(0,rawTargetParamCount)
    : 15;
  return compactAiLines([
    compactAiLine("目标参数数量",`${targetParamCount}条`),
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
  const pairingText=productRule && typeof productRule==="object"
    ? compactAiLines([
      compactAiLine("quote_task_id",productRule.quote_task_id),
      compactAiLine("当前报价产品",productRule.quote_product_name),
      compactAiLine("当前参数库产品",productRule.database_product_name),
      "返回 JSON 顶层必须包含同一个 quote_task_id，用于前端按本次对话匹配结果。"
    ])
    : "";
  return compactAiLines([
    "[对话配对]",
    pairingText,
    "",
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
  let lastError=null;
  for(let attemptIndex=0;attemptIndex<AI_CLIENT_RETRY_ATTEMPTS;attemptIndex+=1){
    try{
      const data=await requestAiCompletionOnce({flowKey},payload,attemptIndex);
      if(attemptIndex>0){
        console.info("AI 前端重试成功",{
          flowKey,
          chatId:toText(payload && payload.chatId).trim(),
          attempt:attemptIndex+1
        });
      }
      return data;
    }catch(err){
      lastError=err;
      if(!isRetryableAiClientError(err) || attemptIndex===AI_CLIENT_RETRY_ATTEMPTS-1){
        break;
      }
      console.warn("AI 前端重试",{
        flowKey,
        chatId:toText(payload && payload.chatId).trim(),
        attempt:attemptIndex+1,
        error:err && err.message ? err.message : err
      });
      await waitAiClientRetry(400*(attemptIndex+1));
    }
  }
  throw lastError || new Error("AI 调用失败");
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
