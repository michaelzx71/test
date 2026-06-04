const state={
  products:[],
  parameters:[],
  matchRules:[],
  selected:[],
  currentParams:[],
  currentProductId:null,
  editedContentByParamId:{},
  instances:[],
  activeInstanceId:null,
  lastActiveInstanceByProduct:{},
  draggingInstanceId:null,
  instanceSeed:1,
  quoteExtractConfirmModal:null,
  quoteGenerationStrategy:null,
  quoteGenerationStrategyModal:null,
  quoteUploadModal:null,
  quoteUploadAnchor:null,
  lastPointerPosition:null,
  confirmPopover:null,
  rewritePopover:null,
  rewriteModal:null,
  rewriteDraft:null,
  formatModal:null,
  formatDraft:null,
  feedbackModal:null,
  draftRestoreModal:null,
  draftRestorePromptShown:false,
  aiTask:null,
  quoteSelectProgress:null,
  aiTaskProgressTimer:null,
  draftSavePaused:false,
  draftSaveTimer:null,
  lastDraftSavedAt:"",
  mobileTab:"home",
  mobileScreen:"source",
  mobileWorkMode:"select",
  mobileManualSelectedProductIds:[],
  mobileProductCategory:"",
  mobileParamSearchQuery:"",
  mobileCompletedInstanceIds:[],
  mobileScrollPositions:{},
  mobileSelectScrollByProduct:{},
  mobileProductSearchQuery:"",
  mobileRecentProductIds:[],
  paramGroupCollapsed:{},
  paramSearchQuery:"",
  paramVirtualRows:[],
  paramVirtualRenderFrame:null,
  paramVirtualScrollBound:false,
  paramVirtualRangeKey:"",
  paramVirtualNodeCache:new Map(),
  paramLocateHighlightTimer:null,
  batchSelectedParamIds:new Set(),
  previewUpdateTimer:null,
  previewUpdatePending:false,
  textareaResizeFrame:null,
  pendingTextareaResizes:new Set(),
  mobileDrawerRestoreFocus:null,
  appSettings:{mobileEnabled:false,mobileDisabledTitle:"手机端暂未开放",mobileDisabledMessage:"请在电脑工作台操作。"},
};

const THEME_STORAGE_KEY="canshuxitong_theme";
const DRAFT_STORAGE_KEY="canshuxitong_current_draft";
const INSTANCE_DOCK_HEIGHT_STORAGE_KEY="canshuxitong_instance_dock_height";
const DATABASE_CACHE_DB_NAME="csxt-cache-v1";
const DATABASE_CACHE_STORE_NAME="catalog";
const DATABASE_CACHE_KEY="database";
const PARAM_VIRTUAL_OVERSCAN=1400;
const PARAM_ROW_HEIGHTS={
  module:48,
  function:44,
  paramDesktop:116,
  paramMobile:164
};
const PARAM_LOCATE_TOP_PADDING_DESKTOP=126;
const PARAM_LOCATE_TOP_PADDING_MOBILE=168;
const PREVIEW_UPDATE_DELAY_MS=150;
const INSTANCE_DOCK_MIN_HEIGHT=150;
const MAX_CANDIDATE_PRODUCTS=1;
const QUOTE_AI_MAX_CONCURRENCY=2;
const MOBILE_BREAKPOINT=860;
let xlsxLibraryPromise=null;

window.addEventListener("DOMContentLoaded",()=>{
  updateAppScale();
  initTheme();
  initMobileShell();
  bindQuoteFileInput();
  bindDraftFileInput();
  bindInstanceDockResize();
  initAiSettings();
  loadSiteNotice();
  loadAppSettings();
  window.addEventListener("keydown",handleGlobalHotkeys);
  window.addEventListener("pointerdown",trackPointerDown,true);
  window.addEventListener("resize",()=>{
    updateAppScale();
    updateMobileMode();
    applySidebarSplitRatio();
  });
  applySidebarSplitRatio();
  loadExcel();
});

function updateAppScale(){
  const minLayoutWidth=1680;
  const viewportWidth=window.innerWidth || minLayoutWidth;
  const viewportHeight=window.innerHeight || 900;
  if(isMobileViewport()){
    document.documentElement.style.setProperty("--app-scale","1");
    document.documentElement.style.setProperty("--app-layout-width",`${viewportWidth}px`);
    document.documentElement.style.setProperty("--app-layout-height",`${viewportHeight}px`);
    return;
  }
  const scale=Math.min(1,viewportWidth/minLayoutWidth);
  const layoutWidth=scale<1 ? minLayoutWidth : viewportWidth;
  const layoutHeight=viewportHeight/scale;
  document.documentElement.style.setProperty("--app-scale",String(scale));
  document.documentElement.style.setProperty("--app-layout-width",`${layoutWidth}px`);
  document.documentElement.style.setProperty("--app-layout-height",`${layoutHeight}px`);
}

function isMobileViewport(){
  return (window.innerWidth || 0)<=MOBILE_BREAKPOINT;
}

function getPreferredTheme(){
  try{
    const savedTheme=localStorage.getItem(THEME_STORAGE_KEY);
    if(savedTheme==="dark" || savedTheme==="light"){
      return savedTheme;
    }
  }catch(err){
    console.warn("读取主题偏好失败:",err);
  }

  if(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches){
    return "dark";
  }
  return "light";
}

function applyTheme(theme){
  const normalizedTheme=theme==="dark" ? "dark" : "light";
  document.body.dataset.theme=normalizedTheme;
  updateThemeToggleButton();
}

function updateThemeToggleButton(){
  const isDark=document.body.dataset.theme==="dark";
  ["themeToggleBtn","mobileThemeToggleBtn"].forEach(id=>{
    const button=document.getElementById(id);
    if(!button) return;
    button.innerText=isDark ? "日间模式" : "夜间模式";
    button.setAttribute("aria-pressed",isDark ? "true" : "false");
    button.title=isDark ? "切换为日间模式" : "切换为夜间模式";
  });
}

function initTheme(){
  applyTheme(getPreferredTheme());
}

function toggleTheme(){
  const nextTheme=document.body.dataset.theme==="dark" ? "light" : "dark";
  applyTheme(nextTheme);
  try{
    localStorage.setItem(THEME_STORAGE_KEY,nextTheme);
  }catch(err){
    console.warn("保存主题偏好失败:",err);
  }
}

function trackPointerDown(event){
  state.lastPointerPosition={
    x:event.clientX,
    y:event.clientY,
    target:event.target
  };
}

function getEventAnchor(event){
  if(event && event.currentTarget && typeof event.currentTarget.getBoundingClientRect==="function"){
    return event.currentTarget;
  }
  return null;
}

function handleGlobalHotkeys(event){
  if(event.key==="Escape"){
    if(document.body.classList.contains("mobile-menu-open")){
      closeMobileMoreMenu();
      return;
    }
    if(state.feedbackModal){
      closeFeedbackModal();
      return;
    }
    if(state.confirmPopover){
      closeConfirmPopover(false);
      return;
    }
    const active=document.activeElement;
    if(active && active!==document.body && typeof active.blur==="function"){
      active.blur();
    }
  }
}

function applySidebarSplitRatio(){
  const products=document.getElementById("sidebar");
  const dock=document.getElementById("instanceDock");
  if(!products || !dock) return;
  const height=clampInstanceDockHeight(readInstanceDockHeight());
  products.style.flex="1 1 auto";
  dock.style.flex=`0 0 ${height}px`;
  dock.style.height=`${height}px`;
}

function getInstanceDockMaxHeight(){
  const dock=document.getElementById("instanceDock");
  const sidebar=dock && dock.parentElement;
  if(!sidebar){
    return 360;
  }
  const sidebarHeight=sidebar.clientHeight || 520;
  return Math.max(INSTANCE_DOCK_MIN_HEIGHT,sidebarHeight-150);
}

function clampInstanceDockHeight(height){
  const parsed=Number(height);
  const fallback=260;
  return Math.round(clamp(
    Number.isFinite(parsed) && parsed>0 ? parsed : fallback,
    INSTANCE_DOCK_MIN_HEIGHT,
    getInstanceDockMaxHeight()
  ));
}

function readInstanceDockHeight(){
  try{
    return Number(localStorage.getItem(INSTANCE_DOCK_HEIGHT_STORAGE_KEY)) || 260;
  }catch(err){
    return 260;
  }
}

function saveInstanceDockHeight(height){
  try{
    localStorage.setItem(INSTANCE_DOCK_HEIGHT_STORAGE_KEY,String(Math.round(height)));
  }catch(err){
    // localStorage may be unavailable in restricted browser modes.
  }
}

function setInstanceDockHeight(height,shouldSave=true){
  const dock=document.getElementById("instanceDock");
  if(!dock) return;
  const nextHeight=clampInstanceDockHeight(height);
  dock.style.flex=`0 0 ${nextHeight}px`;
  dock.style.height=`${nextHeight}px`;
  if(shouldSave){
    saveInstanceDockHeight(nextHeight);
  }
}

function bindInstanceDockResize(){
  const handle=document.getElementById("instanceDockResize");
  const dock=document.getElementById("instanceDock");
  if(!handle || !dock || handle.dataset.bound==="true") return;
  handle.dataset.bound="true";
  handle.addEventListener("pointerdown",event=>{
    event.preventDefault();
    const startY=event.clientY;
    const startHeight=dock.getBoundingClientRect().height || readInstanceDockHeight();
    dock.classList.add("resizing");
    document.body.style.userSelect="none";
    handle.setPointerCapture(event.pointerId);

    const onPointerMove=moveEvent=>{
      const deltaY=moveEvent.clientY-startY;
      setInstanceDockHeight(startHeight-deltaY,false);
    };
    const onPointerUp=upEvent=>{
      const currentHeight=dock.getBoundingClientRect().height;
      setInstanceDockHeight(currentHeight,true);
      dock.classList.remove("resizing");
      document.body.style.userSelect="";
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove",onPointerMove);
      handle.removeEventListener("pointerup",onPointerUp);
      handle.removeEventListener("pointercancel",onPointerUp);
    };

    handle.addEventListener("pointermove",onPointerMove);
    handle.addEventListener("pointerup",onPointerUp);
    handle.addEventListener("pointercancel",onPointerUp);
  });
}

function normalizeProofMark(rawValue){
  const value=toText(rawValue).trim();
  if(!value) return {mark:"",status:""};

  const lower=value.toLowerCase();
  const passValues=["是","✓","√","yes","true","1"];
  const failValues=["/","／","✕","✗","×","x","no","false","0"];

  if(passValues.includes(lower) || passValues.includes(value)){
    return {mark:"✓",status:"ok"};
  }
  if(failValues.includes(lower) || failValues.includes(value)){
    return {mark:"✕",status:"fail"};
  }
  return {mark:"",status:""};
}

function getTypeCategory(rawType){
  const typeText=toText(rawType).trim();
  if(!typeText) return "";

  const normalized=typeText
    .toLowerCase()
    .replace(/\s+/g,"");

  const controlTypes=new Set(["控标项","控标","control","control_item"]);
  const publicTypes=new Set(["公有项","公有","public","public_item"]);

  if(typeText.includes("控标") || normalized.includes("control")) return "control";
  if(controlTypes.has(typeText) || controlTypes.has(normalized)) return "control";
  if(publicTypes.has(typeText) || publicTypes.has(normalized)) return "public";
  return "";
}

function getShortTypeLabel(param){
  if(param && param.isCustom) return "自定义";
  const rawType=toText(param && (param.is_star || param.type)).trim();
  const category=getTypeCategory(rawType);
  if(category==="control") return "控标项";
  if(category==="public") return "公有项";
  const cleaned=rawType.replace(/[\s:：/／\\|,，;；()（）\[\]【】]+/g,"");
  return cleaned ? cleaned.slice(0,3) : "其他项";
}

function getCurrentProductStats(){
  // Use a stable key to avoid accidental double-counting when source data is duplicated.
  const uniqueParamsMap=new Map();
  state.currentParams.forEach(param=>{
    if(!param) return;
    const hasId=param.id!==undefined && param.id!==null;
    const key=hasId
      ? `id:${param.id}`
      : `k:${toText(param.title)}|${toText(param.content)}|${toText(param.is_star || param.type)}`;
    if(!uniqueParamsMap.has(key)){
      uniqueParamsMap.set(key,param);
    }
  });

  const params=[...uniqueParamsMap.values()];
  const totalCount=params.length;
  const controlCount=params.filter(
    param=>getTypeCategory(param.is_star || param.type)==="control"
  ).length;

  return {totalCount,controlCount};
}

// ===== 工具函数 =====
function toText(value,fallback=""){
  if(value===undefined || value===null) return fallback;
  return String(value);
}

function simpleHashText(text){
  let hash=2166136261;
  const source=toText(text);
  for(let index=0;index<source.length;index+=1){
    hash^=source.charCodeAt(index);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36);
}

async function getFileHash(file){
  const fallback=()=>simpleHashText([
    file && file.name,
    file && file.size,
    file && file.lastModified
  ].join("|"));
  if(!file || !window.crypto || !window.crypto.subtle || typeof file.arrayBuffer!=="function"){
    return fallback();
  }
  try{
    const digest=await window.crypto.subtle.digest("SHA-256",await file.arrayBuffer());
    return [...new Uint8Array(digest)]
      .slice(0,8)
      .map(byte=>byte.toString(16).padStart(2,"0"))
      .join("");
  }catch(err){
    console.warn("文件哈希生成失败，使用文件元信息哈希兜底:",err);
    return fallback();
  }
}

function createQuoteRunContext(fileHash){
  const timestamp=Date.now().toString(36);
  return {
    fileHash:toText(fileHash).trim() || "unknown",
    timestamp,
    startedAt:performance.now(),
    timings:{}
  };
}

function makeFastGptChatId(prefix,runContext,suffix=""){
  return [
    prefix,
    runContext && runContext.fileHash,
    suffix,
    runContext && runContext.timestamp
  ]
    .map(item=>toText(item).trim())
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9_-]+/g,"-")
    .replace(/-+/g,"-")
    .slice(0,128);
}

function formatDurationMs(ms){
  const value=Number(ms) || 0;
  return value>=1000 ? `${(value/1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function bindAccessibleAction(element,handler){
  element.setAttribute("role","button");
  element.tabIndex=0;
  element.addEventListener("click",handler);
  element.addEventListener("keydown",event=>{
    if(event.key==="Enter" || event.key===" "){
      event.preventDefault();
      handler(event);
    }
  });
}

function getLoadErrorMessage(error){
  const msg=toText(error && error.message);
  if(msg.startsWith("HTTP_404")) return "未找到参数库接口，请检查本地服务";
  if(msg.startsWith("HTTP_503")) return "参数库尚未生成，请检查本地服务启动时是否成功读取 data/database.xlsx";
  if(msg.startsWith("HTTP_")) return "参数库加载失败，请检查本地服务状态";
  if(msg.startsWith("DATABASE_JSON_INVALID")) return "参数库 JSON 结构不正确，请重启本地服务";
  return "参数库加载失败，请检查本地服务和 data/database.xlsx 文件";
}

function hasDraftContent(){
  return state.instances.length>0 || Boolean(state.currentProductId);
}

function createDraftPayload(){
  return {
    format:"csxt_draft_v1",
    savedAt:new Date().toISOString(),
    appUrl:window.location.href,
    catalog:{
      productCount:state.products.length,
      parameterCount:state.parameters.length
    },
    currentProductId:state.currentProductId,
    activeInstanceId:state.activeInstanceId,
    instanceSeed:state.instanceSeed,
    lastActiveInstanceByProduct:state.lastActiveInstanceByProduct,
    instances:state.instances.map(instance=>({
      id:instance.id,
      productId:Number(instance.productId),
      name:toText(instance.name).trim(),
      customParamSeed:Number(instance.customParamSeed) || 1,
      editedContentByParamId:instance.editedContentByParamId || {},
      selected:Array.isArray(instance.selected) ? instance.selected.map(param=>({
        ...param,
        content:normalizeParamContentValue(param.content),
        product_id:Number(param.product_id || instance.productId),
        prefix_symbol:toText(param.prefix_symbol).trim()
      })) : []
    }))
  };
}

function saveCurrentDraftNow(){
  if(state.draftSavePaused || state.products.length===0 || !hasDraftContent()){
    return;
  }
  try{
    const payload=createDraftPayload();
    localStorage.setItem(DRAFT_STORAGE_KEY,JSON.stringify(payload));
    state.lastDraftSavedAt=payload.savedAt;
  }catch(err){
    console.warn("自动保存草稿失败:",err);
  }
}

function scheduleDraftSave(){
  if(state.draftSavePaused || state.products.length===0 || !hasDraftContent()){
    return;
  }
  if(state.draftSaveTimer){
    clearTimeout(state.draftSaveTimer);
  }
  state.draftSaveTimer=setTimeout(()=>{
    state.draftSaveTimer=null;
    saveCurrentDraftNow();
  },300);
}

function clearSavedDraft(){
  if(state.draftSaveTimer){
    clearTimeout(state.draftSaveTimer);
    state.draftSaveTimer=null;
  }
  try{
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  }catch(err){
    console.warn("清空本地草稿失败:",err);
  }
  state.lastDraftSavedAt="";
}

function readSavedDraft(){
  try{
    const raw=localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(err){
    console.warn("读取本地草稿失败:",err);
    return null;
  }
}

function hasSavedDraftContent(payload){
  if(!payload || payload.format!=="csxt_draft_v1" || !Array.isArray(payload.instances)){
    return false;
  }
  return payload.instances.some(instance=>{
    if(!instance || typeof instance!=="object") return false;
    if(toText(instance.productId || instance.product_id).trim()) return true;
    if(Array.isArray(instance.selected) && instance.selected.length>0) return true;
    const edits=instance.editedContentByParamId;
    return Boolean(edits && typeof edits==="object" && Object.keys(edits).length>0);
  });
}

function getDraftSummary(payload){
  const instances=Array.isArray(payload && payload.instances) ? payload.instances : [];
  const paramCount=instances.reduce((sum,instance)=>sum+(Array.isArray(instance.selected) ? instance.selected.length : 0),0);
  return {
    productCount:instances.length,
    paramCount,
    savedAt:toText(payload && payload.savedAt).trim()
  };
}

function formatDraftSavedAt(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return "未知时间";
  const yyyy=date.getFullYear();
  const mm=String(date.getMonth()+1).padStart(2,"0");
  const dd=String(date.getDate()).padStart(2,"0");
  const hh=String(date.getHours()).padStart(2,"0");
  const min=String(date.getMinutes()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function normalizeDraftInstance(rawInstance,index){
  if(!rawInstance || typeof rawInstance!=="object") return null;
  const productId=Number(rawInstance.productId || rawInstance.product_id);
  if(!Number.isFinite(productId) || !getProductById(productId)){
    return null;
  }
  const id=toText(rawInstance.id).trim() || `draft_instance_${Date.now()}_${index}`;
  const selected=Array.isArray(rawInstance.selected)
    ? rawInstance.selected.map(param=>({
      ...param,
      id:param && param.id!==undefined ? param.id : `draft_custom_${Date.now()}_${Math.random()}`,
      product_id:Number(param && (param.product_id || param.productId)) || productId,
      content:normalizeParamContentValue(param && param.content),
      prefix_symbol:toText(param && param.prefix_symbol).trim()
    })).filter(param=>toText(param.content).trim() || toText(param.title).trim())
    : [];
  return {
    id,
    productId,
    name:toText(rawInstance.name).trim() || getNextInstanceName(productId),
    selected,
    editedContentByParamId:rawInstance.editedContentByParamId && typeof rawInstance.editedContentByParamId==="object"
      ? rawInstance.editedContentByParamId
      : {},
    customParamSeed:Number(rawInstance.customParamSeed) || 1
  };
}

function applyDraftPayload(payload,{silent=false,saveAfterApply=true}={}){
  if(!payload || payload.format!=="csxt_draft_v1" || !Array.isArray(payload.instances)){
    throw new Error("DRAFT_INVALID");
  }
  const instances=payload.instances
    .map(normalizeDraftInstance)
    .filter(Boolean);
  const currentProductId=Number(payload.currentProductId) || null;
  const activeInstanceId=toText(payload.activeInstanceId).trim();

  state.draftSavePaused=true;
  resetSelectionStateOnly();
  state.instances=instances;
  state.instanceSeed=Math.max(Number(payload.instanceSeed) || 1,instances.length+1);
  state.lastActiveInstanceByProduct=payload.lastActiveInstanceByProduct && typeof payload.lastActiveInstanceByProduct==="object"
    ? payload.lastActiveInstanceByProduct
    : {};

  const activeInstance=instances.find(instance=>instance.id===activeInstanceId) || instances[0] || null;
  if(activeInstance){
    state.activeInstanceId=activeInstance.id;
    activateInstance(activeInstance.id);
  }else if(currentProductId && getProductById(currentProductId)){
    openProductWithoutInstance(currentProductId);
  }else{
    renderProductMeta(null);
    renderInstancePanel();
    renderParamList();
    renderEditArea();
    schedulePreviewUpdate();
    showGuidePanel();
    updateMobileContext();
    if(isMobileViewport()){
      setMobileTab("home",true);
    }
  }

  state.draftSavePaused=false;
  if(saveAfterApply && hasDraftContent()){
    saveCurrentDraftNow();
  }
  if(!silent){
    const summary=getDraftSummary(payload);
    showToast(`已恢复草稿：${summary.productCount} 个产品，${summary.paramCount} 条参数`,"success");
  }
  return true;
}

function restoreDraftIfAvailable(){
  const payload=readSavedDraft();
  if(!payload) return false;
  try{
    return applyDraftPayload(payload,{silent:true,saveAfterApply:false});
  }catch(err){
    console.warn("恢复本地草稿失败:",err);
    return false;
  }
}

function closeDraftRestoreModal(){
  if(!state.draftRestoreModal) return;
  state.draftRestoreModal.remove();
  state.draftRestoreModal=null;
}

function openDraftRestoreModal(payload){
  closeDraftRestoreModal();
  const summary=getDraftSummary(payload);
  const modal=document.createElement("div");
  modal.className="ai-modal open draft-restore-modal";
  const panel=document.createElement("div");
  panel.className="ai-modal-panel draft-restore-panel";
  panel.innerHTML=`
    <div class="ai-modal-head">
      <div>
        <div class="ai-modal-title">发现未完成的参数草稿</div>
        <div class="ai-modal-subtitle">上次离开前有缓存编辑内容，可以继续编辑或放弃重新开始。</div>
      </div>
      <button type="button" class="ai-close" title="关闭" aria-label="关闭">×</button>
    </div>
    <div class="draft-restore-summary">
      <div class="draft-restore-label">草稿内容</div>
      <div class="draft-restore-main">${summary.productCount} 个产品 · ${summary.paramCount} 条已选参数</div>
      <div class="draft-restore-time">保存时间：${formatDraftSavedAt(summary.savedAt)}</div>
    </div>
    <div class="ai-actions draft-restore-actions">
      <button type="button" class="btn-ai-danger" id="draftDiscardBtn">放弃草稿</button>
      <button type="button" class="btn-ai-secondary" id="draftLaterBtn">稍后再说</button>
      <button type="button" class="btn-ai-primary" id="draftContinueBtn">继续编辑</button>
    </div>
  `;
  panel.querySelector(".ai-close").addEventListener("click",closeDraftRestoreModal);
  panel.querySelector("#draftLaterBtn").addEventListener("click",closeDraftRestoreModal);
  panel.querySelector("#draftDiscardBtn").addEventListener("click",()=>{
    clearSavedDraft();
    closeDraftRestoreModal();
    showGuidePanel();
    showToast("已放弃本地草稿","success");
  });
  panel.querySelector("#draftContinueBtn").addEventListener("click",()=>{
    try{
      applyDraftPayload(payload,{silent:false,saveAfterApply:false});
      closeDraftRestoreModal();
    }catch(err){
      console.warn("恢复本地草稿失败:",err);
      closeDraftRestoreModal();
      showGuidePanel();
      showToast("草稿恢复失败，已停留在首页","error");
    }
  });
  modal.addEventListener("pointerdown",event=>{
    if(event.target===modal) closeDraftRestoreModal();
  });
  modal.appendChild(panel);
  document.body.appendChild(modal);
  state.draftRestoreModal=modal;
}

function promptSavedDraftIfAvailable(){
  if(state.draftRestorePromptShown || state.products.length===0) return;
  state.draftRestorePromptShown=true;
  const payload=readSavedDraft();
  if(!payload) return;
  if(!hasSavedDraftContent(payload)) return;
  try{
    if(!payload || payload.format!=="csxt_draft_v1" || !Array.isArray(payload.instances)){
      throw new Error("DRAFT_INVALID");
    }
    const canRestore=payload.instances.some((instance,index)=>normalizeDraftInstance(instance,index));
    if(!canRestore){
      console.warn("本地草稿没有可恢复的产品实例，已忽略。");
      return;
    }
    showGuidePanel();
    openDraftRestoreModal(payload);
  }catch(err){
    console.warn("本地草稿结构不匹配，已忽略:",err);
  }
}

async function loadSiteNotice(){
  try{
    const response=await fetch("/api/site-notice",{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP_${response.status}`);
    renderSiteNotice(await response.json());
  }catch(err){
    console.warn("读取前台通知失败:",err);
    renderSiteNotice(null);
  }
}

function renderSiteNotice(notice){
  const box=document.getElementById("guideNotice");
  const title=document.getElementById("guideNoticeTitle");
  const message=document.getElementById("guideNoticeMessage");
  const text=toText(notice && notice.message).trim();
  const visible=Boolean(notice && notice.enabled && text);
  if(!box || !title || !message) return;
  box.classList.toggle("empty",!visible);
  box.classList.toggle("active",visible);
  if(!visible){
    title.textContent="暂无通知";
    message.textContent="后台暂未发布通知。";
    return;
  }
  title.textContent=toText(notice.title).trim() || "通知";
  message.textContent=text;
}

function normalizeAppSettingsPayload(settings){
  return {
    mobileEnabled:settings && settings.mobileEnabled === true,
    mobileDisabledTitle:toText(settings && settings.mobileDisabledTitle).trim() || "手机端暂未开放",
    mobileDisabledMessage:toText(settings && settings.mobileDisabledMessage).trim() || "请在电脑工作台操作。"
  };
}

async function loadAppSettings(){
  try{
    const response=await fetch("/api/app-settings",{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP_${response.status}`);
    state.appSettings=normalizeAppSettingsPayload(await response.json());
  }catch(err){
    console.warn("读取前台界面开关失败，手机端保持关闭:",err);
    state.appSettings=normalizeAppSettingsPayload(null);
  }finally{
    if(typeof updateMobileMode==="function"){
      updateMobileMode();
    }
  }
}

function buildDraftFileName(){
  const now=new Date();
  const yyyy=String(now.getFullYear());
  const mm=String(now.getMonth()+1).padStart(2,"0");
  const dd=String(now.getDate()).padStart(2,"0");
  const hh=String(now.getHours()).padStart(2,"0");
  const min=String(now.getMinutes()).padStart(2,"0");
  return `参数草稿_${yyyy}${mm}${dd}_${hh}${min}.json`;
}

function exportDraftJson(event){
  const anchor=getEventAnchor(event);
  if(!hasDraftContent()){
    showToast("当前没有可导出的草稿","error",anchor);
    return;
  }
  const payload=createDraftPayload();
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=buildDraftFileName();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("草稿 JSON 已导出","success",anchor);
}

function bindDraftFileInput(){
  const input=document.getElementById("draftFileInput");
  if(!input || input.dataset.bound==="true") return;
  input.dataset.bound="true";
  input.addEventListener("change",event=>{
    const file=event.target.files && event.target.files[0];
    if(!file) return;
    importDraftFile(file,state.lastPointerPosition && state.lastPointerPosition.target);
  });
}

function triggerDraftImport(event){
  const input=document.getElementById("draftFileInput");
  if(!input){
    showToast("当前页面无法导入草稿","error",getEventAnchor(event));
    return;
  }
  input.value="";
  input.click();
}

function importDraftFile(file,anchor=null){
  readFileAsText(file)
    .then(text=>{
      const payload=JSON.parse(text);
      return applyDraftPayload(payload,{silent:false,saveAfterApply:true});
    })
    .catch(err=>{
      console.error(err);
      showToast("草稿导入失败，请确认 JSON 文件来自本工具","error",anchor);
    });
}

function getToastStack(){
  let stack=document.getElementById("toast-stack");
  if(stack) return stack;
  stack=document.createElement("div");
  stack.id="toast-stack";
  stack.className="toast-stack";
  stack.setAttribute("aria-live","polite");
  stack.setAttribute("aria-atomic","true");
  document.body.appendChild(stack);
  return stack;
}

function clamp(value,min,max){
  return Math.min(Math.max(value,min),max);
}

function resolveToastAnchor(anchorEl){
  if(anchorEl && anchorEl.isConnected && typeof anchorEl.getBoundingClientRect==="function"){
    return anchorEl;
  }
  const active=document.activeElement;
  if(active && active!==document.body && typeof active.getBoundingClientRect==="function"){
    return active;
  }
  const pointerTarget=state.lastPointerPosition && state.lastPointerPosition.target;
  if(pointerTarget && pointerTarget.isConnected && typeof pointerTarget.getBoundingClientRect==="function"){
    return pointerTarget;
  }
  return null;
}

function getToastPosition(anchorEl){
  return {left:window.innerWidth/2,top:86,below:true};
}

function closeConfirmPopover(result=false,silent=false){
  const pop=state.confirmPopover;
  if(!pop) return;

  document.removeEventListener("pointerdown",pop.onOutsidePointerDown,true);
  document.removeEventListener("keydown",pop.onEsc,true);
  if(pop.el && pop.el.parentNode){
    pop.el.parentNode.removeChild(pop.el);
  }
  state.confirmPopover=null;
  if(!silent && typeof pop.resolve==="function"){
    pop.resolve(Boolean(result));
  }
}

function confirmAtAnchor(message,anchorEl){
  closeConfirmPopover(false);

  return new Promise(resolve=>{
    const viewportGap=8;
    const panel=document.createElement("div");
    panel.className="confirm-pop";
    panel.innerHTML=`
      <div class="confirm-pop-text"></div>
      <div class="confirm-pop-actions">
        <button type="button" class="confirm-pop-btn confirm-pop-btn-cancel">取消</button>
        <button type="button" class="confirm-pop-btn confirm-pop-btn-ok">确认</button>
      </div>
    `;
    panel.querySelector(".confirm-pop-text").innerText=toText(message);

    const onOutsidePointerDown=event=>{
      if(panel.contains(event.target)) return;
      closeConfirmPopover(false);
    };
    const onEsc=event=>{
      if(event.key==="Escape"){
        closeConfirmPopover(false);
      }
    };
    state.confirmPopover={el:panel,resolve,onOutsidePointerDown,onEsc};

    const cancelBtn=panel.querySelector(".confirm-pop-btn-cancel");
    const okBtn=panel.querySelector(".confirm-pop-btn-ok");
    cancelBtn.addEventListener("click",()=>closeConfirmPopover(false));
    okBtn.addEventListener("click",()=>closeConfirmPopover(true));

    document.body.appendChild(panel);

    if(isMobileViewport()){
      panel.classList.add("mobile-confirm-pop");
      panel.style.left="50%";
      panel.style.top="50%";
      panel.classList.remove("above");
      setTimeout(()=>{
        document.addEventListener("pointerdown",onOutsidePointerDown,true);
        document.addEventListener("keydown",onEsc,true);
        okBtn.focus();
      },0);
      return;
    }

    const pos=getToastPosition(anchorEl);
    const panelRect=panel.getBoundingClientRect();
    const halfWidth=panelRect.width/2;
    const minCenter=halfWidth+viewportGap;
    const maxCenter=window.innerWidth-halfWidth-viewportGap;
    const safeLeft=clamp(pos.left,minCenter,Math.max(minCenter,maxCenter));
    const anchor=resolveToastAnchor(anchorEl);
    const anchorRect=anchor ? anchor.getBoundingClientRect() : null;

    let placeBelow=true;
    if(anchorRect){
      const spaceBelow=window.innerHeight-anchorRect.bottom-viewportGap;
      const spaceAbove=anchorRect.top-viewportGap;
      if(spaceBelow>=panelRect.height+8){
        placeBelow=true;
      }else if(spaceAbove>=panelRect.height+8){
        placeBelow=false;
      }else{
        placeBelow=spaceBelow>=spaceAbove;
      }
    }else{
      placeBelow=Boolean(pos.below);
    }

    let safeTop;
    if(anchorRect){
      safeTop=placeBelow ? anchorRect.bottom+8 : anchorRect.top-8;
    }else{
      safeTop=pos.top;
    }
    safeTop=clamp(
      safeTop,
      viewportGap+(placeBelow ? 0 : panelRect.height),
      window.innerHeight-viewportGap-(placeBelow ? panelRect.height : 0)
    );

    panel.style.left=`${safeLeft}px`;
    panel.style.top=`${safeTop}px`;
    panel.classList.toggle("above",!placeBelow);

    setTimeout(()=>{
      document.addEventListener("pointerdown",onOutsidePointerDown,true);
      document.addEventListener("keydown",onEsc,true);
      okBtn.focus();
    },0);
  });
}

function closeRewritePopover(){
  if(!state.rewritePopover) return;
  const {panel,onDocClick}=state.rewritePopover;
  document.removeEventListener("pointerdown",onDocClick,true);
  panel.remove();
  state.rewritePopover=null;
}

function openRewriteModePopover(index,anchorEl){
  closeRewritePopover();
  if(!anchorEl) return;

  const panel=document.createElement("div");
  panel.className="rewrite-pop";
  panel.innerHTML=`
    <button type="button" class="btn-ai-secondary" data-mode="regular">常规改写</button>
    <button type="button" class="btn-ai-secondary" data-mode="special">特殊改写</button>
  `;
  document.body.appendChild(panel);

  const rect=anchorEl.getBoundingClientRect();
  const panelRect=panel.getBoundingClientRect();
  panel.style.left=`${Math.min(window.innerWidth-panelRect.width-12,Math.max(12,rect.left))}px`;
  panel.style.top=`${Math.min(window.innerHeight-panelRect.height-12,rect.bottom+8)}px`;

  panel.querySelector('[data-mode="regular"]').addEventListener("click",()=>{
    closeRewritePopover();
    rewriteParamWithAi(index,"regular","",anchorEl);
  });
  panel.querySelector('[data-mode="special"]').addEventListener("click",()=>{
    closeRewritePopover();
    openRewriteRequirementModal(index);
  });

  const onDocClick=event=>{
    if(panel.contains(event.target) || anchorEl.contains(event.target)) return;
    closeRewritePopover();
  };
  setTimeout(()=>document.addEventListener("pointerdown",onDocClick,true),0);
  state.rewritePopover={panel,onDocClick};
}

function closeRewriteModal(){
  if(!state.rewriteModal) return;
  if(state.rewriteModal._onEsc){
    document.removeEventListener("keydown",state.rewriteModal._onEsc,true);
  }
  state.rewriteModal.remove();
  state.rewriteModal=null;
  state.rewriteDraft=null;
}

function createRewriteModal(title,subtitle,bodyBuilder){
  closeRewriteModal();
  const modal=document.createElement("div");
  modal.className="ai-modal open";
  const panel=document.createElement("div");
  panel.className="ai-modal-panel";
  panel.setAttribute("role","dialog");
  panel.setAttribute("aria-modal","true");
  panel.innerHTML=`
    <div class="ai-modal-head">
      <div>
        <div class="ai-modal-title"></div>
        <div class="ai-modal-subtitle"></div>
      </div>
      <button type="button" class="ai-close" title="关闭" aria-label="关闭">×</button>
    </div>
    <div class="rewrite-modal-body"></div>
  `;
  panel.querySelector(".ai-modal-title").textContent=title;
  panel.querySelector(".ai-modal-subtitle").textContent=subtitle;
  panel.querySelector(".ai-close").addEventListener("click",closeRewriteModal);
  bodyBuilder(panel.querySelector(".rewrite-modal-body"));
  modal.appendChild(panel);
  modal.addEventListener("pointerdown",event=>{
    if(event.target===modal) closeRewriteModal();
  });
  modal._onEsc=event=>{
    if(event.key==="Escape"){
      event.preventDefault();
      closeRewriteModal();
    }
  };
  document.addEventListener("keydown",modal._onEsc,true);
  document.body.appendChild(modal);
  state.rewriteModal=modal;
  return modal;
}

function openRewriteRequirementModal(index){
  const param=state.selected[index];
  if(!param) return;
  createRewriteModal(
    "特殊改写",
    "输入本次改写的具体要求，AI 会按要求返回改写后的内容，并先给你预览。",
    body=>{
      body.innerHTML=`
        <div class="ai-field">
          <label class="ai-label">原始内容</label>
          <textarea class="ai-textarea rewrite-modal-textarea" readonly></textarea>
        </div>
        <div class="ai-field">
          <label class="ai-label">改写要求</label>
          <textarea class="ai-textarea rewrite-modal-textarea" id="rewriteRequirementInput" placeholder="例如：语气更正式；突出安全能力；减少绝对化表述；保留所有型号和数量"></textarea>
        </div>
        <div class="ai-actions">
          <button type="button" class="btn-ai-primary" id="rewriteGenerateBtn">生成预览</button>
          <button type="button" class="btn-ai-secondary" id="rewriteCancelBtn">取消</button>
          <span class="ai-inline-hint">不会直接替换，预览满意后再应用。</span>
        </div>
        <div class="ai-status" id="rewriteModalStatus"></div>
      `;
      body.querySelector(".rewrite-modal-textarea").value=toText(param.content);
      body.querySelector("#rewriteCancelBtn").addEventListener("click",closeRewriteModal);
      body.querySelector("#rewriteGenerateBtn").addEventListener("click",()=>{
        rewriteParamWithAi(index,"special",body.querySelector("#rewriteRequirementInput").value,body.querySelector("#rewriteGenerateBtn"));
      });
    }
  );
}

function openRewritePreviewModal(index,mode,requirement,resultText){
  const param=state.selected[index];
  if(!param) return;
  createRewriteModal(
    "改写预览",
    "确认内容符合预期后再替换原参数内容。",
    body=>{
      body.innerHTML=`
        <div class="ai-grid rewrite-preview-grid">
          <div class="ai-card">
            <div class="ai-card-title">原始内容</div>
            <textarea class="ai-textarea rewrite-preview-textarea" readonly id="rewriteOriginal"></textarea>
          </div>
          <div class="ai-card">
            <div class="ai-card-title">改写后内容</div>
            <textarea class="ai-textarea rewrite-preview-textarea" id="rewriteResult"></textarea>
          </div>
        </div>
        <div class="ai-actions ai-actions--spaced">
          <button type="button" class="btn-ai-primary" id="rewriteApplyBtn">替换原内容</button>
          <button type="button" class="btn-ai-secondary" id="rewriteRetryBtn">重新生成</button>
          <button type="button" class="btn-ai-secondary" id="rewriteCloseBtn">取消</button>
        </div>
        <div class="ai-status" id="rewriteModalStatus"></div>
      `;
      body.querySelector("#rewriteOriginal").value=normalizeParamContentValue(param.content);
      body.querySelector("#rewriteResult").value=normalizeParamContentValue(resultText);
      body.querySelector("#rewriteCloseBtn").addEventListener("click",closeRewriteModal);
      body.querySelector("#rewriteApplyBtn").addEventListener("click",()=>{
        editContent(index,body.querySelector("#rewriteResult").value);
        renderEditArea();
        closeRewriteModal();
        showToast("已替换为 AI 改写内容","success");
      });
      body.querySelector("#rewriteRetryBtn").addEventListener("click",()=>{
        rewriteParamWithAi(index,mode,requirement,body.querySelector("#rewriteRetryBtn"));
      });
    }
  );
}

function openBatchRewriteModal(anchorEl=null,mode="regular"){
  const items=getBatchSelectedItems();
  if(!items.length){
    showToast("请先勾选要批量改写的参数","error",anchorEl);
    return;
  }
  const isSpecial=mode==="special";
  createRewriteModal(
    isSpecial ? "特殊批量 AI 改写" : "常规批量 AI 改写",
    `将直接改写并替换已勾选的 ${items.length} 条参数，失败项会保留原文。`,
    body=>{
      body.innerHTML=`
        <div class="ai-field"${isSpecial ? "" : " hidden"}>
          <label class="ai-label">改写要求</label>
          <textarea class="ai-textarea rewrite-modal-textarea" id="batchRewriteRequirementInput" placeholder="例如：语气更正式；突出安全能力；减少绝对化表述；保留所有型号和数量"></textarea>
        </div>
        <div class="ai-actions">
          <button type="button" class="btn-ai-primary" id="batchRewriteStartBtn">开始改写 ${items.length} 条</button>
          <button type="button" class="btn-ai-secondary" id="batchRewriteCancelBtn">取消</button>
          <span class="ai-inline-hint">${isSpecial ? "会按上方特殊要求逐条改写。" : "按常规策略优化表达，不改变技术含义。"}</span>
        </div>
        <div class="ai-status" id="rewriteModalStatus"></div>
      `;
      body.querySelector("#batchRewriteCancelBtn").addEventListener("click",closeRewriteModal);
      body.querySelector("#batchRewriteStartBtn").addEventListener("click",event=>{
        batchRewriteSelectedParams(mode,body.querySelector("#batchRewriteRequirementInput").value,event.currentTarget);
      });
    }
  );
}

function closeFormatModal(){
  if(!state.formatModal) return;
  state.formatModal.remove();
  state.formatModal=null;
  state.formatDraft=null;
}

function createFormatModal(title,subtitle,bodyBuilder){
  closeFormatModal();
  const modal=document.createElement("div");
  modal.className="ai-modal open";
  const panel=document.createElement("div");
  panel.className="ai-modal-panel";
  panel.innerHTML=`
    <div class="ai-modal-head">
      <div>
        <div class="ai-modal-title"></div>
        <div class="ai-modal-subtitle"></div>
      </div>
      <button type="button" class="ai-close" title="关闭" aria-label="关闭">×</button>
    </div>
    <div class="format-modal-body"></div>
  `;
  panel.querySelector(".ai-modal-title").textContent=title;
  panel.querySelector(".ai-modal-subtitle").textContent=subtitle;
  panel.querySelector(".ai-close").addEventListener("click",closeFormatModal);
  bodyBuilder(panel.querySelector(".format-modal-body"));
  modal.appendChild(panel);
  modal.addEventListener("pointerdown",event=>{
    if(event.target===modal) closeFormatModal();
  });
  document.body.appendChild(modal);
  state.formatModal=modal;
}

function openFormatOptionsModal(){
  if(getAllFormatTargetItems().length===0){
    showToast("请先选择参数","error");
    return;
  }
  const proofOptions=[
    ["delete","删除"],
    ["screenshot","功能截图并加盖公章"],
    ["report","CMA/CNAS检测报告并加盖厂商公章"],
    ["both","截图+CMA/CNAS"],
    ["custom","自定义"]
  ];
  const buildRuleCard=(id,title,options)=>{
    const optionHtml=options.map(([value,label])=>`<option value="${value}">${escapeHtml(label)}</option>`).join("");
    return `
      <div class="format-rule-card" data-format-rule="${id}">
        <div class="format-rule-head">
          <div class="format-rule-title">${escapeHtml(title)}</div>
          <label class="format-rule-toggle">
            <input type="checkbox" data-role="format-enable" data-target="${id}">
            <span>修改</span>
          </label>
        </div>
        <select class="ai-select" data-role="format-mode" data-target="${id}" disabled>
          ${optionHtml}
        </select>
        <input class="ai-input format-rule-custom" data-role="format-custom" data-target="${id}" placeholder="填写自定义要求" disabled>
      </div>
    `;
  };
  createFormatModal(
    "AI整理格式",
    "选择要整理的内容，生成后先预览，确认后再批量替换。",
    body=>{
      body.innerHTML=`
        <div class="format-options">
          ${buildRuleCard("ending","结尾符号",[
            ["period","句号 。"],
            ["semicolon","分号 ；"],
            ["none","无符号"]
          ])}
          ${buildRuleCard("triangleProof","▲项证明材料",proofOptions)}
          ${buildRuleCard("starProof","★项证明材料",proofOptions)}
          ${buildRuleCard("plainProof","其他材料（非▲/★项）",proofOptions)}
          <div class="ai-field format-option-full">
            <label class="ai-label">特殊要求</label>
            <textarea class="ai-textarea" id="formatSpecialRequirement" placeholder="例如：删除检测报告查询提醒；保留所有型号和数量；不要调整技术表达"></textarea>
          </div>
        </div>
        <div class="ai-actions ai-actions--spaced">
          <button type="button" class="btn-ai-primary" id="formatGenerateBtn">生成整理预览</button>
          <button type="button" class="btn-ai-secondary" id="formatCancelBtn">取消</button>
          <span class="ai-inline-hint">生成后会先预览，确认后再批量替换。</span>
        </div>
        <div class="ai-status" id="formatModalStatus"></div>
      `;
      body.querySelector("#formatCancelBtn").addEventListener("click",closeFormatModal);
      const syncFormatRuleState=card=>{
        const checkbox=card.querySelector('[data-role="format-enable"]');
        const select=card.querySelector('[data-role="format-mode"]');
        const custom=card.querySelector('[data-role="format-custom"]');
        const enabled=Boolean(checkbox && checkbox.checked);
        const customOpen=enabled && select && select.value==="custom";
        if(select) select.disabled=!enabled;
        if(custom) custom.disabled=!customOpen;
        card.classList.toggle("custom-open",customOpen);
      };
      body.querySelectorAll(".format-rule-card").forEach(card=>{
        syncFormatRuleState(card);
        card.querySelector('[data-role="format-enable"]').addEventListener("change",()=>syncFormatRuleState(card));
        card.querySelector('[data-role="format-mode"]').addEventListener("change",()=>syncFormatRuleState(card));
      });
      body.querySelector("#formatGenerateBtn").addEventListener("click",()=>{
        const options=collectFormatOptionsFromModal(body);
        formatParamsWithAi(options,body.querySelector("#formatGenerateBtn"));
      });
    }
  );
}

function collectFormatOptionsFromModal(root){
  const options={specialRequirement:toText(root.querySelector("#formatSpecialRequirement") && root.querySelector("#formatSpecialRequirement").value).trim()};
  root.querySelectorAll(".format-rule-card").forEach(card=>{
    const key=toText(card.dataset.formatRule).trim();
    if(!key) return;
    const enabled=Boolean(card.querySelector('[data-role="format-enable"]') && card.querySelector('[data-role="format-enable"]').checked);
    const mode=toText(card.querySelector('[data-role="format-mode"]') && card.querySelector('[data-role="format-mode"]').value).trim();
    const custom=toText(card.querySelector('[data-role="format-custom"]') && card.querySelector('[data-role="format-custom"]').value).trim();
    options[key]=enabled ? {mode,custom} : {mode:"keep",custom:""};
  });
  return options;
}

function setFormatStatus(message,type=""){
  const status=document.getElementById("formatModalStatus");
  if(!status) return;
  status.className=`ai-status${type ? ` ${type}` : ""}`;
  status.textContent=message;
}

function openFormatPreviewModal(items){
  createFormatModal(
    "整理预览",
    "确认格式统一后，再批量替换当前预览中的全部参数内容。",
    body=>{
      const list=document.createElement("div");
      list.className="format-preview-list";
      items.forEach(item=>{
        const block=document.createElement("div");
        block.className="format-preview-item";
        const title=document.createElement("div");
        title.className="format-preview-title";
        title.textContent=item.instanceName
          ? `【${item.instanceName}】参数 ${item.paramIndex+1}`
          : `参数 ${item.index+1}`;
        block.appendChild(title);
        if(item.original_content){
          const original=document.createElement("div");
          original.className="format-preview-original";
          const originalLabel=document.createElement("div");
          originalLabel.className="format-preview-label";
          originalLabel.textContent="原文";
          const originalText=document.createElement("div");
          originalText.className="format-preview-text";
          originalText.textContent=item.original_content;
          original.appendChild(originalLabel);
          original.appendChild(originalText);
          block.appendChild(original);
        }
        const resultLabel=document.createElement("div");
        resultLabel.className="format-preview-label";
        resultLabel.textContent="整理后";
        const text=document.createElement("div");
        text.className="format-preview-text";
        text.textContent=item.formatted_content;
        block.appendChild(resultLabel);
        block.appendChild(text);
        list.appendChild(block);
      });
      const actions=document.createElement("div");
      actions.className="ai-actions ai-actions--spaced";
      actions.innerHTML=`
        <button type="button" class="btn-ai-primary" id="formatApplyBtn">批量替换</button>
        <button type="button" class="btn-ai-secondary" id="formatCloseBtn">取消</button>
      `;
      body.appendChild(list);
      body.appendChild(actions);
      actions.querySelector("#formatCloseBtn").addEventListener("click",closeFormatModal);
      actions.querySelector("#formatApplyBtn").addEventListener("click",applyFormattedParams);
    }
  );
  state.formatDraft=items;
}

function closeFeedbackModal(){
  if(!state.feedbackModal) return;
  state.feedbackModal.remove();
  state.feedbackModal=null;
}

function setFeedbackModalState(message="",busy=false){
  const modal=state.feedbackModal;
  if(!modal) return;
  const status=modal.querySelector("#feedbackStatus");
  const submitBtn=modal.querySelector("#feedbackSubmitBtn");
  const cancelBtn=modal.querySelector("#feedbackCancelBtn");
  const closeBtn=modal.querySelector(".ai-close");
  if(status) status.textContent=toText(message);
  if(submitBtn) submitBtn.disabled=Boolean(busy);
  if(cancelBtn) cancelBtn.disabled=Boolean(busy);
  if(closeBtn) closeBtn.disabled=Boolean(busy);
}

function openFeedbackModal(event=null){
  if(state.feedbackModal){
    closeFeedbackModal();
  }
  const modal=document.createElement("div");
  modal.className="ai-modal open";
  const panel=document.createElement("div");
  panel.className="ai-modal-panel feedback-panel";
  panel.innerHTML=`
    <div class="ai-modal-head">
      <div>
        <div class="ai-modal-title">反馈建议</div>
        <div class="ai-modal-subtitle">留下工号和建议，方便后续跟进优化。</div>
      </div>
      <button type="button" class="ai-close" title="关闭" aria-label="关闭">×</button>
    </div>
    <form id="feedbackForm">
      <div class="ai-field">
        <label class="ai-label" for="feedbackEmployeeId">工号</label>
        <input id="feedbackEmployeeId" class="ai-input" name="employeeId" autocomplete="off" placeholder="请输入工号">
      </div>
      <div class="ai-field">
        <label class="ai-label" for="feedbackSuggestion">建议</label>
        <textarea id="feedbackSuggestion" class="ai-textarea" name="suggestion" placeholder="请描述你遇到的问题或优化建议"></textarea>
      </div>
      <div class="feedback-status" id="feedbackStatus"></div>
      <div class="ai-actions ai-actions--spaced">
        <button type="submit" class="btn-ai-primary" id="feedbackSubmitBtn">提交反馈</button>
        <button type="button" class="btn-ai-secondary" id="feedbackCancelBtn">取消</button>
      </div>
    </form>
  `;
  panel.querySelector(".ai-close").addEventListener("click",closeFeedbackModal);
  panel.querySelector("#feedbackCancelBtn").addEventListener("click",closeFeedbackModal);
  panel.querySelector("#feedbackForm").addEventListener("submit",submitFeedbackForm);
  modal.addEventListener("pointerdown",evt=>{
    if(evt.target===modal) closeFeedbackModal();
  });
  modal.appendChild(panel);
  document.body.appendChild(modal);
  state.feedbackModal=modal;
  const input=panel.querySelector("#feedbackEmployeeId");
  if(input && !isMobileViewport()) input.focus();
}

async function submitFeedbackForm(event){
  event.preventDefault();
  const modal=state.feedbackModal;
  if(!modal) return;
  const employeeInput=modal.querySelector("#feedbackEmployeeId");
  const suggestionInput=modal.querySelector("#feedbackSuggestion");
  const employeeId=toText(employeeInput && employeeInput.value).trim();
  const suggestion=toText(suggestionInput && suggestionInput.value).trim();
  if(!employeeId){
    setFeedbackModalState("请填写工号。");
    if(employeeInput) employeeInput.focus();
    return;
  }
  if(!suggestion){
    setFeedbackModalState("请填写建议内容。");
    if(suggestionInput) suggestionInput.focus();
    return;
  }
  try{
    setFeedbackModalState("正在提交反馈...",true);
    const response=await fetch("/api/feedback",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({employeeId,suggestion})
    });
    let payload=null;
    try{
      payload=await response.json();
    }catch(err){
      payload=null;
    }
    if(!response.ok){
      const error=new Error((payload && payload.error) || `HTTP_${response.status}`);
      error.response=response;
      throw error;
    }
    closeFeedbackModal();
    showToast("反馈已提交，感谢建议","success");
  }catch(err){
    setFeedbackModalState(getFeedbackSubmitErrorMessage(err,err && err.response),false);
  }
}

function getFeedbackSubmitErrorMessage(error,response=null){
  const message=toText(error && error.message).trim();
  const status=response && response.status;
  if(status===404){
    return "反馈接口不存在：请确认服务器已运行 Node 服务，并且 Nginx/网关已将 /api/feedback 反向代理到该服务。";
  }
  if(status===405){
    return "反馈接口方法不被允许：请确认 /api/feedback 的 POST 请求没有被静态站点或网关拦截。";
  }
  if(status===502 || status===503 || status===504){
    return message || "反馈通道暂不可用，请检查服务器到企业微信 webhook 的网络和 FEEDBACK_WEBHOOK_URL 配置。";
  }
  if(message.startsWith("Failed to fetch") || message.includes("NetworkError")){
    return "无法连接反馈接口：请确认当前域名下的 /api/feedback 可访问，且 HTTPS/CORS/反向代理配置正确。";
  }
  if(message.startsWith("HTTP_")){
    return `反馈提交失败（${message}），请检查服务器日志。`;
  }
  return message || "反馈提交失败，请稍后重试。";
}

function closeQuoteExtractConfirmModal(result=null){
  const modal=state.quoteExtractConfirmModal;
  if(!modal) return;
  modal.remove();
  const resolver=modal._resolver;
  state.quoteExtractConfirmModal=null;
  if(typeof resolver==="function"){
    resolver(result);
  }
}

function closeQuoteGenerationStrategyModal(result=null){
  const modal=state.quoteGenerationStrategyModal;
  if(!modal) return;
  modal.remove();
  const resolver=modal._resolver;
  state.quoteGenerationStrategyModal=null;
  if(typeof resolver==="function"){
    resolver(result);
  }
}

function closeQuoteUploadModal(result=false){
  const modal=state.quoteUploadModal;
  if(!modal) return;
  modal.remove();
  const resolver=modal._resolver;
  state.quoteUploadModal=null;
  if(typeof resolver==="function"){
    resolver(Boolean(result));
  }
}

function setQuoteUploadState(message,{busy=false}={}){
  const modal=state.quoteUploadModal;
  if(!modal) return;
  const status=modal.querySelector("#quoteUploadStatus");
  const chooseBtn=modal.querySelector("#quoteUploadChooseBtn");
  const cancelBtn=modal.querySelector("#quoteUploadCancelBtn");
  if(status) status.textContent=toText(message);
  if(chooseBtn) chooseBtn.disabled=Boolean(busy);
  if(cancelBtn) cancelBtn.disabled=Boolean(busy);
}

function openQuoteUploadModal(anchor=null){
  if(state.quoteUploadModal){
    closeQuoteUploadModal(false);
  }
  return new Promise(resolve=>{
    const modal=document.createElement("div");
    modal.className="ai-modal open";
    modal._resolver=resolve;
    const panel=document.createElement("div");
    panel.className="ai-modal-panel quote-upload-panel";
    panel.innerHTML=`
      <div class="ai-modal-head">
        <div>
          <div class="ai-modal-title">选择报价单</div>
          <div class="ai-modal-subtitle">当前支持报价单导出格式</div>
        </div>
        <button type="button" class="ai-close" title="关闭" aria-label="关闭">×</button>
      </div>
	      <div class="quote-upload-tip">
	        <div class="quote-upload-types">
	          <span>单台配置汇总清单</span>
	          <span>汇总清单</span>
	        </div>
	      </div>
      <div class="quote-upload-status" id="quoteUploadStatus">选择文件后会自动进入产品匹配。</div>
      <div class="ai-actions ai-actions--spaced">
        <button type="button" class="btn-ai-primary" id="quoteUploadChooseBtn">选择文件</button>
        <button type="button" class="btn-ai-secondary" id="quoteUploadCancelBtn">取消</button>
      </div>
    `;
    panel.querySelector(".ai-close").addEventListener("click",()=>closeQuoteUploadModal(false));
    panel.querySelector("#quoteUploadCancelBtn").addEventListener("click",()=>closeQuoteUploadModal(false));
    panel.querySelector("#quoteUploadChooseBtn").addEventListener("click",()=>{
      const input=document.getElementById("quoteFileInput");
      setQuoteUploadState("正在等待你选择报价单文件...");
      if(input){
        input.value="";
        input.click();
      }
    });
    modal.addEventListener("pointerdown",event=>{
      if(event.target===modal) closeQuoteUploadModal(false);
    });
    modal.appendChild(panel);
    document.body.appendChild(modal);
    state.quoteUploadModal=modal;
  });
}

function collectStrategyVendorOptions(extractResult){
  const vendors=[];
  const seen=new Set();
  const quoteProducts=Array.isArray(extractResult.quote_products) ? extractResult.quote_products : [];
  quoteProducts.forEach(product=>{
    const matchedProduct=getBestDatabaseProductForQuoteProduct(product,extractResult);
    const vendorHeaders=Array.isArray(matchedProduct && matchedProduct.vendorHeaders) ? matchedProduct.vendorHeaders : [];
    vendorHeaders
      .map(vendor=>toText(vendor).trim())
      .filter(vendor=>vendor && !vendor.includes("深信服"))
      .forEach(vendor=>{
        if(seen.has(vendor)) return;
        seen.add(vendor);
        vendors.push(vendor);
      });
  });
  return vendors;
}

function openQuoteGenerationStrategyModal(extractResult,initialStrategy=null){
  if(state.quoteGenerationStrategyModal){
    closeQuoteGenerationStrategyModal(null);
  }
  return new Promise(resolve=>{
    const modal=document.createElement("div");
    modal.className="ai-modal open";
    modal._resolver=resolve;
    const panel=document.createElement("div");
    panel.className="ai-modal-panel quote-strategy-panel";
    const vendorOptions=collectStrategyVendorOptions(extractResult);
    const selectedVendorSet=new Set(normalizeTextArray(initialStrategy && initialStrategy.target_vendors));
    const controlLevel=toText(initialStrategy && initialStrategy.control_level).trim() || "general";
    const vendorHtml=vendorOptions.length
      ? vendorOptions.map(vendor=>`
          <label class="quote-strategy-vendor">
            <input type="checkbox" name="targetVendors" data-role="vendor" value="${escapeHtml(vendor)}"${selectedVendorSet.has(vendor) ? " checked" : ""}>
            <span>${escapeHtml(vendor)}</span>
          </label>
        `).join("")
      : `<div class="ai-inline-hint">当前确认产品没有可用的厂商对比数据，将按通用策略生成参数。</div>`;
    panel.innerHTML=`
      <div class="ai-modal-head">
        <div>
          <div class="ai-modal-title">生成策略</div>
          <div class="ai-modal-subtitle">设置后进入自动选参。</div>
        </div>
        <button type="button" class="ai-close" title="关闭" aria-label="关闭">×</button>
      </div>
      <div class="quote-strategy-compact">
        <div class="ai-field format-option-full">
          <label class="ai-label">竞争厂商</label>
          <div class="quote-strategy-vendors">${vendorHtml}</div>
        </div>
        <div class="ai-field">
          <label class="ai-label">把控力度</label>
          <div class="quote-strategy-levels" role="radiogroup" aria-label="把控力度">
            <label class="quote-strategy-level"><input type="radio" name="quoteControlLevel" value="public"${controlLevel==="public" ? " checked" : ""}> 公参</label>
            <label class="quote-strategy-level"><input type="radio" name="quoteControlLevel" value="general"${controlLevel==="general" ? " checked" : ""}> 一般控</label>
            <label class="quote-strategy-level"><input type="radio" name="quoteControlLevel" value="strict"${controlLevel==="strict" ? " checked" : ""}> 控死</label>
          </div>
        </div>
      </div>
      <div class="ai-actions ai-actions--spaced">
        <button type="button" class="btn-ai-primary" id="quoteStrategyConfirmBtn">确认并生成参数</button>
        <button type="button" class="btn-ai-secondary" id="quoteStrategyBackBtn">上一步</button>
        <button type="button" class="btn-ai-secondary" id="quoteStrategyCancelBtn">取消</button>
      </div>
    `;
    panel.querySelector(".ai-close").addEventListener("click",()=>closeQuoteGenerationStrategyModal(null));
    panel.querySelector("#quoteStrategyBackBtn").addEventListener("click",()=>{
      const selectedVendors=[...panel.querySelectorAll('input[data-role="vendor"]:checked')].map(input=>toText(input.value).trim()).filter(Boolean);
      const controlLevelInput=panel.querySelector('input[name="quoteControlLevel"]:checked');
      closeQuoteGenerationStrategyModal({
        action:"back",
        target_vendors:selectedVendors,
        control_level:controlLevelInput ? toText(controlLevelInput.value).trim() : "general"
      });
    });
    panel.querySelector("#quoteStrategyCancelBtn").addEventListener("click",()=>closeQuoteGenerationStrategyModal(null));
    panel.querySelector("#quoteStrategyConfirmBtn").addEventListener("click",()=>{
      const selectedVendors=[...panel.querySelectorAll('input[data-role="vendor"]:checked')].map(input=>toText(input.value).trim()).filter(Boolean);
      const controlLevelInput=panel.querySelector('input[name="quoteControlLevel"]:checked');
      closeQuoteGenerationStrategyModal({
        target_vendors:selectedVendors,
        control_level:controlLevelInput ? toText(controlLevelInput.value).trim() : "general"
      });
    });
    modal.appendChild(panel);
    modal.addEventListener("pointerdown",event=>{
      if(event.target===modal) closeQuoteGenerationStrategyModal(null);
    });
    document.body.appendChild(modal);
    state.quoteGenerationStrategyModal=modal;
  });
}

function openQuoteExtractConfirmModal(extractResult,lineItems){
  if(state.quoteExtractConfirmModal){
    closeQuoteExtractConfirmModal(null);
  }
  return new Promise(resolve=>{
    const modal=document.createElement("div");
    modal.className="ai-modal open";
    modal._resolver=resolve;
    const panel=document.createElement("div");
    panel.className="ai-modal-panel quote-confirm-panel";
    panel.innerHTML=`
      <div class="ai-modal-head">
        <div>
          <div class="ai-modal-title">确认产品匹配</div>
          <div class="ai-modal-subtitle">请确认每个报价产品对应的参数库产品是否正确。</div>
        </div>
        <button type="button" class="ai-close" title="关闭" aria-label="关闭">×</button>
      </div>
      <div class="quote-confirm-list"></div>
      <div class="ai-actions ai-actions--spaced">
        <button type="button" class="btn-ai-primary" id="quoteExtractConfirmBtn">确认并进入 AI 生成</button>
        <button type="button" class="btn-ai-secondary" id="quoteExtractCancelBtn">取消</button>
      </div>
    `;
    const list=panel.querySelector(".quote-confirm-list");
    const products=Array.isArray(extractResult.quote_products) ? extractResult.quote_products : [];
    const productOptions=getQuoteConfirmProductOptions();
    products.forEach((product,index)=>{
      const preservedProductId=Number(product.__matchedProductId);
      const matchedProduct=Number.isFinite(preservedProductId) && preservedProductId>0
        ? getProductById(preservedProductId)
        : getBestDatabaseProductForQuoteProduct(product,extractResult);
      const selectedProductId=matchedProduct ? String(matchedProduct.id) : "";
      const includeProduct=product.__includeProduct!==false;
      const targetParamCount=Math.min(30,Math.max(1,Number(product.target_param_count) || 15));
      const optionHtml=[
        '<option value="">未匹配</option>',
        ...productOptions.map(option=>`<option value="${option.id}"${String(option.id)===selectedProductId ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
      ].join("");
      const item=document.createElement("div");
      item.className=`quote-confirm-item${includeProduct ? "" : " skipped"}`;
      item.innerHTML=`
        <div class="quote-confirm-item-head">
          <div class="quote-confirm-item-title">${escapeHtml(toText(product.quote_product_name).trim() || `产品${index+1}`)}</div>
          <div class="quote-confirm-match">
            <select class="ai-select" name="productMatch" data-role="productMatch" aria-label="参数库产品">${optionHtml}</select>
          </div>
          <div class="quote-confirm-count">
            <span class="quote-confirm-count-label" aria-hidden="true">条数</span>
            <input class="ai-input" type="number" min="1" max="30" step="1" inputmode="numeric" name="paramCount" data-role="paramCount" value="${targetParamCount}" aria-label="生成参数数量" title="生成参数数量">
          </div>
          <label class="quote-confirm-toggle" title="取消勾选后将跳过该产品">
            <input type="checkbox" data-role="includeProduct"${includeProduct ? " checked" : ""} aria-label="生成参数">
          </label>
        </div>
        <div class="quote-confirm-warning">请选择参数库产品。</div>
      `;
      item.dataset.index=String(index);
      list.appendChild(item);
    });
    list.addEventListener("change",event=>{
      const target=event.target;
      const item=target.closest(".quote-confirm-item");
      if(!item) return;
      if(target.matches('[data-role="productMatch"]')){
        item.classList.remove("invalid");
        return;
      }
      if(target.matches('[data-role="includeProduct"]')){
        item.classList.toggle("skipped",!target.checked);
        item.classList.remove("invalid");
      }
    });
    panel.querySelector(".ai-close").addEventListener("click",()=>closeQuoteExtractConfirmModal(null));
    panel.querySelector("#quoteExtractCancelBtn").addEventListener("click",()=>closeQuoteExtractConfirmModal(null));
    panel.querySelector("#quoteExtractConfirmBtn").addEventListener("click",()=>{
      const invalidItems=[...list.querySelectorAll(".quote-confirm-item")].filter(item=>{
        const included=!(item.querySelector('[data-role="includeProduct"]') && !item.querySelector('[data-role="includeProduct"]').checked);
        if(!included) return false;
        const matchedValue=toText(item.querySelector('[data-role="productMatch"]').value).trim();
        return !matchedValue;
      });
      list.querySelectorAll(".quote-confirm-item.invalid").forEach(item=>item.classList.remove("invalid"));
      if(invalidItems.length>0){
        invalidItems.forEach(item=>item.classList.add("invalid"));
        invalidItems[0].scrollIntoView({block:"center",behavior:"smooth"});
        showToast(`有 ${invalidItems.length} 个报价产品尚未匹配参数库产品，请先选择。`,"error",panel.querySelector("#quoteExtractConfirmBtn"));
        return;
      }
      const allProducts=[...list.querySelectorAll(".quote-confirm-item")]
        .map(item=>{
          const index=Number(item.dataset.index);
          const source=products[index];
          const matchedProductId=Number(item.querySelector('[data-role="productMatch"]').value);
          const matchedProduct=Number.isFinite(matchedProductId)
            ? getProductById(matchedProductId)
            : null;
          const paramCountInput=item.querySelector('[data-role="paramCount"]');
          const targetParamCount=Math.min(30,Math.max(1,Number(paramCountInput && paramCountInput.value) || 15));
          const includeProduct=!(item.querySelector('[data-role="includeProduct"]') && !item.querySelector('[data-role="includeProduct"]').checked);
          const draft={
            ...source,
            __includeProduct:includeProduct,
            __matchedProductId:Number.isFinite(matchedProductId) ? matchedProductId : null,
            quote_product_name:source.quote_product_name,
            target_param_count:targetParamCount,
            database_product_hint:toText(matchedProduct && matchedProduct.name).trim(),
            product_line_hints:matchedProduct
              ? normalizeTextArray([matchedProduct.productLine])
              : source.product_line_hints,
            version_hints:matchedProduct && toText(matchedProduct.version).trim()
              ? normalizeTextArray([matchedProduct.version])
              : source.version_hints,
            keywords:matchedProduct
              ? [...new Set([...normalizeTextArray(source.keywords),toText(matchedProduct.name).trim(),toText(matchedProduct.sheetName).trim(),toText(matchedProduct.productLine).trim()])]
              : source.keywords
          };
          return draft;
        });
      const nextProducts=allProducts.filter(product=>product.__includeProduct!==false);
      if(nextProducts.length===0){
        showToast("至少需要选择 1 个报价产品进入生成。","error",panel.querySelector("#quoteExtractConfirmBtn"));
        return;
      }
      closeQuoteExtractConfirmModal({
        quote_products:nextProducts,
        quote_export_type:extractResult.quote_export_type,
        quote_export_type_label:extractResult.quote_export_type_label,
        quote_export_confidence:extractResult.quote_export_confidence,
        quote_export_signals:extractResult.quote_export_signals,
        global_keywords:extractResult.global_keywords,
        notes:extractResult.notes,
        __all_quote_products:allProducts
      });
    });
    modal.appendChild(panel);
    modal.addEventListener("pointerdown",event=>{
      if(event.target===modal) closeQuoteExtractConfirmModal(null);
    });
    document.body.appendChild(modal);
    state.quoteExtractConfirmModal=modal;
  });
}

// ===== 加载动画 =====
function showLoading(message="正在加载数据..."){
  hideLoading();
  const overlay=document.createElement("div");
  overlay.id="loading-overlay";
  overlay.className="loading-overlay";
  overlay.innerHTML=`
    <div class="loading-box">
      <div class="spinner"></div>
      <div class="loading-text">${escapeHtml(message)}</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideLoading(){
  const overlay=document.getElementById("loading-overlay");
  if(overlay) overlay.remove();
  if(state.aiTaskProgressTimer){
    clearInterval(state.aiTaskProgressTimer);
    state.aiTaskProgressTimer=null;
  }
  state.aiTask=null;
  state.quoteSelectProgress=null;
}

function showAiTaskProgress(title,steps,currentIndex=0){
  hideLoading();
  state.aiTask={title,steps:[...steps],currentIndex,errorIndex:null,startedAt:performance.now()};
  renderAiTaskProgress();
  startAiProgressHeartbeat();
}

function updateAiTaskProgress(currentIndex,errorIndex=null){
  if(!state.aiTask) return;
  state.aiTask.currentIndex=currentIndex;
  state.aiTask.errorIndex=errorIndex;
  renderAiTaskProgress();
}

function ensureQuoteProgressOverlay(){
  let overlay=document.getElementById("loading-overlay");
  if(!overlay){
    overlay=document.createElement("div");
    overlay.id="loading-overlay";
    overlay.className="loading-overlay";
    document.body.appendChild(overlay);
  }
  if(!overlay.querySelector(".quote-progress-box")){
    overlay.innerHTML=`
      <div class="loading-box quote-progress-box">
        <div class="quote-progress-head">
          <div class="quote-progress-title">AI 正在生成中</div>
        </div>
        <div class="quote-progress-track">
          <div class="quote-progress-fill" style="width:0%"></div>
        </div>
        <div class="quote-progress-sub">
          <span data-role="quoteProgressStatus">准备调用 AI</span>
          <span data-role="quoteProgressPercent">0%</span>
        </div>
      </div>
    `;
  }
  return overlay;
}

function updateQuoteProgressView(statusText,percent){
  const overlay=ensureQuoteProgressOverlay();
  const safePercent=Math.min(100,Math.max(0,Number(percent) || 0));
  const fill=overlay.querySelector(".quote-progress-fill");
  const status=overlay.querySelector('[data-role="quoteProgressStatus"]');
  const percentText=overlay.querySelector('[data-role="quoteProgressPercent"]');
  if(fill) fill.style.width=`${safePercent}%`;
  if(status) status.textContent=toText(statusText);
  if(percentText) percentText.textContent=`${safePercent}%`;
}

function startAiProgressHeartbeat(){
  if(state.aiTaskProgressTimer){
    clearInterval(state.aiTaskProgressTimer);
  }
  state.aiTaskProgressTimer=setInterval(()=>{
    if(state.quoteSelectProgress){
      renderQuoteSelectProgress();
    }else if(state.aiTask){
      renderAiTaskProgress();
    }
  },15000);
}

function getLongRunningStatusText(baseText,startedAt){
  const base=toText(baseText).trim() || "AI 正在处理";
  const elapsed=performance.now()-(Number(startedAt) || performance.now());
  if(elapsed<30000) return base;
  return `${base} - 已等待 ${formatDurationMs(elapsed)}，FastGPT 繁忙时会继续等待`;
}

function renderAiTaskProgress(){
  if(!state.aiTask) return;
  const steps=state.aiTask.steps || [];
  const currentIndex=Number(state.aiTask.currentIndex) || 0;
  const errorIndex=Number.isInteger(state.aiTask.errorIndex) ? state.aiTask.errorIndex : null;
  const total=Math.max(steps.length,1);
  const completed=Math.min(Math.max((errorIndex!==null ? errorIndex : currentIndex)+1,0),total);
  const percent=Math.round((completed / total) * 100);
  const activeStep=steps[Math.min(Math.max(currentIndex,0),Math.max(steps.length-1,0))] || "处理中";
  const playfulStatusMap={
    "生成第一条和模块":"正在给每个产品打底稿",
    "准备参数库":"正在翻参数库的小本本",
    "生成后续参数":"正在挑合适的参数",
    "应用到页面":"马上贴回页面里"
  };
  const statusText=errorIndex!==null
    ? "这一步卡住了，正在收尾提示"
    : (completed>=total ? "搞定，正在收口" : (playfulStatusMap[activeStep] || activeStep));
  updateQuoteProgressView(getLongRunningStatusText(statusText,state.aiTask.startedAt),percent);
}

function getQuoteTaskName(task,fallbackIndex=0){
  const name=toText(task && task.quoteProduct && task.quoteProduct.quote_product_name).trim();
  return name || `产品${fallbackIndex+1}`;
}

function showQuoteSelectProgress(tasks,taskCount){
  hideLoading();
  state.quoteSelectProgress={
    total:tasks.length,
    taskCount,
    statuses:new Array(tasks.length).fill("waiting"),
    done:0,
    running:0,
    error:0,
    startedAt:performance.now()
  };
  renderQuoteSelectProgress();
  startAiProgressHeartbeat();
}

function updateQuoteSelectProgress(taskIndex,status,message){
  const progress=state.quoteSelectProgress;
  if(!progress || !Array.isArray(progress.statuses)) return;
  const previous=progress.statuses[taskIndex];
  if(previous===status) return;
  progress.statuses[taskIndex]=status;
  progress.done=progress.statuses.filter(item=>item==="success" || item==="error").length;
  progress.running=progress.statuses.filter(item=>item==="running").length;
  progress.error=progress.statuses.filter(item=>item==="error").length;
  renderQuoteSelectProgress();
}

function renderQuoteSelectProgress(){
  const progress=state.quoteSelectProgress;
  if(!progress || !Array.isArray(progress.statuses)) return;
  const total=Math.max(progress.total,1);
  const percent=Math.round((progress.done / total) * 100);
  const statusText=progress.done>=progress.total
    ? (progress.error ? `完成，${progress.error} 个失败` : "全部完成")
    : (progress.running ? `正在生成参数（${progress.running} 个进行中）` : "准备调用 AI");
  updateQuoteProgressView(getLongRunningStatusText(statusText,progress.startedAt),percent);
}

// ===== Toast 通知 =====
function showToast(msg,type="success",anchorEl=null){
  const stack=getToastStack();
  const toast=document.createElement("div");
  toast.className="toast "+(type || "success");
  if(type==="error"){
    toast.setAttribute("role","alert");
    toast.setAttribute("aria-live","assertive");
  }else{
    toast.setAttribute("role","status");
    toast.setAttribute("aria-live","polite");
  }
  toast.innerText=msg;
  const pos=getToastPosition(anchorEl);
  toast.style.left=`${pos.left}px`;
  toast.style.top=`${pos.top}px`;
  if(pos.below){
    toast.classList.add("below");
  }
  stack.appendChild(toast);
  setTimeout(()=>{
    toast.remove();
    if(stack.childElementCount===0){
      stack.remove();
    }
  },2000);
}

function getProductById(productId){
  return state.products.find(item=>item.id===productId) || null;
}

function getInstanceById(instanceId){
  return state.instances.find(item=>item.id===instanceId) || null;
}

function getInstancesByProduct(productId){
  return state.instances.filter(item=>item.productId===productId);
}

function getParamsByProductId(productId){
  if(productId===undefined || productId===null) return [];
  return state.parameters.filter(param=>param.product_id===productId);
}

function getActiveInstance(){
  return getInstanceById(state.activeInstanceId);
}

function getInstanceNameKey(name){
  return toText(name).trim().toLowerCase();
}

function isInstanceNameTaken(name,excludeInstanceId=null){
  const key=getInstanceNameKey(name);
  if(!key) return false;
  return state.instances.some(instance=>(
    instance.id!==excludeInstanceId &&
    getInstanceNameKey(instance.name)===key
  ));
}

function getUniqueInstanceName(baseName,excludeInstanceId=null){
  const normalizedBase=toText(baseName).trim() || "产品";
  if(!isInstanceNameTaken(normalizedBase,excludeInstanceId)){
    return normalizedBase;
  }
  let suffix=2;
  let candidate=`${normalizedBase} (${suffix})`;
  while(isInstanceNameTaken(candidate,excludeInstanceId)){
    suffix+=1;
    candidate=`${normalizedBase} (${suffix})`;
  }
  return candidate;
}

function rememberLastActiveInstance(instance){
  if(!instance || !instance.productId) return;
  state.lastActiveInstanceByProduct[String(instance.productId)]=instance.id;
}

function getRememberedInstance(productId){
  const rememberedId=state.lastActiveInstanceByProduct[String(productId)];
  if(!rememberedId) return null;
  const instance=getInstanceById(rememberedId);
  if(!instance || instance.productId!==productId){
    delete state.lastActiveInstanceByProduct[String(productId)];
    return null;
  }
  return instance;
}

function getNextInstanceName(productId){
  const product=getProductById(productId);
  const baseName=toText(
    product && (product.name || product.sheetName),
    "产品"
  );
  let nextIndex=getInstancesByProduct(productId).length+1;
  let candidate=`${baseName}-${nextIndex}`;
  while(isInstanceNameTaken(candidate)){
    nextIndex+=1;
    candidate=`${baseName}-${nextIndex}`;
  }
  return candidate;
}

function createInstance(productId,name=""){
  const preferredName=toText(name).trim() || getNextInstanceName(productId);
  const finalName=getUniqueInstanceName(preferredName);
  return {
    id:`ins_${state.instanceSeed++}`,
    productId,
    name:finalName,
    selected:[],
    editedContentByParamId:{},
    customParamSeed:1
  };
}

function setSidebarActiveProduct(productId,activeElement){
  document.querySelectorAll(".product").forEach(item=>item.classList.remove("active"));
  const target=activeElement || document.querySelector(`.product[data-product-id="${productId}"]`);
  if(target) target.classList.add("active");
}

function showEditorPanels(){
  document.body.classList.remove("guide-visible");
  setGuideLoadingState(false);
  document.getElementById("guideState").style.display="none";
  document.getElementById("leftPanel").style.display="block";
  document.getElementById("rightPanel").style.display="flex";
}

function showGuidePanel(){
  document.body.classList.add("guide-visible");
  document.getElementById("leftPanel").style.display="none";
  document.getElementById("rightPanel").style.display="none";
  document.getElementById("guideState").style.display="flex";
}

function renderSidebarSkeleton(){
  const sidebar=document.getElementById("sidebar");
  if(!sidebar) return;
  sidebar.innerHTML=`
    <div class="sidebar-skeleton" aria-label="参数库加载中">
      <div class="sidebar-skeleton-line long"></div>
      <div class="sidebar-skeleton-line medium"></div>
      <div class="sidebar-skeleton-line short"></div>
      <div class="sidebar-skeleton-line long"></div>
      <div class="sidebar-skeleton-line medium"></div>
      <div class="sidebar-skeleton-line short"></div>
      <div class="sidebar-skeleton-line long"></div>
      <div class="sidebar-skeleton-line medium"></div>
    </div>
  `;
}

function setGuideLoadingState(isLoading,metaText=""){
  const guide=document.getElementById("guideState");
  const kicker=document.getElementById("guideKicker");
  const title=document.getElementById("guideTitle");
  const subtitle=document.getElementById("guideSubtitle");
  const meta=document.getElementById("guideCatalogMeta");
  const isFailed=!isLoading && /失败|错误|不可用/.test(toText(metaText));
  if(guide){
    guide.classList.toggle("loading",Boolean(isLoading));
    guide.classList.toggle("error",Boolean(isFailed));
  }
  if(kicker) kicker.textContent=isLoading ? "参数库加载中" : (isFailed ? "参数库加载失败" : "参数库已就绪");
  if(meta) meta.textContent=isLoading ? (metaText || "正在加载参数库...") : (metaText || "参数库已准备就绪。");
  if(title) title.textContent=isLoading ? "系统正在准备参数库" : "从报价单到招标参数，一步成稿";
  if(subtitle){
    subtitle.textContent=isLoading
      ? "参数库加载完成后即可开始上传报价单或选择产品。"
      : "上传报价单，确认产品匹配，系统会生成可编辑、可评分、可导出的参数草稿。";
  }
}

function focusSidebarFirstProduct(event){
  const anchor=getEventAnchor(event);
  if(state.products.length===0){
    showToast("参数库还在加载，请稍后再试","error",anchor);
    return;
  }
  const product=state.products[0];
  const productEl=document.querySelector(`.product[data-product-id="${product.id}"]`);
  if(productEl){
    const lineContainer=productEl.closest(".sidebar-versions");
    if(lineContainer){
      lineContainer.style.display="block";
      const lineTitle=lineContainer.previousElementSibling;
      if(lineTitle && lineTitle.classList.contains("level-line")){
        lineTitle.textContent=lineTitle.textContent.replace(/^▶ /,"▼ ");
        lineTitle.setAttribute("aria-expanded","true");
      }
    }
    productEl.scrollIntoView({block:"center"});
  }
  if(isMobileViewport()){
    const instance=ensureDefaultInstanceForProduct(product.id);
    activateInstance(instance.id,productEl);
    setMobileTab("select");
    closeMobileProductDrawer();
    return;
  }
  openProductWithoutInstance(product.id,productEl);
}

function readSelectedExcelFile(file){
  if(file && typeof file.arrayBuffer==="function"){
    return file.arrayBuffer();
  }

  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error("FILE_READ"));
    reader.readAsArrayBuffer(file);
  });
}

function resetWorkbookState(){
  state.products=[];
  state.parameters=[];
  state.selected=[];
  state.currentParams=[];
  state.currentProductId=null;
  state.editedContentByParamId={};
  state.instances=[];
  state.activeInstanceId=null;
  state.lastActiveInstanceByProduct={};
  state.instanceSeed=1;
  state.mobileSelectScrollByProduct={};
  renderProductMeta(null);
  buildSidebar();
  renderInstancePanel();
  renderParamList();
  renderEditArea();
  schedulePreviewUpdate();
  showGuidePanel();
  updateMobileContext();
  updatePreviewScore({
    totalCount:0,
    vendorSatisfiedCount:0,
    starCount:0,
    triangleCount:0
  });
}

function initAiSettings(){
  // AI settings are embedded for the one-click quote upload workflow.
}

function getQuoteProductAnalyzeAiSettings(){
  return {
    flowKey:QUOTE_PRODUCT_ANALYZE_AI_FLOW_KEY,
    endpoint:QUOTE_PRODUCT_ANALYZE_AI_ENDPOINT,
    model:QUOTE_PRODUCT_ANALYZE_AI_MODEL
  };
}

function getQuoteSelectAiSettings(){
  return {
    flowKey:QUOTE_SELECT_AI_FLOW_KEY,
    endpoint:QUOTE_SELECT_AI_ENDPOINT,
    apiKeys:[],
    model:QUOTE_SELECT_AI_MODEL
  };
}

function getRewriteAiSettings(){
  return {
    flowKey:REWRITE_AI_FLOW_KEY,
    endpoint:REWRITE_AI_ENDPOINT,
    model:REWRITE_AI_MODEL
  };
}

function getFormatAiSettings(){
  return {
    flowKey:FORMAT_AI_FLOW_KEY,
    endpoint:FORMAT_AI_ENDPOINT,
    model:FORMAT_AI_MODEL
  };
}

function hasAiSettings(settings){
  if(toText(settings && settings.flowKey).trim()) return true;
  return Boolean(toText(settings && settings.endpoint).trim() && toText(settings && settings.apiKey).trim());
}

let aiFlowStatusCache=null;
async function getAiFlowStatus(){
  if(aiFlowStatusCache) return aiFlowStatusCache;
  try{
    const response=await fetch(`${window.location.origin}/api/ai-flows`,{cache:"no-store"});
    if(!response.ok) throw new Error(`AI_FLOW_STATUS_${response.status}`);
    const payload=await response.json();
    aiFlowStatusCache=payload && payload.flows ? payload.flows : {};
  }catch(err){
    console.warn("AI 流程状态读取失败，将按本地默认继续",err);
    aiFlowStatusCache={};
  }
  return aiFlowStatusCache;
}

async function isConfiguredAiFlow(settings){
  if(!hasAiSettings(settings)) return false;
  const flowKey=toText(settings && settings.flowKey).trim();
  if(!flowKey) return true;
  const status=await getAiFlowStatus();
  if(!Object.prototype.hasOwnProperty.call(status,flowKey)){
    return true;
  }
  return Boolean(status[flowKey] && status[flowKey].configured);
}

function normalizeHeaderText(value){
  return toText(value).trim().replace(/\s+/g,"");
}

function createHeaderMap(cells){
  const map={};
  cells.forEach((cell,index)=>{
    const key=normalizeHeaderText(cell);
    if(key && map[key]===undefined){
      map[key]=index;
    }
  });
  return map;
}

function hasHeaders(headerMap,headers){
  return headers.every(header=>headerMap[header]!==undefined);
}

function hasAnyHeader(headerMap,headers){
  return headers.some(header=>headerMap[header]!==undefined);
}

function findQuoteTables(standardQuote){
  const tables=[];
  const sheets=Array.isArray(standardQuote && standardQuote.sheets) ? standardQuote.sheets : [];
  const quoteSheet=sheets[1] || sheets.find(sheet=>!/价格总表/.test(toText(sheet && sheet.name))) || null;
  (quoteSheet ? [quoteSheet] : []).forEach(sheet=>{
    (sheet.rows || []).forEach((row,rowIndex)=>{
      const cells=Array.isArray(row.cells) ? row.cells : [];
      const headerMap=createHeaderMap(cells);
      const isDetail=hasHeaders(headerMap,["序号","产品名称","物料名称","规格型号","物料说明","购买数量"]) && hasAnyHeader(headerMap,["产品型号","产品说明"]);
      const isSingle=hasHeaders(headerMap,["序号","产品名称","产品说明","总数量","单位"]);
      const isAggregate=hasHeaders(headerMap,["序号","产品名称","产品说明","产品含税总价(元)"]) && !hasHeaders(headerMap,["总数量","单位"]);
      if(isDetail || isSingle || isAggregate){
        tables.push({
          sheet,
          headerRowIndex:rowIndex,
          headerMap,
          family:isDetail ? "detail" : (isSingle ? "single" : "aggregate"),
          rows:(sheet.rows || []).slice(rowIndex+1)
            .map(sourceRow=>({
              source_sheet_name:toText(sheet.name).trim(),
              source_row_number:Number(sourceRow.row_number) || 0,
              cells:Array.isArray(sourceRow.cells) ? sourceRow.cells : []
            }))
            .filter(item=>getCell(item,headerMap,"序号") || getCell(item,headerMap,"产品名称") || getCell(item,headerMap,"产品型号") || getCell(item,headerMap,"产品说明") || getCell(item,headerMap,"物料名称"))
        });
      }
    });
  });
  return tables;
}

function getCell(row,headerMap,headerName){
  const index=headerMap[headerName];
  return index===undefined ? "" : toText(row.cells[index]).trim();
}

function parseNumberLike(value){
  const text=toText(value).replace(/,/g,"").trim();
  const match=text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function getGroupSerial(value){
  const text=toText(value).trim();
  return text.split("-")[0] || text;
}

function getQuoteProductGroupKey(row,headerMap){
  return [
    getCell(row,headerMap,"序号"),
    getCell(row,headerMap,"产品名称"),
    getCell(row,headerMap,"产品型号") || getDescriptionIntro(getCell(row,headerMap,"产品说明")).slice(0,80)
  ].join("|");
}

function parseDeviceCountFromText(text){
  const match=toText(text).match(/(\d+(?:\.\d+)?)\s*台\s*[*×xX]/);
  return match ? Number(match[1]) : null;
}

function parseComponentLine(line){
  const text=toText(line).trim().replace(/[；;]\s*$/,"");
  if(!text || !text.includes("*")) return null;
  const [left,...rightParts]=text.split("*");
  const leftText=toText(left).trim();
  if(!/^\d+(?:\.\d+)?/.test(leftText)) return null;
  if(leftText.length>24) return null;
  const name=rightParts.join("*").trim();
  const quantity=parseNumberLike(left);
  const unitMatch=toText(left).trim().match(/^\s*\d+(?:\.\d+)?\s*([^\d\s*×xX]+)?/);
  const unit=unitMatch && unitMatch[1] ? unitMatch[1].trim() : "";
  if(!unit) return null;
  if(!name) return null;
  return {
    name,
    raw_quantity:quantity,
    unit,
    source_text:text
  };
}

function parseComponentsFromDescription(description){
  const lines=toText(description)
    .split(/\r\n|\n|\r|;/)
    .map(item=>item.trim())
    .filter(Boolean);
  return lines
    .map(parseComponentLine)
    .filter(Boolean);
}

function classifyComponentAllocation(component,deviceCount,contextType){
  const name=toText(component && component.name);
  const unit=toText(component && component.unit);
  const rawQuantity=Number(component && component.raw_quantity);
  const hasQuantity=Number.isFinite(rawQuantity);
  const count=Number(deviceCount) || 0;
  const neverSplitPattern=/(容量授权|存储容量|统一存储容量|授权-\d+(?:\.\d+)?\s*[Tt]|容量|License)/i;
  const servicePattern=/(维保|质保|升级|订阅|服务(?!器)|基础运维软件|基础运维服务|运维服务|规则库升级)/;
  const perDevicePattern=/(硬盘|固态|机械盘|内存|电源|网口|电口|光口|端口|接口|接口卡|服务器定制费|CPU|缓存盘|数据盘)/i;

  if(neverSplitPattern.test(name)){
    return {allocation_type:"total_license",per_device_quantity:null,reason:"容量/总授权类组件不按设备台数拆分"};
  }
  if(servicePattern.test(name) && !perDevicePattern.test(name)){
    return {allocation_type:"service_or_subscription",per_device_quantity:null,reason:"服务/订阅/升级类组件保留原始数量"};
  }
  if(contextType==="single_unit_summary"){
    return {allocation_type:"per_device",per_device_quantity:hasQuantity ? rawQuantity : null,reason:"单台配置清单中的每台含"};
  }
  if(hasQuantity && count>1 && rawQuantity % count===0){
    return {allocation_type:"per_device",per_device_quantity:rawQuantity/count,reason:`${rawQuantity}/${count}=每台 ${rawQuantity/count}`};
  }
  if(hasQuantity && count>1){
    return {allocation_type:"ambiguous_quantity",per_device_quantity:null,reason:`总数量 ${rawQuantity} 无法按 ${count} 台整除或需要人工确认`};
  }
  return {allocation_type:"as_listed",per_device_quantity:hasQuantity ? rawQuantity : null,reason:"按原始清单数量保留"};
}

function enrichComponent(component,deviceCount,contextType,source){
  const allocation=classifyComponentAllocation(component,deviceCount,contextType);
  return {
    ...component,
    ...allocation,
    source_sheet_name:source && source.source_sheet_name || "",
    source_row_number:source && source.source_row_number || 0
  };
}

function detectQuoteExportType(tables){
  const detailTable=tables.find(table=>table.family==="detail");
  if(detailTable){
    return {
      type:"detail_itemized",
      confidence:0.98,
      signals:["存在物料名称/规格型号/物料说明/购买数量等详情列","按序号前缀分组识别主设备和配件"]
    };
  }
  const aggregateTable=tables.find(table=>table.family==="aggregate");
  if(aggregateTable){
    return {
      type:"aggregate_summary",
      confidence:0.92,
      signals:["存在产品说明和产品含税总价列","不存在总数量/单位/含税单价列","产品说明中通常包含 N台* 和总配件数量"]
    };
  }
  const singleTable=tables.find(table=>table.family==="single");
  if(singleTable){
    const groups=new Map();
    singleTable.rows.forEach(row=>{
      const key=getQuoteProductGroupKey(row,singleTable.headerMap);
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(row);
    });
    const splitGroups=[...groups.values()].filter(rows=>{
      if(rows.length<3) return false;
      const firstDescription=toText(getCell(rows[0],singleTable.headerMap,"产品说明"));
      const continuationRows=rows.slice(1);
      const continuationText=continuationRows.map(row=>toText(getCell(row,singleTable.headerMap,"产品说明"))).join("\n");
      const continuationUnits=continuationRows.map(row=>toText(getCell(row,singleTable.headerMap,"单位"))).join("，");
      const hasHardwareMain=/硬件参数|性能参数|标准产品|每台含/.test(firstDescription);
      const hasSoftwareContinuation=/(软件|授权|许可|组件|虚拟化|管理|运维|升级|服务|容量授权|OS授权)/.test(continuationText) || /(套|年|点|个)/.test(continuationUnits);
      return hasHardwareMain && hasSoftwareContinuation;
    });
    if(splitGroups.length>0){
      return {
        type:"software_split",
        confidence:0.9,
        signals:["存在总数量/单位列","同一序号+产品名称+产品型号拆成多条软件/授权/服务行","当前暂不支持软件拆分型报价单"]
      };
    }
    return {
      type:"single_unit_summary",
      confidence:0.86,
      signals:["存在总数量/单位列","同一产品基本只出现一行","产品说明中的每台含按单台配置处理"]
    };
  }
  return {
    type:"unknown",
    confidence:0.35,
    signals:["未命中单台配置汇总清单或汇总清单表头组合"]
  };
}

function createNormalizedProductBase(row,headerMap){
  return {
    source_sheet_name:row.source_sheet_name,
    source_row_number:row.source_row_number,
    serial_no:getCell(row,headerMap,"序号"),
    product_name:getCell(row,headerMap,"产品名称"),
    product_model:getCell(row,headerMap,"产品型号"),
    product_note:getCell(row,headerMap,"产品备注"),
    description:getCell(row,headerMap,"产品说明"),
    device_count:parseNumberLike(getCell(row,headerMap,"总数量")) || parseDeviceCountFromText(getCell(row,headerMap,"产品说明")) || 1,
    unit:getCell(row,headerMap,"单位") || "台",
    components:[],
    warnings:[]
  };
}

function normalizeSingleTable(table,type){
  if(type==="single_unit_summary"){
    return table.rows.map(row=>{
      const product=createNormalizedProductBase(row,table.headerMap);
      product.components=parseComponentsFromDescription(product.description)
        .map(component=>enrichComponent(component,product.device_count,type,row));
      return product;
    });
  }

  const groups=new Map();
  table.rows.forEach(row=>{
    const key=getQuoteProductGroupKey(row,table.headerMap);
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(row);
  });

  return [...groups.values()].map(rows=>{
    const mainRow=rows.find(row=>toText(getCell(row,table.headerMap,"产品说明")).includes("硬件参数")) || rows[0];
    const product=createNormalizedProductBase(mainRow,table.headerMap);
    product.export_group_row_count=rows.length;
    product.components=parseComponentsFromDescription(product.description)
      .map(component=>enrichComponent(component,product.device_count,"single_unit_summary",mainRow));
    rows.filter(row=>row!==mainRow).forEach(row=>{
      const component={
        name:getCell(row,table.headerMap,"产品说明"),
        raw_quantity:parseNumberLike(getCell(row,table.headerMap,"总数量")),
        unit:getCell(row,table.headerMap,"单位"),
        source_text:getCell(row,table.headerMap,"产品说明")
      };
      if(component.name){
        product.components.push(enrichComponent(component,product.device_count,type,row));
      }
    });
    return product;
  });
}

function normalizeAggregateTable(table,type){
  return table.rows.map(row=>{
    const product=createNormalizedProductBase(row,table.headerMap);
    product.device_count=parseDeviceCountFromText(product.description) || product.device_count || 1;
    product.components=parseComponentsFromDescription(product.description)
      .filter(component=>!toText(component.name).includes("标准产品"))
      .map(component=>enrichComponent(component,product.device_count,type,row));
    return product;
  });
}

function normalizeDetailTable(table,type){
  const groups=new Map();
  table.rows.forEach(row=>{
    const groupKey=getGroupSerial(getCell(row,table.headerMap,"序号"));
    if(!groups.has(groupKey)) groups.set(groupKey,[]);
    groups.get(groupKey).push(row);
  });
  return [...groups.values()].map(rows=>{
    const mainRow=rows.find(row=>toText(getCell(row,table.headerMap,"序号")).endsWith("-1")) || rows[0];
    const deviceCount=parseNumberLike(getCell(mainRow,table.headerMap,"购买数量")) || 1;
    const product={
      source_sheet_name:mainRow.source_sheet_name,
      source_row_number:mainRow.source_row_number,
      serial_no:getGroupSerial(getCell(mainRow,table.headerMap,"序号")),
      product_name:getCell(mainRow,table.headerMap,"产品名称"),
      product_model:getCell(mainRow,table.headerMap,"产品型号"),
      device_count:deviceCount,
      unit:getCell(mainRow,table.headerMap,"单位") || "台",
      description:getCell(mainRow,table.headerMap,"物料说明"),
      components:[],
      warnings:[]
    };
    rows.forEach(row=>{
      const component={
        name:getCell(row,table.headerMap,"物料名称"),
        raw_quantity:parseNumberLike(getCell(row,table.headerMap,"购买数量")),
        unit:getCell(row,table.headerMap,"单位"),
        source_text:[
          getCell(row,table.headerMap,"物料名称"),
          getCell(row,table.headerMap,"规格型号"),
          getCell(row,table.headerMap,"物料说明"),
          getCell(row,table.headerMap,"多单位数量")
        ].filter(Boolean).join("；"),
        multi_unit_quantity:getCell(row,table.headerMap,"多单位数量")
      };
      if(component.name){
        product.components.push(enrichComponent(component,deviceCount,type,row));
      }
    });
    return product;
  });
}

function isValidNormalizedQuoteProduct(product){
  if(!product || typeof product!=="object") return false;
  const name=toText(product.product_name).trim();
  const model=toText(product.product_model).trim();
  const description=toText(product.description).trim();
  const components=Array.isArray(product.components) ? product.components : [];
  if(!name && !model && !description && components.length===0) return false;
  if(/^产品\d+$/i.test(name) && !model && !description && components.length===0) return false;
  const factText=[name,model,description,components.map(component=>component && (component.name || component.source_text))].flat().map(toText).join("");
  if(!factText.trim()) return false;
  return true;
}

function buildQuoteLineItemsFromNormalizedProducts(products){
  return (Array.isArray(products) ? products : []).filter(isValidNormalizedQuoteProduct).map(product=>({
    source_sheet_name:product.source_sheet_name,
    source_row_number:product.source_row_number,
    serial_no:product.serial_no,
    product_line:product.product_name,
    product_model:product.product_model,
    description:product.description,
    components:Array.isArray(product.components) ? product.components : [],
    quantity:toText(product.device_count),
    unit:product.unit || "台"
  }));
}

function preprocessQuoteStandard(standardQuote){
  const tables=findQuoteTables(standardQuote);
  const detection=detectQuoteExportType(tables);
  const table=tables.find(item=>(
    detection.type==="detail_itemized" ? item.family==="detail" :
    detection.type==="aggregate_summary" ? item.family==="aggregate" :
    item.family==="single"
  ));
  let products=[];
  if(table){
    if(detection.type==="detail_itemized"){
      products=normalizeDetailTable(table,detection.type);
    }else if(detection.type==="aggregate_summary"){
      products=normalizeAggregateTable(table,detection.type);
    }else{
      products=normalizeSingleTable(table,detection.type);
    }
  }
  products=products.filter(isValidNormalizedQuoteProduct);
	  const normalized={
	    format:"quote_normalized_v1",
	    source_file:standardQuote.source_file,
	    quote_export_type:detection.type,
	    detection,
	    products,
	    notes:[
	      ...(standardQuote.notes || []),
	      "本地已完成报价单类型识别和产品行归一化。"
	    ]
	  };
  return {
    normalized,
    lineItems:buildQuoteLineItemsFromNormalizedProducts(products)
  };
}

function compactQuoteExtractValue(value){
  if(value===undefined || value===null) return "";
  if(Array.isArray(value)){
    return value.map(compactQuoteExtractValue).map(item=>item.trim()).filter(Boolean).join("；");
  }
  if(typeof value==="object"){
    return Object.entries(value)
      .map(([key,item])=>{
        const text=compactQuoteExtractValue(item);
        return text ? `${key}=${text}` : "";
      })
      .filter(Boolean)
      .join("；");
  }
  return toText(value).replace(/\s+/g," ").trim();
}

function compactQuoteExtractLine(label,value){
  const text=compactQuoteExtractValue(value);
  return text ? `${label}: ${text}` : "";
}

function getDescriptionBlock(description,label){
  const text=toText(description).replace(/\r/g,"\n");
  const labels=["性能参数","硬件参数","功能描述","服务概述","服务内容","服务交付物","含"];
  const match=new RegExp(`${label}\\s*[：:]`,"i").exec(text);
  if(!match) return "";
  const start=match.index+match[0].length;
  const rest=text.slice(start);
  const nextIndexes=labels
    .filter(item=>item!==label)
    .map(item=>{
      const nextMatch=new RegExp(`${item}\\s*[：:]`,"i").exec(rest);
      return nextMatch ? start+nextMatch.index : -1;
    })
    .filter(index=>index>start);
  const purchaseMatch=/(?:^|\n)\s*\d+(\.\d+)?\s*(台|套|个|条|年|点|项)\s*(\d+\s*年)?\s*\*/.exec(rest);
  if(purchaseMatch){
    nextIndexes.push(start+purchaseMatch.index);
  }
  const end=nextIndexes.length ? Math.min(...nextIndexes) : text.length;
  return text.slice(start,end).replace(/\n+/g," ").replace(/\s+/g," ").trim();
}

function getPurchaseLinesFromDescription(description){
  const quotePurchaseLine=/^\d+(\.\d+)?\s*(台|套|个|条|年|点|项)\s*(\d+\s*年)?\s*\*/;
  return toText(description)
    .split(/\r?\n/)
    .map(line=>line.trim())
    .filter(line=>line && quotePurchaseLine.test(line))
    .slice(0,40);
}

function getDescriptionFallback(description){
  const text=toText(description)
    .replace(/\r/g,"\n")
    .split(/\n+/)
    .map(line=>line.trim())
    .filter(Boolean)
    .filter(line=>!/^(功能描述|服务概述|服务内容|服务交付物)\s*[：:]/.test(line))
    .join("；");
  return text.length>800 ? `${text.slice(0,800)}...` : text;
}

function getDescriptionIntro(description){
  const text=toText(description).replace(/\r/g,"\n");
  const purchaseMatch=/(?:^|\n)\s*\d+(\.\d+)?\s*(台|套|个|条|年|点|项)\s*(\d+\s*年)?\s*\*/.exec(text);
  const intro=(purchaseMatch ? text.slice(0,purchaseMatch.index) : text)
    .split(/\n+/)
    .map(line=>line.trim())
    .filter(Boolean)
    .filter(line=>!/^(功能描述|服务概述|服务内容|服务交付物)\s*[：:]/.test(line))
    .join(" ");
  return intro.length>600 ? `${intro.slice(0,600)}...` : intro;
}

function splitQuoteFactSentences(text){
  return toText(text)
    .replace(/\r/g,"\n")
    .split(/[；;\n。]+/)
    .map(item=>item.trim())
    .filter(Boolean);
}

function classifyQuoteFactSentence(sentence){
  const text=toText(sentence);
  if(isQuoteServiceFact(text)) return "services";
  if(isQuoteConditionalFact(text)) return "conditional_or_max_capabilities";
  if(/(吞吐|并发|新建|用户数|授权数|许可证|接入数|处理日志|eps|存储时长|存储容量|容量授权|交换容量|包转发率|带宽性能|数据库流量|SQL|日志检索|通信带宽)/i.test(text)){
    return "performance";
  }
  if(/(规格|CPU|处理器|内存|硬盘|系统盘|缓存盘|数据盘|电源|接口|电口|光口|SFP|HDMI|USB|DP|盘位|RAID|显卡|GPU|网卡|光纤线|多模|单模)/i.test(text)){
    return "hardware";
  }
  return "";
}

function mergeTextArrays(...values){
  return dedupeTextArray(values.flatMap(value=>normalizeTextArray(value)));
}

function formatCompactComponent(component){
  const name=compactQuoteExtractValue(component && component.name);
  if(!name) return "";
  const quantity=[
    compactQuoteExtractValue(component.raw_quantity),
    compactQuoteExtractValue(component.unit)
  ].filter(Boolean).join("");
  const tags=[
    quantity ? `数量${quantity}` : "",
    compactQuoteExtractValue(component.multi_unit_quantity)
  ].filter(Boolean).join("，");
  return tags ? `${name}（${tags}）` : name;
}

function buildQuoteFactsFromComponents(components){
  const facts={
    modules:[],
    hardware:[],
    services:[],
    conditional_or_max_capabilities:[],
    optional_items:[],
    evidence:[]
  };
  (Array.isArray(components) ? components : []).forEach(component=>{
    const name=compactQuoteExtractValue(component && component.name);
    if(!name) return;
    const formatted=formatCompactComponent(component);
    const bucket=isQuoteServiceFact(name)
      ? "services"
      : (isQuoteConditionalFact(name)
        ? "conditional_or_max_capabilities"
        : (/(硬盘|内存|电源|电口|光口|SFP|光纤|多模|单模|网卡|接口|显卡|GPU|盘|条)/i.test(name)
          ? "hardware"
          : "modules"));
    facts[bucket].push(formatted || name);
    if(/(选配|定制|扩展|额外|加配)/.test(name)){
      facts.optional_items.push(formatted || name);
    }
    if(component && component.source_text){
      facts.evidence.push(component.source_text);
    }
  });
  Object.keys(facts).forEach(key=>{
    facts[key]=dedupeTextArray(facts[key]);
  });
  return facts;
}

function buildLocalQuoteFactsFromLineItem(lineItem){
  const description=toText(lineItem && lineItem.description);
  const componentFacts=buildQuoteFactsFromComponents(lineItem && lineItem.components);
  const facts={
    modules:[...componentFacts.modules],
    hardware:[...componentFacts.hardware],
    performance:[],
    services:[...componentFacts.services],
    conditional_or_max_capabilities:[...componentFacts.conditional_or_max_capabilities],
    optional_items:[...componentFacts.optional_items],
    excluded_or_absent:[],
    evidence:[...componentFacts.evidence]
  };
  [
    getDescriptionBlock(description,"性能参数"),
    getDescriptionBlock(description,"硬件参数"),
    getDescriptionIntro(description)
  ].forEach(block=>{
    splitQuoteFactSentences(block).forEach(sentence=>{
      const bucket=classifyQuoteFactSentence(sentence);
      if(bucket && facts[bucket]){
        facts[bucket].push(sentence);
      }
    });
  });
  if(/冗余电源/.test(facts.hardware.join(" ")) && /单电源/.test(facts.hardware.join(" "))){
    facts.excluded_or_absent.push("单电源已被冗余电源覆盖");
  }
  Object.keys(facts).forEach(key=>{
    facts[key]=dedupeTextArray(facts[key]);
  });
  return facts;
}

function isDisplayableQuoteProduct(product){
  if(!product || typeof product!=="object") return false;
  const name=toText(product.quote_product_name).trim();
  const model=toText(product.product_model).trim();
  const description=toText(product.description).trim();
  const arrays=[
    product.purchase_lines,
    product.product_line_hints,
    product.version_hints,
    product.hardware,
    product.performance,
    product.modules,
    product.services,
    product.optional_items,
    product.conditional_or_max_capabilities,
    product.excluded_or_absent,
    product.evidence
  ];
  const hasArrayFacts=arrays.some(value=>normalizeTextArray(value).length>0);
  const hasComponentFacts=Array.isArray(product.components)
    && product.components.some(component=>toText(component && (component.name || component.source_text)).trim());
  const placeholderName=/^产品\d+$/i.test(name);
  if(!name && !model && !description && !hasArrayFacts && !hasComponentFacts) return false;
  if(placeholderName && !model && !description && !hasArrayFacts && !hasComponentFacts) return false;
  return true;
}

function normalizeQuoteExtractResult(parsed){
  const result=parsed && typeof parsed==="object" ? parsed : {};
  const rawProducts=Array.isArray(result.quote_products)
    ? result.quote_products
    : (
      Array.isArray(result.products)
        ? result.products
        : (result.product ? [result.product] : [])
    );
  const quoteProducts=rawProducts
    .filter(item=>item && typeof item==="object")
    .map(item=>cleanQuoteProductFacts({
      source_sheet_name:toText(item.source_sheet_name || item.sheet_name).trim(),
	      source_row_number:Number(item.source_row_number || item.row_number || item.sourceRowNumber) || 0,
	      serial_no:toText(item.serial_no || item.serial).trim(),
	      quote_product_name:toText(item.quote_product_name || item.product_name || item.name).trim(),
	      product_model:toText(item.product_model || item.model).trim(),
	      product_note:toText(item.product_note || item.note || item.remark).trim(),
	      database_product_hint:toText(item.database_product_hint || item.database_name || item.product_hint).trim(),
	      quantity:toText(item.quantity).trim(),
	      unit:toText(item.unit).trim(),
	      description:toText(item.description || item.product_description).trim(),
	      purchase_lines:normalizeTextArray(item.purchase_lines || item.purchase_list || item.buying_list),
	      product_line_hints:normalizeTextArray(item.product_line_hints || item.productLines || item.product_line),
      version_hints:normalizeTextArray(item.version_hints || item.versions || item.version),
      modules:normalizeTextArray(item.modules || item.module || item.licenses),
      hardware:normalizeTextArray(item.hardware || item.hardware_specs || item.specs),
      performance:normalizeTextArray(item.performance || item.performance_specs || item.metrics || item.capacity || item.license_scale),
      services:normalizeTextArray(item.services || item.service_items || item.warranty || item.maintenance),
      conditional_or_max_capabilities:normalizeTextArray(item.conditional_or_max_capabilities || item.conditional_capabilities || item.max_capabilities || item.not_purchased_capabilities),
      optional_items:normalizeTextArray(item.optional_items || item.options || item.optional),
      excluded_or_absent:normalizeTextArray(item.excluded_or_absent || item.excluded || item.absent),
	      first_hardware_param:normalizeFirstHardwareParamValue(
	        item.first_hardware_param
	      ),
	      first_hardware_param_evidence:normalizeTextArray(item.first_hardware_param_evidence || item.hardware_param_evidence || item.first_param_evidence),
	      _quote_source:item._quote_source && typeof item._quote_source==="object" ? item._quote_source : null,
	      product_analysis:item.product_analysis && typeof item.product_analysis==="object" ? item.product_analysis : null,
	      product_analysis_error:toText(item.product_analysis_error).trim(),
	      components:Array.isArray(item.components) ? item.components : [],
	      keywords:normalizeTextArray(item.keywords),
	      evidence:normalizeTextArray(item.evidence)
	    }));
  return {
    quote_export_type:toText(result.quote_export_type || result.export_type || result.list_type).trim(),
    quote_export_type_label:toText(result.quote_export_type_label || result.export_type_label || result.list_type_label).trim(),
    quote_export_confidence:Number(result.quote_export_confidence || result.export_type_confidence || result.confidence) || 0,
    quote_export_signals:normalizeTextArray(result.quote_export_signals || result.export_type_signals || result.signals),
    quote_products:quoteProducts,
    global_keywords:normalizeTextArray(result.global_keywords || result.keywords),
    notes:normalizeTextArray(result.notes)
  };
}

function makeLocalQuoteProductFromLineItem(lineItem,index){
  const localFacts=buildLocalQuoteFactsFromLineItem(lineItem);
  const nameParts=[
    lineItem && lineItem.product_model,
    lineItem && lineItem.product_line
  ].map(item=>toText(item).trim()).filter(Boolean);
  return cleanQuoteProductFacts({
    source_sheet_name:toText(lineItem && lineItem.source_sheet_name).trim(),
	    source_row_number:Number(lineItem && lineItem.source_row_number) || 0,
	    serial_no:toText(lineItem && lineItem.serial_no).trim(),
	    quote_product_name:nameParts.join(" ") || `产品${index+1}`,
	    product_model:toText(lineItem && lineItem.product_model).trim(),
	    product_note:toText(lineItem && lineItem.product_note).trim(),
	    quantity:toText(lineItem && lineItem.quantity).trim() || "1",
	    unit:toText(lineItem && lineItem.unit).trim() || "台",
	    description:toText(lineItem && lineItem.description).trim(),
	    purchase_lines:getPurchaseLinesFromDescription(lineItem && lineItem.description),
	    product_line_hints:mergeTextArrays(lineItem && lineItem.product_line),
    version_hints:mergeTextArrays(lineItem && lineItem.product_model),
    modules:localFacts.modules,
    hardware:localFacts.hardware,
    performance:localFacts.performance,
    services:localFacts.services,
    conditional_or_max_capabilities:localFacts.conditional_or_max_capabilities,
    optional_items:localFacts.optional_items,
    excluded_or_absent:localFacts.excluded_or_absent,
	    first_hardware_param:"",
	    first_hardware_param_evidence:[],
	    components:Array.isArray(lineItem && lineItem.components) ? lineItem.components : [],
    keywords:mergeTextArrays(lineItem && lineItem.product_model,lineItem && lineItem.product_line),
	    evidence:mergeTextArrays(localFacts.evidence,lineItem && lineItem.description,`${toText(lineItem && lineItem.source_sheet_name).trim()} 第${Number(lineItem && lineItem.source_row_number) || 0}行`)
	  });
	}

function buildLocalQuoteExtractResult(preprocessResult,lineItems){
  const normalized=preprocessResult && preprocessResult.normalized ? preprocessResult.normalized : {};
  const detection=normalized.detection || {};
  const products=(Array.isArray(lineItems) ? lineItems : [])
    .map(makeLocalQuoteProductFromLineItem)
    .filter(isDisplayableQuoteProduct);
  return {
    quote_export_type:toText(detection.type || normalized.quote_export_type || "unknown").trim(),
    quote_export_type_label:toText(detection.type || normalized.quote_export_type || "本地识别清单").trim(),
    quote_export_confidence:Number(detection.confidence) || 0,
    quote_export_signals:normalizeTextArray(detection.signals),
    quote_products:products,
    global_keywords:dedupeTextArray(products.flatMap(product=>[
      product.product_line_hints,
      product.version_hints,
      product.keywords
    ])),
    notes:dedupeTextArray([
      ...(normalizeTextArray(normalized.notes)),
      "本地已完成报价单类型识别和产品行归一化。"
    ])
  };
}

function isQuoteServiceFact(value){
  const text=toText(value);
  return /(维保|质保|产品质保|软件升级|升级服务|升级维护|基础运维软件|基础运维服务|运维服务|规则库升级|安全托管服务|网站监测服务|服务团队|交付服务)/.test(text);
}

function isQuoteConditionalFact(value){
  const text=toText(value);
  return /(单独购买|需单独收费|最大支持|最大可扩展|扩容上限|需额外授权|未购买|不支持)/.test(text);
}

function getQuoteFactMetricKey(value){
  return normalizeMatchKey(
    toText(value)
      .replace(/[（(][^）)]*(单独购买|需单独收费|支持客户端授权|需额外授权|扩容上限|最大支持|最大可扩展)[^）)]*[）)]/g,"")
      .replace(/[0-9０-９]+(?:\.[0-9０-９]+)?\s*(?:[GMKTP]?[bB]ps|[GMKTP]?[bB]|万|点|个|套|年|台|条|口|Mpps|Kpps)?/g,"")
      .replace(/(推荐|最大|理论|支持|可扩展|扩容上限|上限|默认包含|数量|的)/g,"")
  );
}

function isPerformanceCoveredByConditional(value,conditionalValues){
  const key=getQuoteFactMetricKey(value);
  if(key.length<3) return false;
  return normalizeTextArray(conditionalValues).some(item=>{
    const conditionalKey=getQuoteFactMetricKey(item);
    return conditionalKey.length>=3 && (conditionalKey.includes(key) || key.includes(conditionalKey));
  });
}

function dedupeTextArray(values){
  const seen=new Set();
  const result=[];
  normalizeTextArray(values).forEach(value=>{
    const key=normalizeMatchKey(value);
    if(!key || seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result;
}

function cleanQuoteProductFacts(product){
  const services=[...normalizeTextArray(product.services)];
  const conditional=[...normalizeTextArray(product.conditional_or_max_capabilities)];
  const modules=[];
  normalizeTextArray(product.modules).forEach(value=>{
    if(isQuoteServiceFact(value)){
      services.push(value);
      return;
    }
    modules.push(value);
  });
  const performance=[];
  normalizeTextArray(product.performance).forEach(value=>{
    if(isQuoteServiceFact(value)){
      services.push(value);
      return;
    }
    if(isQuoteConditionalFact(value)){
      conditional.push(value);
      return;
    }
    if(isPerformanceCoveredByConditional(value,conditional)){
      return;
    }
    performance.push(value);
  });
  return {
    ...product,
    modules:dedupeTextArray(modules),
    performance:dedupeTextArray(performance),
    services:dedupeTextArray(services),
    conditional_or_max_capabilities:dedupeTextArray(conditional),
    hardware:dedupeTextArray(product.hardware),
    optional_items:dedupeTextArray(product.optional_items),
    excluded_or_absent:dedupeTextArray(product.excluded_or_absent),
    keywords:dedupeTextArray(product.keywords),
    evidence:dedupeTextArray(product.evidence)
  };
}

function normalizeTextArray(value){
  const items=Array.isArray(value) ? value : (value ? [value] : []);
  return items
    .flatMap(item=>toText(item).split(/[，,;；\n]+/))
    .map(item=>item.trim())
    .filter(Boolean);
}

function normalizeMatchKey(value){
  return toText(value).toLowerCase().replace(/\s+/g,"").replace(/[（）()\-_/，,;；:：]/g,"");
}

function alignExtractResultToQuoteRows(extractResult,lineItems){
  if(!Array.isArray(lineItems) || lineItems.length===0){
    return extractResult;
  }
  const extractProducts=Array.isArray(extractResult.quote_products) ? extractResult.quote_products : [];
  const findLineItemForProduct=product=>{
    const exactByRow=lineItems.find(lineItem=>
      Number(product.source_row_number)===Number(lineItem.source_row_number) &&
      toText(product.source_sheet_name).trim()===toText(lineItem.source_sheet_name).trim()
    );
    if(exactByRow) return exactByRow;
    const quoteNameKey=normalizeMatchKey(product.quote_product_name);
    const hintKeys=normalizeTextArray(product.product_line_hints).map(normalizeMatchKey);
    return lineItems.find(lineItem=>{
      const rowModelKey=normalizeMatchKey(lineItem.product_model);
      const rowLineKey=normalizeMatchKey(lineItem.product_line);
      return (
        (rowModelKey && quoteNameKey && (quoteNameKey.includes(rowModelKey) || rowModelKey.includes(quoteNameKey))) ||
        (rowLineKey && hintKeys.some(hint=>hint && (hint.includes(rowLineKey) || rowLineKey.includes(hint))))
      );
    }) || null;
  };
  const createProductFromLineItem=(lineItem,index,source={})=>{
    const localFacts=buildLocalQuoteFactsFromLineItem(lineItem);
    return {
      source_sheet_name:lineItem.source_sheet_name,
      source_row_number:lineItem.source_row_number,
      serial_no:lineItem.serial_no,
      quote_product_name:toText(source.quote_product_name).trim() || lineItem.product_model || lineItem.product_line || `产品${index+1}`,
      product_model:toText(source.product_model).trim() || lineItem.product_model,
      product_note:toText(source.product_note).trim() || lineItem.product_note,
      quantity:toText(source.quantity).trim() || lineItem.quantity,
      unit:toText(source.unit).trim() || lineItem.unit,
      description:toText(source.description).trim() || lineItem.description,
      purchase_lines:normalizeTextArray(source.purchase_lines).length ? normalizeTextArray(source.purchase_lines) : getPurchaseLinesFromDescription(lineItem.description),
      product_line_hints:mergeTextArrays(source.product_line_hints,lineItem.product_line),
      version_hints:normalizeTextArray(source.version_hints),
      modules:mergeTextArrays(source.modules,localFacts.modules),
      hardware:mergeTextArrays(source.hardware,localFacts.hardware),
      performance:mergeTextArrays(source.performance,localFacts.performance),
      services:mergeTextArrays(source.services,localFacts.services),
      conditional_or_max_capabilities:mergeTextArrays(source.conditional_or_max_capabilities,localFacts.conditional_or_max_capabilities),
      optional_items:mergeTextArrays(source.optional_items,localFacts.optional_items),
      excluded_or_absent:mergeTextArrays(source.excluded_or_absent,localFacts.excluded_or_absent),
      components:Array.isArray(lineItem.components) ? lineItem.components : [],
      first_hardware_param:normalizeFirstHardwareParamValue(source.first_hardware_param),
      first_hardware_param_evidence:normalizeTextArray(source.first_hardware_param_evidence),
      keywords:mergeTextArrays(source.keywords,lineItem.product_model,lineItem.product_line),
      evidence:mergeTextArrays(source.evidence,localFacts.evidence,`${lineItem.source_sheet_name} 第${lineItem.source_row_number}行`)
    };
  };
  const alignedProducts=lineItems.map((lineItem,index)=>{
    const exactByRow=extractProducts.find(product=>
      Number(product.source_row_number)===Number(lineItem.source_row_number) &&
      toText(product.source_sheet_name).trim()===toText(lineItem.source_sheet_name).trim()
    );
    const rowModelKey=normalizeMatchKey(lineItem.product_model);
    const rowLineKey=normalizeMatchKey(lineItem.product_line);
    const fallbackMatch=extractProducts.find(product=>{
      const quoteNameKey=normalizeMatchKey(product.quote_product_name);
      const hintKeys=product.product_line_hints.map(normalizeMatchKey);
      return (
        (rowModelKey && quoteNameKey && (quoteNameKey.includes(rowModelKey) || rowModelKey.includes(quoteNameKey))) ||
        (rowLineKey && hintKeys.some(hint=>hint && (hint.includes(rowLineKey) || rowLineKey.includes(hint))))
      );
    });
    const source=exactByRow || fallbackMatch || {};
    return createProductFromLineItem(lineItem,index,source);
  }).filter(isDisplayableQuoteProduct);
  if(extractProducts.length>0){
    const unmatchedExtractProducts=extractProducts.filter(product=>!findLineItemForProduct(product));
    const carryOverProducts=unmatchedExtractProducts.map((product,index)=>({
      ...product,
      product_line_hints:normalizeTextArray(product.product_line_hints),
      version_hints:normalizeTextArray(product.version_hints),
      modules:normalizeTextArray(product.modules),
      hardware:normalizeTextArray(product.hardware),
      performance:normalizeTextArray(product.performance),
      services:normalizeTextArray(product.services),
      conditional_or_max_capabilities:normalizeTextArray(product.conditional_or_max_capabilities),
      optional_items:normalizeTextArray(product.optional_items),
      excluded_or_absent:normalizeTextArray(product.excluded_or_absent),
      first_hardware_param:normalizeFirstHardwareParamValue(product.first_hardware_param),
      first_hardware_param_evidence:normalizeTextArray(product.first_hardware_param_evidence),
      keywords:normalizeTextArray(product.keywords),
      evidence:normalizeTextArray(product.evidence)
    })).filter(isDisplayableQuoteProduct);
    return {
      quote_products:[...alignedProducts,...carryOverProducts],
      quote_export_type:extractResult.quote_export_type,
      quote_export_type_label:extractResult.quote_export_type_label,
      quote_export_confidence:extractResult.quote_export_confidence,
      quote_export_signals:normalizeTextArray(extractResult.quote_export_signals),
      global_keywords:normalizeTextArray(extractResult.global_keywords),
      notes:normalizeTextArray(extractResult.notes)
    };
  }
  return {
    quote_products:alignedProducts,
    quote_export_type:extractResult.quote_export_type,
    quote_export_type_label:extractResult.quote_export_type_label,
    quote_export_confidence:extractResult.quote_export_confidence,
    quote_export_signals:normalizeTextArray(extractResult.quote_export_signals),
    global_keywords:normalizeTextArray(extractResult.global_keywords),
    notes:normalizeTextArray(extractResult.notes)
  };
}

function tokenizeForMatch(value){
  const text=toText(value).toLowerCase();
  const rawTokens=text
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map(item=>item.trim())
    .filter(item=>item.length>=2);
  const chineseTokens=[];
  rawTokens.forEach(token=>{
    if(/[\u4e00-\u9fff]/.test(token) && token.length>6){
      for(let i=0;i<=token.length-2;i+=2){
        chineseTokens.push(token.slice(i,i+4));
      }
    }
  });
  return [...new Set([...rawTokens,...chineseTokens])];
}

function collectQuoteMatchTerms(extractResult,quoteProduct=null){
  const fields=[
    ...(quoteProduct ? [
      quoteProduct.quote_product_name,
      quoteProduct.product_model,
      quoteProduct.database_product_hint,
      quoteProduct.product_line_hints,
      quoteProduct.version_hints,
      quoteProduct.modules,
      quoteProduct.hardware,
      quoteProduct.performance,
      quoteProduct.services,
      quoteProduct.conditional_or_max_capabilities,
	      quoteProduct.optional_items,
	      quoteProduct.keywords,
      quoteProduct.first_hardware_param,
      quoteProduct.evidence
    ] : [
      extractResult && extractResult.global_keywords,
      extractResult && extractResult.notes
    ])
  ];
  return [...new Set(fields.flatMap(tokenizeForMatch))];
}

function getQuoteConfirmProductOptions(){
  return state.products.map(product=>({
    id:product.id,
    label:toText(product.name).trim() || toText(product.sheetName).trim() || `产品${product.id}`,
    productLine:toText(product.productLine).trim(),
    version:toText(product.version).trim()
  }));
}

function getQuoteProductMatchText(quoteProduct,extractResult=null){
  return [
    quoteProduct && quoteProduct.quote_product_name,
    quoteProduct && quoteProduct.product_model,
    quoteProduct && quoteProduct.database_product_hint,
    quoteProduct && quoteProduct.product_line_hints,
    quoteProduct && quoteProduct.version_hints,
    quoteProduct && quoteProduct.modules,
    quoteProduct && quoteProduct.hardware,
    quoteProduct && quoteProduct.performance,
    quoteProduct && quoteProduct.services,
    quoteProduct && quoteProduct.optional_items,
    quoteProduct && quoteProduct.evidence
  ].flat().map(toText).join(" ");
}

function globPatternToRegExp(pattern){
  const source=toText(pattern).trim();
  if(!source) return null;
  const escaped=source
    .replace(/[.+^${}()|[\]\\]/g,"\\$&")
    .replace(/x+/gi,"[A-Za-z0-9]+")
    .replace(/\*/g,".*")
    .replace(/\?/g,".");
  try{
    return new RegExp(escaped,"i");
  }catch(err){
    return null;
  }
}

function matchRulePattern(pattern,text,normalizedText){
  const source=toText(pattern).trim();
  if(!source) return false;
  const regex=globPatternToRegExp(source);
  if(regex && regex.test(text.trim())) return true;
  const normalizedPattern=normalizeMatchKey(source);
  if(!normalizedPattern) return false;
  return normalizedText.includes(normalizedPattern);
}

function getDatabaseProductByNameLike(value){
  const key=normalizeMatchKey(value);
  if(!key) return null;
  return state.products.find(product=>{
    const names=[
      product.name,
      product.sheetName,
      product.productKey,
      `${product.productLine}（${product.version}）`,
      `${product.productLine}-${product.version}`,
      product.productLine
    ].map(normalizeMatchKey);
    return names.includes(key);
  }) || null;
}

function getArchitectureVersionHint(text){
  const source=toText(text);
  if(/kunpeng|鲲鹏|arm/i.test(source)) return "ARM";
  if(/hygon|海光|c86/i.test(source)) return "C86";
  if(/amd|intel|x86|genoa|xeon|epyc/i.test(source)) return "X86";
  return "";
}

function findDatabaseProductByLineVersion(productLine,version=""){
  const lineKey=normalizeMatchKey(productLine);
  const versionKey=normalizeMatchKey(version);
  return state.products.find(product=>{
    const productLineKey=normalizeMatchKey(product.productLine);
    const nameKey=normalizeMatchKey(product.name);
    const sheetKey=normalizeMatchKey(product.sheetName);
    const productVersionKey=normalizeMatchKey(product.version);
    const lineMatched=productLineKey===lineKey || nameKey.includes(lineKey) || sheetKey.includes(lineKey);
    if(!lineMatched) return false;
    return !versionKey || productVersionKey.includes(versionKey) || nameKey.includes(versionKey) || sheetKey.includes(versionKey);
  }) || null;
}

function getRuleMatchedDatabaseProductForQuoteProduct(quoteProduct,extractResult=null){
  const rules=Array.isArray(state.matchRules) ? state.matchRules : [];
  if(!rules.length) return null;
  const fullText=getQuoteProductMatchText(quoteProduct,extractResult);
  const modelText=[
    quoteProduct && quoteProduct.product_model,
    quoteProduct && quoteProduct.quote_product_name,
    quoteProduct && quoteProduct.database_product_hint
  ].map(toText).join(" ");
  const normalizedFullText=normalizeMatchKey(fullText);
  const normalizedModelText=normalizeMatchKey(modelText);
  const matchedRule=rules
    .filter(rule=>rule && rule.enabled!==false)
    .slice()
    .sort((a,b)=>(Number(a.priority)||100)-(Number(b.priority)||100))
    .find(rule=>{
      const modelPatterns=Array.isArray(rule.model_patterns) ? rule.model_patterns : [];
      const keywordPatterns=Array.isArray(rule.keyword_patterns) ? rule.keyword_patterns : [];
      const modelMatched=!modelPatterns.length || modelPatterns.some(pattern=>matchRulePattern(pattern,modelText,normalizedModelText));
      const keywordMatched=!keywordPatterns.length || keywordPatterns.some(pattern=>matchRulePattern(pattern,fullText,normalizedFullText));
      return modelMatched && keywordMatched;
    });
  return matchedRule ? getDatabaseProductByNameLike(matchedRule.target_product) : null;
}

function getRoutedDatabaseProductForQuoteProduct(quoteProduct,extractResult=null){
  const text=getQuoteProductMatchText(quoteProduct,extractResult);
  const normalized=normalizeMatchKey(text);
  const has=(pattern)=>pattern.test(text) || pattern.test(normalized);
  const byLine=(line,version="")=>findDatabaseProductByLineVersion(line,version);

  if(has(/AF[-_\s]*1000|下一代防火墙|防火墙/i)) return byLine("AF","通用版本");
  if(has(/AC[-_\s]*1000|全网行为管理|上网行为管理/i)) return byLine("AC","通用版本");

  if(has(/aTrust/i)){
    if(has(/控制中心/)) return byLine("aTrust","控制中心");
    if(has(/代理网关/)) return byLine("aTrust","代理网关");
    return byLine("aTrust","综合网关");
  }

  if(has(/DAS[-_\s]*1000|数据库.*审计|数据库审计/i)) return byLine("数据库审计-DAS","通用版本");
  if(has(/OSM[-_\s]*1000|堡垒机/i)) return byLine("堡垒机-OSM","通用版本");
  if(has(/GAP[-_\s]*1000|网闸/i)) return byLine("网闸-GAP","通用版本");
  if(has(/SIP[-_\s]*Logger|日志审计/i)) return byLine("日志审计-SIP-Logger","通用版本");

  if(has(/STA[-_\s]*1000|潜伏威胁探针|威胁探针/i)) return byLine("SIP","STA");
  if(has(/SIP[-_\s]*Y[-_\s]/i)) return byLine("SIP","一体机");
  if(has(/SIP[-_\s]*1000|安全感知管理平台|安全感知平台|安全感知系统/i)) return byLine("SIP","SIP") || byLine("SIP","一体机");
  if(has(/\bSIP\b/i)) return byLine("SIP","SIP") || byLine("SIP","一体机");

  if(has(/aES|终端检测|终端安全/i)) return byLine("aES","PC&服务器");
  if(has(/EDS|分布式存储/i)) return byLine("EDS","通用版本");

  if(has(/aServer|HCI|超融合/i)){
    return byLine("HCI",getArchitectureVersionHint(text) || "X86") || byLine("HCI","X86");
  }

  if(has(/aDesk|VDI|桌面云|瘦终端/i)){
    if(has(/瘦终端|终端盒|云终端/i)) return byLine("aDesk","瘦终端");
    return byLine("aDesk","服务器+软件+VDI") || byLine("aDesk","瘦终端");
  }

  if(has(/aRS|交换机/i)) return byLine("aRS","通用参数");

  return null;
}

function getBestDatabaseProductForQuoteProduct(quoteProduct,extractResult){
  const ruleProduct=getRuleMatchedDatabaseProductForQuoteProduct(quoteProduct,extractResult);
  if(ruleProduct) return ruleProduct;
  const exactProduct=getExactDatabaseProductByHint(quoteProduct && quoteProduct.database_product_hint);
  if(exactProduct) return exactProduct;
  const routedProduct=getRoutedDatabaseProductForQuoteProduct(quoteProduct,extractResult);
  if(routedProduct) return routedProduct;
  const terms=collectQuoteMatchTerms(extractResult,quoteProduct);
  const ranked=state.products
    .map(product=>({product,score:scoreProductForQuote(product,terms,quoteProduct)}))
    .sort((a,b)=>b.score-a.score || a.product.id-b.product.id);
  return ranked.length && ranked[0].score>0 ? ranked[0].product : null;
}

function getExactDatabaseProductByHint(hint){
  const normalizedHint=normalizeMatchKey(hint);
  if(!normalizedHint) return null;
  return state.products.find(product=>{
    const names=[
      product.name,
      product.sheetName,
      product.productLine,
      product.version
    ].map(normalizeMatchKey);
    return names.includes(normalizedHint);
  }) || null;
}

function scoreProductForQuote(product,terms,quoteProduct){
  const haystack=[
    product.sheetName,
    product.name,
    product.category,
    product.productLine,
    product.version
  ].map(item=>toText(item).toLowerCase()).join(" ");
  let score=0;
  terms.forEach(term=>{
    if(term && haystack.includes(term)) score+=8;
  });
  const quoteName=toText(quoteProduct && quoteProduct.quote_product_name).toLowerCase();
  if(quoteName && haystack.includes(quoteName)) score+=30;
  normalizeTextArray(quoteProduct && quoteProduct.product_line_hints).forEach(hint=>{
    const normalized=hint.toLowerCase();
    if(normalized && haystack.includes(normalized)) score+=25;
  });
  normalizeTextArray(quoteProduct && quoteProduct.version_hints).forEach(hint=>{
    const normalized=hint.toLowerCase();
    if(normalized && haystack.includes(normalized)) score+=12;
  });
  return score;
}

function buildCandidateCatalogContext(extractResult,quoteProduct=null,strategy=null){
  const terms=collectQuoteMatchTerms(extractResult,quoteProduct);
  const templateProduct=getBestDatabaseProductForQuoteProduct(quoteProduct,extractResult);
  let targetProduct=templateProduct;
  let matchScore=templateProduct ? 9998 : 0;
  if(!targetProduct){
    const rankedProducts=state.products
      .map(product=>({product,score:scoreProductForQuote(product,terms,quoteProduct)}))
      .sort((a,b)=>b.score-a.score || a.product.id-b.product.id);
    const best=rankedProducts.find(item=>item.score>0) || rankedProducts[0];
    targetProduct=best ? best.product : null;
    matchScore=best ? best.score : 0;
  }
  if(!targetProduct){
    return {
      selection_mode:"single_product_full_params",
      products:[],
      total_products:0,
      total_params:0
    };
  }
  const params=getParamsByProductId(targetProduct.id).filter(param=>param.ai_select_visible!==false);
  const products=[{
    sheet_name:targetProduct.sheetName,
    database_name:targetProduct.name,
    product_key:toText(targetProduct.productKey).trim(),
    category:targetProduct.category,
    product_line:targetProduct.productLine,
    version:targetProduct.version,
    match_score:matchScore,
    selection_mode:"single_product_full_params",
    params:params.map(param=>({
      param_id:param.id,
      title:toText(param.title).trim(),
      type:toText(param.is_star || param.type).trim(),
      module:toText(param.module).trim(),
      function_item:toText(param.function_item).trim(),
      requires_module:toText(param.requires_module).trim(),
      vendor_support:getVendorSupportEntries(param).map(([vendor,value])=>({vendor,status:normalizeSupportValue(value)})),
      content:toText(param.content).trim(),
      remark:toText(param.remark).trim()
    }))
  }];
  return {
    selection_mode:"single_product_full_params",
    products,
    total_products:products.length,
    total_params:products.reduce((sum,product)=>sum+product.params.length,0)
  };
}

async function runTasksWithLimit(tasks,concurrency,worker){
  const results=new Array(tasks.length);
  let cursor=0;
  async function next(){
    while(cursor<tasks.length){
      const index=cursor++;
      results[index]=await worker(tasks[index],index);
    }
  }
  const runners=Array.from({length:Math.min(concurrency,tasks.length)},()=>next());
  await Promise.all(runners);
  return results;
}

async function requestQuoteSelectWithProgress(settings,tasks){
  if(!tasks.length) return [];
  const taskCount=tasks.length;
  showQuoteSelectProgress(tasks,taskCount);
  const batchStartedAt=performance.now();
  const results=await runTasksWithLimit(tasks,Math.min(QUOTE_AI_MAX_CONCURRENCY,taskCount),async (task,taskIndex)=>{
    updateQuoteSelectProgress(taskIndex,"running","生成中");
    const startedAt=performance.now();
    try{
      const data=await requestAiCompletion(settings,task.payload);
      const elapsedMs=performance.now()-startedAt;
      updateQuoteSelectProgress(taskIndex,"success","完成");
      return {
        task,
        result:{
          ok:true,
          statusCode:200,
          data,
          elapsedMs,
          chatId:toText(task && task.payload && task.payload.chatId).trim()
        }
      };
    }catch(err){
      const elapsedMs=performance.now()-startedAt;
      updateQuoteSelectProgress(taskIndex,"error","失败");
      return {
        task,
        result:{
          ok:false,
          error:err && err.message ? err.message : "AI 调用失败",
          code:toText(err && err.code).trim(),
          reasonType:toText(err && err.reasonType).trim(),
          status:Number(err && err.status) || 0,
          elapsedMs,
          chatId:toText(task && task.payload && task.payload.chatId).trim()
        }
      };
    }
  });
  console.info("quote_select batch finished",{
    taskCount:tasks.length,
    elapsedMs:Math.round(performance.now()-batchStartedAt),
    results:results.map(item=>({
      index:item && item.task && item.task.index,
      chatId:item && item.result && item.result.chatId,
      ok:Boolean(item && item.result && item.result.ok),
      elapsedMs:Math.round(Number(item && item.result && item.result.elapsedMs) || 0),
      error:item && item.result && item.result.error,
      code:item && item.result && item.result.code,
      reasonType:item && item.result && item.result.reasonType,
      status:item && item.result && item.result.status
    }))
  });
  return results;
}

function normalizeProductAnalyzeResult(parsed){
  if(typeof parsed==="string"){
    const text=normalizeFirstHardwareParamValue(parsed);
    if(text){
      try{
        return normalizeProductAnalyzeResult(JSON.parse(extractJsonText(text)));
      }catch(err){
        return {
          matched_template_id:"",
          product_category:"",
          first_hardware_param:text,
          purchased_modules:[]
        };
      }
    }
    return {
      matched_template_id:"",
      product_category:"",
      first_hardware_param:"",
      purchased_modules:[]
    };
  }
  const result=parsed && typeof parsed==="object" ? parsed : {};
  const analysis=result.product_analysis && typeof result.product_analysis==="object"
    ? result.product_analysis
    : result;
  const purchasedModules=analysis.purchased_modules
    || analysis.enabled_modules
    || analysis.opened_modules
    || analysis.activated_modules
    || analysis.modules_opened
    || analysis.modules
    || analysis["开通模块"]
    || analysis["已购模块"]
    || analysis["购买模块"];
  return {
    matched_template_id:toText(analysis.matched_template_id || analysis.template_id).trim(),
    product_category:toText(analysis.product_category || analysis.category).trim(),
    first_hardware_param:normalizeFirstHardwareParamValue(
      analysis.first_hardware_param
      || analysis.base_param
      || analysis.first_param
      || analysis["第一条参数"]
      || analysis["第一条基础参数"]
    ),
    purchased_modules:normalizeTextArray(purchasedModules)
  };
}

function buildLocalFirstHardwareParam(quoteProduct){
  const quoteItem=quoteProduct && typeof quoteProduct==="object" ? quoteProduct : {};
  const pcCount=extractAuthorizationCount(quoteItem,"PC全量版|PC客户端|端点安全软件.*PC");
  const serverCount=extractAuthorizationCount(quoteItem,"服务器全量版|服务器端|端点安全软件.*服务器");
  if(isPureSoftwareQuoteProduct(quoteItem) || pcCount || serverCount || /统一端点安全|端点安全|aES/i.test(getQuoteModelText(quoteItem))){
    const clientParts=[];
    if(pcCount) clientParts.push(`PC客户端安全防护软件不少于${pcCount}套`);
    if(serverCount) clientParts.push(`服务器端安全防护软件不少于${serverCount}套`);
    const softwareText=[
      "产品支持纯软件交付",
      "包含管理控制中心软件及终端客户端软件",
      clientParts.length ? `本次提供${clientParts.join("、")}` : ""
    ].filter(Boolean).join("；");
    return cleanLocalOpeningText(softwareText);
  }

  const hardwareParts=[];
  const ports=extractStandardPorts(quoteItem);
  if(ports) hardwareParts.push(`标准${ports}`);
  const memory=extractFactValue(quoteItem,["内存大小","内存容量","内存"],["hardware","evidence"]);
  if(memory) hardwareParts.push(`配置内存≥${memory}`);
  const disk=extractFactValue(quoteItem,["硬盘容量","数据盘","存储容量"],["hardware","evidence"]);
  if(disk) hardwareParts.push(`配置硬盘≥${disk}`);
  if(hasRedundantPower(quoteItem)) hardwareParts.push("配置冗余电源");
  const height=extractDeviceHeight(quoteItem);
  if(height) hardwareParts.push(`标准${height}U机架式硬件`);

  const performanceLabels=[
    "网络层吞吐量",
    "应用层吞吐量",
    "防病毒吞吐量",
    "IPS吞吐量",
    "全威胁吞吐量",
    "带宽性能",
    "支持用户数",
    "最大并发连接数",
    "并发连接数",
    "HTTP新建连接数",
    "每秒新建连接数",
    "默认包含运维授权数",
    "最大可扩展资产数",
    "图形运维最大并发数",
    "字符运维最大并发数",
    "默认包含主机审计许可证书数量",
    "最大可扩展审计主机许可数",
    "平均每秒处理日志数",
    "最大硬件吞吐量",
    "最大纯数据库流量",
    "SQL处理性能",
    "日志检索性能",
    "存储容量",
    "存储时长",
    "吞吐量",
    "通信带宽"
  ];
  const performanceParts=[];
  const performanceOutputLabels=new Set();
  performanceLabels.forEach(label=>{
    const value=extractFactValue(quoteItem,[label],["performance","hardware","evidence"]);
    if(!value) return;
    const cleanValue=toText(value)
      .replace(/^[≥>=≤<]+\s*/,"")
      .replace(/（单独购买）|\(单独购买\)|（需单独收费）|\(需单独收费\)/g,"")
      .trim();
    if(!cleanValue) return;
    if(label==="带宽性能" && /天/.test(cleanValue)) return;
    let outputLabel=label==="HTTP新建连接数" ? "每秒新建连接数" : label;
    if(outputLabel==="默认包含运维授权数") outputLabel="运维授权数";
    if(outputLabel==="图形运维最大并发数") outputLabel="图形运维并发数";
    if(outputLabel==="字符运维最大并发数") outputLabel="字符运维并发数";
    if(outputLabel==="吞吐量" && performanceOutputLabels.has("网络层吞吐量")) return;
    if(outputLabel==="并发连接数" && performanceOutputLabels.has("最大并发连接数")) return;
    if(performanceOutputLabels.has(outputLabel)) return;
    performanceOutputLabels.add(outputLabel);
    performanceParts.push(`${outputLabel}≥${cleanValue}`);
  });

  const sections=[];
  if(hardwareParts.length) sections.push(`产品配置${dedupeExactTextArray(hardwareParts).join("，")}`);
  if(performanceParts.length) sections.push(dedupeExactTextArray(performanceParts).join("，"));
  return cleanLocalOpeningText(sections.join("；"));
}

function getLocalFirstHardwareParamOrEmpty(quoteProduct){
  const localParam=buildLocalFirstHardwareParam(quoteProduct);
  const sanitized=sanitizeGeneratedBaseParam(localParam,quoteProduct);
  const validation=validateGeneratedBaseParam(sanitized);
  return validation.ok ? sanitized : "";
}

async function applyProductAnalysesIfAvailable(quoteProducts,settings,quoteRunContext,extractResult,lineItems,anchor=null){
  const status=await getAiFlowStatus();
  const flowStatus=status.quote_product_analyze || {};
  const products=Array.isArray(quoteProducts) ? quoteProducts : [];
  if(!flowStatus.configured){
    const fallbackProducts=products.map(product=>{
      const firstHardwareParam=getLocalFirstHardwareParamOrEmpty(product);
      return {
        ...product,
        product_analysis:null,
        first_hardware_param:firstHardwareParam,
        product_analysis_error:firstHardwareParam ? "" : "quote_product_analyze 工作流未配置，未生成第一条基础参数。"
      };
    });
    return {
      products:fallbackProducts,
      notes:["quote_product_analyze 第一阶段未配置，已尝试使用本地报价单事实生成第一条基础参数。"],
      elapsedMs:0,
      used:false
    };
  }
  const startedAt=performance.now();
  const notes=[];
  const analyzedProducts=await runTasksWithLimit(
    products.map((quoteProduct,index)=>({quoteProduct,index})),
    Math.min(QUOTE_AI_MAX_CONCURRENCY,Math.max(products.length || 1,1)),
    async task=>{
      const name=toText(task.quoteProduct && task.quoteProduct.quote_product_name).trim() || `产品${task.index+1}`;
      try{
        const payload=buildQuoteProductAnalyzePayload(
          settings,
          task.quoteProduct,
          {
            chatId:makeFastGptChatId("quote-product-analyze",quoteRunContext,`p${task.index+1}`)
          }
        );
        const response=await requestAiCompletion(settings,payload);
        const workflowError=getWorkflowNodeError(response);
        if(workflowError){
          const message=getAiErrorMessage(workflowError);
          const fallbackParam=getLocalFirstHardwareParamOrEmpty(task.quoteProduct);
          if(fallbackParam){
            console.warn("报价单产品分析失败，已用本地事实兜底",{
              product:name,
              message
            });
          }else{
            notes.push(`【${name}】产品分析失败：${message}`);
          }
          return {
            ...task.quoteProduct,
            product_analysis:null,
            first_hardware_param:fallbackParam,
            product_analysis_error:fallbackParam ? "" : message
          };
        }
        let parsedAnalysis=null;
        try{
          parsedAnalysis=parseStructuredAiJsonResponse(response);
        }catch(parseErr){
          parsedAnalysis=getAssistantTextFromResponse(response);
        }
        const analysis=normalizeProductAnalyzeResult(parsedAnalysis);
        const sanitizedParam=sanitizeGeneratedBaseParam(analysis.first_hardware_param,task.quoteProduct);
        const validation=validateGeneratedBaseParam(sanitizedParam);
        let firstParam=validation.ok ? sanitizedParam : "";
        const reviewReasons=[];
        if(!validation.ok){
          reviewReasons.push(...validation.issues);
        }
        if(!firstParam){
          const fallbackParam=getLocalFirstHardwareParamOrEmpty(task.quoteProduct);
          if(fallbackParam){
            firstParam=fallbackParam;
            console.warn("AI 第一条基础参数不可用，已用本地事实兜底",{
              product:name,
              reasons:reviewReasons
            });
          }
        }
        if(reviewReasons.length && !firstParam){
          notes.push(`【${name}】产品分析需确认：${reviewReasons.join("、")}`);
        }
        return {
          ...task.quoteProduct,
          first_hardware_param:firstParam,
          product_analysis:{
            ...analysis,
            first_hardware_param:firstParam
          },
          product_analysis_error:firstParam ? "" : (reviewReasons.length ? reviewReasons.join("、") : "")
        };
      }catch(err){
        const message=getAiErrorMessage(err);
        const fallbackParam=getLocalFirstHardwareParamOrEmpty(task.quoteProduct);
        if(fallbackParam){
          console.warn("报价单产品分析调用失败，已用本地事实兜底",{
            product:name,
            message
          });
        }else{
          notes.push(`【${name}】产品分析调用失败：${message}`);
        }
        return {
          ...task.quoteProduct,
          product_analysis:null,
          first_hardware_param:fallbackParam,
          product_analysis_error:fallbackParam ? "" : message
        };
      }
    }
  );
  return {
    products:analyzedProducts,
    notes,
    elapsedMs:performance.now()-startedAt,
    used:true
  };
}

function getAssistantTextFromResponse(response){
  if(response && Array.isArray(response.responseData)){
    const outputKeys=[
      "textOutput",
      "answerText",
      "answer",
      "content",
      "output",
      "response",
      "result"
    ];
    const textOutputNode=[...response.responseData].reverse().find(item=>
      item && outputKeys.some(key=>toText(item[key]).trim())
    );
    if(textOutputNode){
      for(const key of outputKeys){
        const value=textOutputNode[key];
        if(typeof value==="string" && value.trim()) return value.trim();
        if(value && typeof value==="object"){
          const nested=toText(value.content || value.text || value.answer || value.output).trim();
          if(nested) return nested;
        }
      }
    }
  }
  const choiceMessage=(
    response &&
    response.choices &&
    response.choices[0] &&
    response.choices[0].message &&
    response.choices[0].message.content
  );
  if(Array.isArray(choiceMessage)){
    const textPart=choiceMessage.find(item=>item && typeof item==="object" && item.type==="text");
    if(textPart){
      if(typeof textPart.text==="string") return toText(textPart.text);
      if(textPart.text && typeof textPart.text==="object"){
        if(typeof textPart.text.content==="string") return textPart.text.content;
        if(typeof textPart.text.text==="string") return textPart.text.text;
      }
    }
  }
  if(choiceMessage) return toText(choiceMessage);
  if(response && response.choices && response.choices[0] && response.choices[0].text){
    return toText(response.choices[0].text);
  }
  if(response && response.data && typeof response.data==="object"){
    if(response.data.answer) return toText(response.data.answer);
    if(response.data.content) return toText(response.data.content);
    if(response.data.text) return toText(response.data.text);
    if(response.data.result) return typeof response.data.result==="string"
      ? response.data.result
      : JSON.stringify(response.data.result);
  }
  if(response && response.answer) return toText(response.answer);
  if(response && response.content) return toText(response.content);
  if(response && response.text) return toText(response.text);
  if(response && response.result) return typeof response.result==="string"
    ? response.result
    : JSON.stringify(response.result);
  return "";
}

function addAiTextCandidate(candidates,seen,source,value){
  if(typeof value==="string"){
    const text=value.trim();
    if(text && !seen.has(text)){
      seen.add(text);
      candidates.push({source,text});
    }
    return;
  }
  if(Array.isArray(value)){
    value.forEach((item,index)=>addAiTextCandidate(candidates,seen,`${source}[${index}]`,item));
    return;
  }
  if(value && typeof value==="object"){
    if(isLikelyStructuredAiJsonPayload(value)){
      const text=JSON.stringify(value);
      if(text && !seen.has(text)){
        seen.add(text);
        candidates.push({source,text});
      }
      return;
    }
    if(value.type==="text" && value.text!==undefined){
      addAiTextCandidate(candidates,seen,`${source}.text`,value.text);
      return;
    }
    ["content","text","answer","output","result","response"].forEach(key=>{
      if(value[key]!==undefined){
        addAiTextCandidate(candidates,seen,`${source}.${key}`,value[key]);
      }
    });
  }
}

function collectStructuredAiJsonCandidates(response){
  const candidates=[];
  const seen=new Set();
  const choiceMessage=response && response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content
    : null;
  addAiTextCandidate(candidates,seen,"choices[0].message.content",choiceMessage);
  if(response && response.choices && response.choices[0] && response.choices[0].text){
    addAiTextCandidate(candidates,seen,"choices[0].text",response.choices[0].text);
  }
  if(response && response.data && typeof response.data==="object"){
    ["result","content","answer","text","output","response"].forEach(key=>{
      addAiTextCandidate(candidates,seen,`data.${key}`,response.data[key]);
    });
  }
  if(response && typeof response==="object"){
    ["result","content","answer","text","output","response"].forEach(key=>{
      addAiTextCandidate(candidates,seen,key,response[key]);
    });
  }
  if(response && Array.isArray(response.responseData)){
    [...response.responseData].reverse().forEach((node,index)=>{
      ["textOutput","answerText","answer","content","output","response","result"].forEach(key=>{
        addAiTextCandidate(candidates,seen,`responseData[-${index+1}].${key}`,node && node[key]);
      });
    });
  }
  return candidates;
}

function isLikelyStructuredAiJsonPayload(parsed){
  if(Array.isArray(parsed)){
    return parsed.some(item=>item && typeof item==="object");
  }
  if(!parsed || typeof parsed!=="object") return false;
  const keys=[
    "products",
    "product",
    "selected_params",
    "selectedParams",
    "parameters",
    "params",
    "product_analysis",
    "first_hardware_param",
    "matched_template_id"
  ];
  return keys.some(key=>Object.prototype.hasOwnProperty.call(parsed,key));
}

function getWorkflowNodeError(response){
  if(!response || !Array.isArray(response.responseData)) return "";
  const errorNode=response.responseData.find(item=>toText(item && item.errorText).trim());
  return errorNode ? toText(errorNode.errorText).trim() : "";
}

function parseStructuredAiJsonResponse(response,validateParsed=null){
  const canUseParsed=parsed=>{
    if(!isLikelyStructuredAiJsonPayload(parsed)) return {ok:false,reason:"JSON 结构不包含可用字段"};
    if(typeof validateParsed!=="function") return {ok:true,reason:""};
    const validation=validateParsed(parsed);
    if(validation===true || validation===undefined || validation===null) return {ok:true,reason:""};
    if(validation && validation.ok) return {ok:true,reason:""};
    return {
      ok:false,
      reason:toText(validation && validation.reason).trim() || "JSON 结构未通过当前任务校验"
    };
  };
  if(response && response.data && typeof response.data==="object"){
    if(response.data.result && typeof response.data.result==="object"){
      const validation=canUseParsed(response.data.result);
      if(validation.ok){
        return response.data.result;
      }
    }
    if(response.data.content && typeof response.data.content==="object"){
      const validation=canUseParsed(response.data.content);
      if(validation.ok){
        return response.data.content;
      }
    }
  }
  const candidates=collectStructuredAiJsonCandidates(response);
  const parseErrors=[];
  for(const candidate of candidates){
    try{
      const parsed=JSON.parse(extractJsonText(candidate.text));
      const validation=canUseParsed(parsed);
      if(validation.ok){
        console.info("AI 结构化结果解析成功",{
          source:candidate.source,
          length:candidate.text.length
        });
        return parsed;
      }
      parseErrors.push(`${candidate.source}: ${validation.reason}`);
    }catch(err){
      parseErrors.push(`${candidate.source}: ${err && err.message || err}`);
    }
  }
  console.warn("AI 结构化结果解析失败",{
    candidates:candidates.map(candidate=>({
      source:candidate.source,
      length:candidate.text.length,
      preview:candidate.text.slice(0,120)
    })),
    errors:parseErrors.slice(0,8)
  });
  throw new Error("AI_JSON_NOT_FOUND");
}

function createQuoteSelectResultValidator(catalogProduct,expectedTaskId=""){
  const expectedParamIds=new Set(
    (Array.isArray(catalogProduct && catalogProduct.params) ? catalogProduct.params : [])
      .map(param=>Number(param && param.param_id))
      .filter(Number.isFinite)
  );
  const expectedProductName=[
    catalogProduct && catalogProduct.database_name,
    catalogProduct && catalogProduct.product_line,
    catalogProduct && catalogProduct.version
  ].filter(Boolean).join(" / ");
  const expectedId=toText(expectedTaskId).trim();
  return parsed=>{
    if(expectedId){
      const rootTaskId=getFirstNonEmptyTextValue(parsed,["quote_task_id","task_id","request_id","chat_id","chatId"]);
      const productTaskIds=Array.isArray(parsed && parsed.products)
        ? parsed.products.map(product=>getFirstNonEmptyTextValue(product,["quote_task_id","task_id","request_id","chat_id","chatId"])).filter(Boolean)
        : [];
      const returnedTaskIds=[rootTaskId,...productTaskIds].filter(Boolean);
      if(returnedTaskIds.length && !returnedTaskIds.includes(expectedId)){
        return {
          ok:false,
          reason:`quote_task_id 不匹配，期望 ${expectedId}`
        };
      }
    }
    const normalized=normalizeQuoteParseResult(parsed);
    const selectedParams=normalized.products.flatMap(product=>Array.isArray(product.selected_params) ? product.selected_params : []);
    if(selectedParams.length===0){
      return {ok:false,reason:`未找到 selected_params，期望参数库产品：${expectedProductName || "当前产品"}`};
    }
    const numericIds=selectedParams
      .map(param=>Number(param && param.database_param_id))
      .filter(Number.isFinite);
    if(numericIds.length===0){
      return {ok:true};
    }
    const matchedCount=numericIds.filter(id=>expectedParamIds.has(id)).length;
    if(matchedCount>0){
      return {ok:true};
    }
    return {
      ok:false,
      reason:`selected_params 的参数 ID 不属于当前参数库产品：${expectedProductName || "当前产品"}`
    };
  };
}

function getFormatMaterialOptionText(option){
  const mode=toText(option && option.mode).trim();
  const custom=toText(option && option.custom).trim();
  const map={
    keep:"不修改",
    delete:"删除",
    screenshot:"需提供功能截图证明材料并加盖公章",
    report:"需提供CMA/CNAS认证机构出具的该功能检测报告，并加盖厂商公章",
    both:"需提供功能截图证明材料并加盖公章；需提供CMA/CNAS认证机构出具的该功能检测报告，并加盖厂商公章",
    custom:custom || "自定义"
  };
  return map[mode] || "不修改";
}

function getFormatEndingOptionText(option){
  const mode=toText(option && option.mode).trim();
  const map={
    keep:"不修改",
    period:"句号",
    semicolon:"分号",
    none:"无符号"
  };
  return map[mode] || "不修改";
}

function isFormatOptionActive(options){
  return ["ending","triangleProof","starProof","plainProof"].some(key=>{
    const mode=toText(options && options[key] && options[key].mode).trim();
    return mode && mode!=="keep";
  }) || Boolean(toText(options && options.specialRequirement).trim());
}

function getFormatOptionsText(options){
  return [
    "[整理选项]",
    `结尾符号: ${getFormatEndingOptionText(options && options.ending)}`,
    `▲项证明材料: ${getFormatMaterialOptionText(options && options.triangleProof)}`,
    `★项证明材料: ${getFormatMaterialOptionText(options && options.starProof)}`,
    `其他材料: ${getFormatMaterialOptionText(options && options.plainProof)}`,
    `特殊要求: ${toText(options && options.specialRequirement).trim() || "无"}`
  ].join("\n");
}

function getParamFormatMarker(param){
  const text=[param && param.prefix_symbol,param && param.content,param && param.is_star,param && param.type].map(toText).join(" ");
  if(text.includes("★")) return "★";
  if(text.includes("▲")) return "▲";
  return "无";
}

function getAllFormatTargetItems(){
  const items=[];
  state.instances.forEach(instance=>{
    const selectedList=Array.isArray(instance && instance.selected) ? instance.selected : [];
    selectedList.forEach((param,paramIndex)=>{
      const content=toText(param && param.content).trim();
      if(!content) return;
      items.push({
        index:items.length,
        instanceId:instance.id,
        instanceName:toText(instance.name).trim() || "产品",
        paramIndex,
        marker:getParamFormatMarker(param),
        type:toText((param && param.is_star) || (param && param.type)).trim(),
        content
      });
    });
  });
  return items;
}

function applyFormatEndingFallback(content,options){
  const mode=toText(options && options.ending && options.ending.mode).trim();
  if(!["period","semicolon","none"].includes(mode)) return content;
  const trimmed=toText(content).trim();
  if(!trimmed) return trimmed;
  const withoutEnding=trimmed.replace(/[。；;.\s]+$/u,"");
  if(mode==="period") return `${withoutEnding}。`;
  if(mode==="semicolon") return `${withoutEnding}；`;
  return withoutEnding;
}

async function requestParamFormat(settings,options,items){
  const payload={
    model:settings.model,
    messages:[
      {
        role:"user",
        content:[
          getFormatOptionsText(options),
          "",
          "[参数列表]",
          ...items.map(item=>`#${item.index} | 标记=${item.marker} | 内容=${toText(item.content).replace(/\s+/g," ").trim()}`)
        ].join("\n")
      }
    ],
    temperature:0,
    stream:false,
    detail:false,
    response_format:{type:"json_object"}
  };
  return requestAiCompletion(settings,payload);
}

function normalizeFormatResult(response,options,items){
  const assistantText=getAssistantTextFromResponse(response);
  const parsed=JSON.parse(extractJsonText(assistantText));
  const rawItems=Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
  const originalByIndex=new Map((Array.isArray(items) ? items : []).map(item=>[Number(item.index),item]));
  return rawItems
    .map(item=>{
      const index=Number(item.index);
      const original=originalByIndex.get(index);
      const formatted=applyFormatEndingFallback(
        toText(item.formatted_content || item.content || item.text).trim(),
        options
      );
      return {
        index,
        instanceId:original && original.instanceId,
        instanceName:toText(original && original.instanceName).trim(),
        paramIndex:Number(original && original.paramIndex),
        original_content:toText(original && original.content).trim(),
        formatted_content:formatted
      };
    })
    .filter(item=>(
      Number.isInteger(item.index) &&
      item.index>=0 &&
      item.index<items.length &&
      item.instanceId &&
      Number.isInteger(item.paramIndex) &&
      item.formatted_content
    ));
}

async function formatParamsWithAi(options,anchorEl=null){
  const items=getAllFormatTargetItems();
  if(items.length===0){
    showToast("请先选择参数","error",anchorEl);
    return;
  }
  const settings=getFormatAiSettings();
  if(!await isConfiguredAiFlow(settings)){
    showToast("AI 整理格式 API 尚未配置","error",anchorEl);
    sendAnalyticsEvent({
      type:"format",
      status:"failure",
      durationMs:0,
      targetParamCount:items.length,
      errorCode:"AI_CONFIG_MISSING"
    });
    return;
  }
  if(!isFormatOptionActive(options)){
    showToast("请至少选择一项整理内容或填写特殊要求","error",anchorEl);
    return;
  }
  const button=anchorEl && anchorEl.tagName==="BUTTON" ? anchorEl : null;
  const previousText=button ? button.textContent : "";
  if(button){
    button.disabled=true;
    button.textContent="整理中";
  }
  setFormatStatus("正在调用 AI 整理格式...","");
  showAiTaskProgress("AI 正在整理格式",["准备参数","调用 AI","解析结果","生成预览"],1);
  const analyticsStartedAt=performance.now();
  try{
    const response=await requestParamFormat(settings,options,items);
    updateAiTaskProgress(2);
    const resultItems=normalizeFormatResult(response,options,items);
    if(resultItems.length===0){
      throw new Error("AI_JSON_NOT_FOUND");
    }
    updateAiTaskProgress(3);
    hideLoading();
    openFormatPreviewModal(resultItems);
    sendAnalyticsEvent({
      type:"format",
      status:"success",
      durationMs:performance.now()-analyticsStartedAt,
      targetParamCount:items.length,
      paramCount:resultItems.length
    });
  }catch(err){
    updateAiTaskProgress(state.aiTask ? state.aiTask.currentIndex : 1,state.aiTask ? state.aiTask.currentIndex : 1);
    hideLoading();
    const message=getAiErrorMessage(err);
    setFormatStatus(message,"error");
    showToast(message,"error",anchorEl);
    sendAnalyticsEvent({
      type:"format",
      status:"failure",
      durationMs:performance.now()-analyticsStartedAt,
      targetParamCount:items.length,
      errorCode:getErrorInfo(err).code || "FORMAT_FAILED"
    });
    console.error(err);
  }finally{
    if(button){
      button.disabled=false;
      button.textContent=previousText;
    }
  }
}

function applyFormattedParams(){
  const items=Array.isArray(state.formatDraft) ? state.formatDraft : [];
  let appliedCount=0;
  items.forEach(item=>{
    const instance=getInstanceById(item.instanceId);
    const param=instance && Array.isArray(instance.selected) ? instance.selected[item.paramIndex] : null;
    if(!instance || !param) return;
    const normalizedValue=normalizeParamContentValue(item.formatted_content);
    param.content=normalizedValue;
    instance.editedContentByParamId[param.id]=normalizedValue;
    appliedCount+=1;
  });
  const activeInstance=getActiveInstance();
  if(activeInstance){
    state.selected=activeInstance.selected;
    state.editedContentByParamId=activeInstance.editedContentByParamId;
  }
  renderEditArea();
  schedulePreviewUpdate();
  closeFormatModal();
  showToast(`已整理 ${appliedCount} 条参数格式`,"success");
}

function getRewriteContentFromAiText(rawText){
  const text=toText(rawText).trim();
  if(!text) return "";
  try{
    const parsed=JSON.parse(extractJsonText(text));
    if(parsed && typeof parsed==="object"){
      return toText(parsed.rewritten_content || parsed.content || parsed.text || parsed.result).trim();
    }
  }catch(err){
    // Plain text is the preferred workflow output for rewrite.
  }
  return text
    .replace(/^```(?:text|markdown)?\s*/i,"")
    .replace(/```$/,"")
    .trim();
}

function setRewriteStatus(message,type=""){
  const status=document.getElementById("rewriteModalStatus");
  if(!status) return;
  status.className=`ai-status${type ? ` ${type}` : ""}`;
  status.textContent=message;
}

async function requestParamRewrite(settings,param,mode,requirement){
  const payload={
    model:settings.model,
    messages:[
      {
        role:"user",
        content:[
          "[改写模式]",
          mode==="regular" ? "常规改写" : "特殊改写",
          "",
          "[用户要求]",
          mode==="regular" ? "不改变技术含义，仅优化表达。" : (toText(requirement).trim() || "按更适合招标参数的表达进行优化。"),
          "",
          "[原文]",
          toText(param.content)
        ].join("\n")
      }
    ],
    temperature:mode==="regular" ? 0.2 : 0.35,
    stream:false,
    detail:false
  };
  return requestAiCompletion(settings,payload);
}

async function rewriteParamWithAi(index,mode,requirement="",anchorEl=null){
  const param=state.selected[index];
  if(!param){
    showToast("未找到要改写的参数","error",anchorEl);
    return;
  }
  const originalText=toText(param.content).trim();
  if(!originalText){
    showToast("参数内容为空，无法改写","error",anchorEl);
    return;
  }
  const settings=getRewriteAiSettings();
  if(!await isConfiguredAiFlow(settings)){
    const msg="AI 改写 API 尚未配置，等你搭建好 FastGPT 工作流后把 API 地址和 key 给我即可。";
    setRewriteStatus(msg,"error");
    showToast(msg,"error",anchorEl);
    sendAnalyticsEvent({
      type:"rewrite",
      status:"failure",
      durationMs:0,
      targetParamCount:1,
      errorCode:"AI_CONFIG_MISSING"
    });
    return;
  }

  const button=anchorEl && anchorEl.tagName==="BUTTON" ? anchorEl : null;
  const previousText=button ? button.textContent : "";
  if(button){
    button.disabled=true;
    button.textContent="改写中";
  }
  setRewriteStatus("正在调用 AI 改写...","");
  const analyticsStartedAt=performance.now();
  try{
    const response=await requestParamRewrite(settings,param,mode,requirement);
    setRewriteStatus("正在提取改写内容...","");
    const assistantText=getAssistantTextFromResponse(response);
    const rewritten=getRewriteContentFromAiText(assistantText);
    if(!rewritten){
      throw new Error("AI_EMPTY");
    }
    openRewritePreviewModal(index,mode,requirement,rewritten);
    sendAnalyticsEvent({
      type:"rewrite",
      status:"success",
      durationMs:performance.now()-analyticsStartedAt,
      targetParamCount:1,
      paramCount:1
    });
  }catch(err){
    const message=getAiErrorMessage(err);
    setRewriteStatus(message,"error");
    showToast(message,"error",anchorEl);
    sendAnalyticsEvent({
      type:"rewrite",
      status:"failure",
      durationMs:performance.now()-analyticsStartedAt,
      targetParamCount:1,
      errorCode:getErrorInfo(err).code || "REWRITE_FAILED"
    });
    console.error(err);
  }finally{
    if(button){
      button.disabled=false;
      button.textContent=previousText;
    }
  }
}

function getBatchSelectedItems(){
  const selectedIds=state.batchSelectedParamIds instanceof Set ? state.batchSelectedParamIds : new Set();
  return state.selected
    .map((param,index)=>({param,index}))
    .filter(item=>selectedIds.has(String(item.param && item.param.id)));
}

function pruneBatchSelection(){
  if(!(state.batchSelectedParamIds instanceof Set)){
    state.batchSelectedParamIds=new Set();
  }
  const validIds=new Set(state.selected.map(param=>String(param.id)));
  [...state.batchSelectedParamIds].forEach(id=>{
    if(!validIds.has(id)) state.batchSelectedParamIds.delete(id);
  });
}

function updateBatchToolbarState(){
  const count=getBatchSelectedItems().length;
  document.querySelectorAll("[data-batch-action]").forEach(button=>{button.disabled=count===0;});
  document.querySelectorAll("[data-batch-clear]").forEach(button=>{button.disabled=count===0;});
  document.querySelectorAll("[data-batch-select-all]").forEach(control=>{
    const allSelected=state.selected.length>0 && count===state.selected.length;
    const partial=count>0 && count<state.selected.length;
    if(control.type==="checkbox"){
      control.checked=allSelected;
      control.indeterminate=partial;
    }else{
      control.classList.toggle("active",allSelected);
      control.textContent="全选";
      control.title=partial ? "补全选择" : "全选";
      control.setAttribute("aria-label",partial ? "补全选择" : "全选");
      control.disabled=state.selected.length===0;
    }
  });
}

function toggleBatchParamSelection(paramId,checked){
  if(!(state.batchSelectedParamIds instanceof Set)){
    state.batchSelectedParamIds=new Set();
  }
  const id=String(paramId);
  if(checked){
    state.batchSelectedParamIds.add(id);
  }else{
    state.batchSelectedParamIds.delete(id);
  }
  updateBatchToolbarState();
}

function toggleBatchSelectAll(checked){
  state.batchSelectedParamIds=new Set(checked ? state.selected.map(param=>String(param.id)) : []);
  renderEditArea();
}

function toggleBatchSelectAllFromButton(button){
  toggleBatchSelectAll(true);
}

function clearBatchSelection(){
  state.batchSelectedParamIds=new Set();
  renderEditArea();
}

function setParamContentById(paramId,value){
  const index=state.selected.findIndex(item=>String(item.id)===String(paramId));
  if(index===-1) return false;
  const normalizedValue=normalizeParamContentValue(value);
  state.selected[index].content=normalizedValue;
  state.editedContentByParamId[state.selected[index].id]=normalizedValue;
  return true;
}

async function confirmBatchRemoveSelected(anchorEl=null){
  const items=getBatchSelectedItems();
  if(!items.length){
    showToast("请先勾选要删除的参数","error",anchorEl);
    return;
  }
  const confirmed=await confirmAtAnchor(`确定要删除已勾选的 ${items.length} 条参数吗？`,anchorEl);
  if(!confirmed) return;
  const removeIds=new Set(items.map(item=>String(item.param.id)));
  state.selected=state.selected.filter(param=>!removeIds.has(String(param.id)));
  state.batchSelectedParamIds=new Set();
  syncParamSelectionStates();
  renderEditArea();
  schedulePreviewUpdate();
  updateMobileContext();
  showToast(`已删除 ${items.length} 条参数`,"success",anchorEl);
}

async function batchRewriteSelectedParams(mode="regular",requirement="",button=null){
  const items=getBatchSelectedItems().filter(item=>toText(item.param && item.param.content).trim());
  if(!items.length){
    showToast("勾选的参数内容为空，无法改写","error",button);
    return;
  }
  const rewriteMode=mode==="special" ? "special" : "regular";
  const settings=getRewriteAiSettings();
  if(!await isConfiguredAiFlow(settings)){
    const msg="AI 改写 API 尚未配置，等你搭建好 FastGPT 工作流后把 API 地址和 key 给我即可。";
    setRewriteStatus(msg,"error");
    showToast(msg,"error",button);
    sendAnalyticsEvent({
      type:"rewrite",
      status:"failure",
      durationMs:0,
      targetParamCount:items.length,
      errorCode:"AI_CONFIG_MISSING"
    });
    return;
  }

  const previousText=button ? button.textContent : "";
  if(button){
    button.disabled=true;
  }
  const startedAt=performance.now();
  let successCount=0;
  let failureCount=0;
  for(let i=0;i<items.length;i+=1){
    const item=items[i];
    if(button){
      button.textContent=`改写中 ${i+1}/${items.length}`;
    }
    setRewriteStatus(`正在改写 ${i+1}/${items.length}：参数 ${item.index+1}`,"");
    try{
      const response=await requestParamRewrite(settings,item.param,rewriteMode,requirement);
      const assistantText=getAssistantTextFromResponse(response);
      const rewritten=getRewriteContentFromAiText(assistantText);
      if(!rewritten){
        throw new Error("AI_EMPTY");
      }
      if(setParamContentById(item.param.id,rewritten)){
        successCount+=1;
      }else{
        failureCount+=1;
      }
    }catch(err){
      failureCount+=1;
      console.error(err);
    }
  }

  if(button){
    button.disabled=false;
    button.textContent=previousText;
  }
  renderEditArea();
  schedulePreviewUpdate();
  closeRewriteModal();
  if(failureCount){
    showToast(`批量改写完成：成功 ${successCount} 条，失败 ${failureCount} 条`,"error",button);
  }else{
    showToast(`已批量改写 ${successCount} 条参数`,"success",button);
  }
  sendAnalyticsEvent({
    type:"rewrite",
    status:failureCount ? "failure" : "success",
    durationMs:performance.now()-startedAt,
    targetParamCount:items.length,
    paramCount:successCount,
    errorCode:failureCount ? "BATCH_REWRITE_PARTIAL_FAILED" : ""
  });
}

function extractJsonText(rawText){
  const text=toText(rawText).trim();
  if(!text) throw new Error("AI_EMPTY");
  if((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))){
    return text;
  }
  const blockMatch=text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/);
  if(blockMatch) return toText(blockMatch[1]).trim();
  const firstBrace=text.indexOf("{");
  const lastBrace=text.lastIndexOf("}");
  if(firstBrace!==-1 && lastBrace!==-1 && lastBrace>firstBrace){
    return text.slice(firstBrace,lastBrace+1);
  }
  throw new Error("AI_JSON_NOT_FOUND");
}

function getFirstNonEmptyTextValue(source,keys){
  const object=source && typeof source==="object" ? source : {};
  for(const key of keys){
    if(object[key]===undefined || object[key]===null) continue;
    const text=toText(object[key]).trim();
    if(text) return text;
  }
  return "";
}

function getFirstDefinedValue(source,keys){
  const object=source && typeof source==="object" ? source : {};
  for(const key of keys){
    if(object[key]!==undefined && object[key]!==null){
      return object[key];
    }
  }
  return undefined;
}

function normalizeSelectedParamSpec(spec){
  if(!spec || typeof spec!=="object") return null;
  const rawParamId=getFirstDefinedValue(spec,["database_param_id","param_id","id","databaseParamId","paramId"]);
  const title=getFirstNonEmptyTextValue(spec,["title","name","param_title","parameter_title","paramName"]);
  const finalContent=getFirstNonEmptyTextValue(spec,["final_content","finalContent","content","text","body"]);
  return {
    ...spec,
    database_param_id:rawParamId,
    title,
    final_content:finalContent
  };
}

function getSelectedParamSourceKey(source){
  if(!source || typeof source!=="object") return "";
  return ["selected_params","selectedParams","parameters","params"].find(key=>Object.prototype.hasOwnProperty.call(source,key)) || "";
}

function normalizeQuoteParseResult(parsed){
  const result=parsed && typeof parsed==="object" ? parsed : {};
  const rawNotes=Array.isArray(result.notes) ? result.notes : (result.notes ? [result.notes] : []);
  const notes=rawNotes.map(item=>toText(item).trim()).filter(Boolean);
  const resultParamKey=getSelectedParamSourceKey(result);
  const rawProducts=Array.isArray(result)
    ? result
    : (
      Array.isArray(result.products)
        ? result.products
        : (
          result.product
            ? [result.product]
            : (resultParamKey ? [result] : [])
        )
    );
  const products=rawProducts
    .filter(item=>item && typeof item==="object")
    .map((item,index)=>{
      const selectedParamKey=getSelectedParamSourceKey(item);
      const rawSelectedValue=selectedParamKey ? item[selectedParamKey] : [];
      const rawSelectedParams=Array.isArray(rawSelectedValue) ? rawSelectedValue : [];
      if(selectedParamKey && rawSelectedValue!==undefined && rawSelectedValue!==null && !Array.isArray(rawSelectedValue)){
        const productName=getFirstNonEmptyTextValue(item,["quote_product_name","product_name","name","instance_name","instanceName"]) || `产品${index+1}`;
        notes.push(`【${productName}】AI 返回的 ${selectedParamKey} 不是数组，已只应用第一条基础参数。`);
      }
      return {
        ...item,
        quote_product_name:getFirstNonEmptyTextValue(item,["quote_product_name","product_name","name"]) || toText(item.quote_product_name).trim(),
        database_product_hint:getFirstNonEmptyTextValue(item,["database_product_hint","database_name","product_hint"]) || toText(item.database_product_hint).trim(),
        instance_name:getFirstNonEmptyTextValue(item,["instance_name","instanceName","quote_product_name","product_name","name"]) || toText(item.instance_name).trim(),
        first_hardware_param:normalizeFirstHardwareParamValue(item.first_hardware_param),
        product_analysis:item.product_analysis && typeof item.product_analysis==="object" ? item.product_analysis : null,
        product_analysis_error:toText(item.product_analysis_error).trim(),
        selected_params:rawSelectedParams
          .map(normalizeSelectedParamSpec)
          .filter(Boolean)
      };
    });
  return {products,notes:dedupeExactTextArray(notes)};
}

function dedupeExactTextArray(values){
  const seen=new Set();
  const result=[];
  (Array.isArray(values) ? values : []).forEach(value=>{
    const text=toText(value).trim();
    if(!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
}

function validateQuoteParseResultStructure(parsedResult){
  if(!parsedResult || !Array.isArray(parsedResult.products)){
    throw new Error("AI_SELECT_INVALID_STRUCTURE");
  }
  const notes=dedupeExactTextArray(Array.isArray(parsedResult.notes) ? parsedResult.notes : []);
  const products=[];
  parsedResult.products.forEach((product,index)=>{
    if(!product || typeof product!=="object"){
      notes.push(`第 ${index+1} 个 AI 返回产品不是对象，已跳过。`);
      return;
    }
    const productName=toText(product.quote_product_name || product.instance_name).trim() || `产品${index+1}`;
    const selectedParams=[];
    const rawSelectedParams=Array.isArray(product.selected_params) ? product.selected_params : [];
    rawSelectedParams.forEach((param,paramIndex)=>{
      if(!param || typeof param!=="object"){
        notes.push(`【${productName}】第 ${paramIndex+1} 条 AI 返回参数不是对象，已跳过。`);
        return;
      }
      const hasId=Number.isFinite(Number(param.database_param_id));
      const hasTitle=Boolean(toText(param.title).trim());
      if(!hasId && !hasTitle){
        notes.push(`【${productName}】第 ${paramIndex+1} 条 AI 返回参数缺少可匹配的参数 ID 或标题，已跳过。`);
        return;
      }
      selectedParams.push(param);
    });
    products.push({
      ...product,
      selected_params:selectedParams
    });
  });
  return {products,notes:dedupeExactTextArray(notes)};
}

async function parseQuoteFile(file,anchor=null){
  let quoteAnalyticsStartedAt=0;
  const quoteAnalyticsContext={
    productCount:0,
    paramCount:0,
    selectTaskCount:0,
    aiDurationMs:0
  };
  try{
    if(!file){
      const message="请先选择报价单";
      setQuoteUploadState("没有选择文件，可以重新选择。",{busy:false});
      showToast(message,"error",anchor);
      return;
    }
    if(state.products.length===0){
      const message="请先生成并载入参数库";
      setQuoteUploadState(message,{busy:false});
      showToast(message,"error",anchor);
      return;
    }
    const productAnalyzeSettings=getQuoteProductAnalyzeAiSettings();
    const selectSettings=getQuoteSelectAiSettings();
    if(!await isConfiguredAiFlow(selectSettings)){
      const message="请先在后端配置参数选择流";
      setQuoteUploadState(message,{busy:false});
      showToast(message,"error",anchor);
      sendAnalyticsEvent({
        type:"generate_params",
        status:"failure",
        durationMs:0,
        errorCode:"AI_CONFIG_MISSING"
      });
      return;
    }

    quoteAnalyticsStartedAt=performance.now();
    const quoteRunContext=createQuoteRunContext(await getFileHash(file));
    const standardQuote=await standardizeQuoteFile(file);
    const preprocessResult=preprocessQuoteStandard(standardQuote);
    const detectedQuoteType=toText(preprocessResult && preprocessResult.normalized && preprocessResult.normalized.quote_export_type).trim();
    if(!["single_unit_summary","aggregate_summary","detail_itemized"].includes(detectedQuoteType)){
      throw new Error("当前仅支持“单台配置汇总清单”和“汇总清单”，请更换报价单类型后重试。");
    }
    const lineItems=preprocessResult.lineItems && preprocessResult.lineItems.length
      ? preprocessResult.lineItems
      : [];
    if(lineItems.length===0){
      throw new Error("未识别到有效报价产品，请检查是否为“单台配置汇总清单”或“汇总清单”。");
    }
    const extractStartedAt=performance.now();
    let extractChatId="local";
    const rawExtractResult=buildLocalQuoteExtractResult(preprocessResult,lineItems);
    quoteRunContext.timings.extractMs=performance.now()-extractStartedAt;
    const extractResult=alignExtractResultToQuoteRows(rawExtractResult,lineItems);
    if(!Array.isArray(extractResult.quote_products) || extractResult.quote_products.length===0){
      throw new Error("未识别到有效报价产品，请检查报价单中是否只有空占位行或无事实内容的产品行。");
    }
    closeQuoteUploadModal(true);
    let confirmSourceResult=extractResult;
    let confirmedExtractResult=null;
    let generationStrategy=null;
    let strategyDraft=null;
    while(true){
      confirmedExtractResult=await openQuoteExtractConfirmModal(confirmSourceResult,lineItems);
      if(!confirmedExtractResult){
        showToast("已取消报价产品确认","info",anchor);
        return;
      }
      generationStrategy=await openQuoteGenerationStrategyModal(confirmedExtractResult,strategyDraft);
      if(generationStrategy && generationStrategy.action==="back"){
        strategyDraft=generationStrategy;
        confirmSourceResult={
          ...confirmedExtractResult,
          quote_products:Array.isArray(confirmedExtractResult.__all_quote_products)
            ? confirmedExtractResult.__all_quote_products
            : confirmedExtractResult.quote_products
        };
        continue;
      }
      if(!generationStrategy){
        showToast("已取消生成策略设置","info",anchor);
        return;
      }
      break;
    }
    showAiTaskProgress("AI 正在生成中",[
      "生成第一条和模块",
      "准备参数库",
      "生成后续参数",
      "应用到页面"
    ],0);
    state.quoteGenerationStrategy=generationStrategy;
    let quoteProducts=confirmedExtractResult.quote_products.length
      ? confirmedExtractResult.quote_products
      : [];
    if(quoteProducts.length===0){
      throw new Error("QUOTE_EMPTY");
    }
    quoteAnalyticsContext.productCount=quoteProducts.length;
    const productAnalyzeResult=await applyProductAnalysesIfAvailable(
      quoteProducts,
      productAnalyzeSettings,
      quoteRunContext,
      confirmedExtractResult,
      lineItems,
      anchor
    );
	  quoteProducts=productAnalyzeResult.products;
	    confirmedExtractResult.quote_products=quoteProducts;
	    const generatedFirstParamCount=quoteProducts.filter(product=>normalizeFirstHardwareParamValue(product && product.first_hardware_param)).length;
	    confirmedExtractResult.notes=dedupeTextArray([
	      ...normalizeTextArray(confirmedExtractResult.notes),
	      `第一阶段基础参数生成：${generatedFirstParamCount}/${quoteProducts.length} 个产品已生成。`
	    ]);
    if(productAnalyzeResult.notes.length){
      confirmedExtractResult.notes=dedupeTextArray([
        ...normalizeTextArray(confirmedExtractResult.notes),
        ...productAnalyzeResult.notes
      ]);
    }
    quoteRunContext.timings.productAnalyzeMs=productAnalyzeResult.elapsedMs;
    updateAiTaskProgress(1);
    const aggregatedResult={products:[],notes:normalizeTextArray(confirmedExtractResult.notes)};
    const selectTasks=[];
    for(let index=0;index<quoteProducts.length;index+=1){
      const quoteProduct=quoteProducts[index];
      const firstHardwareParam=normalizeFirstHardwareParamValue(quoteProduct && quoteProduct.first_hardware_param);
      if(!firstHardwareParam){
        aggregatedResult.notes.push(`【${toText(quoteProduct && quoteProduct.quote_product_name).trim() || `产品${index+1}`}】第一阶段未生成第一条基础参数，已跳过第二阶段选参`);
        aggregatedResult.products.push(makeParsedProductFromQuoteSource(quoteProduct,[]));
        continue;
      }
      const requestedTargetParamCount=Math.min(30,Math.max(1,Number(quoteProduct && quoteProduct.target_param_count) || Number(generationStrategy && generationStrategy.target_param_count) || 15));
      const selectTargetParamCount=Math.max(0,requestedTargetParamCount-1);
      if(selectTargetParamCount===0){
        aggregatedResult.products.push(makeParsedProductFromQuoteSource(quoteProduct,[]));
        continue;
      }
      const productStrategy={
        ...generationStrategy,
        target_param_count:selectTargetParamCount
      };
      const candidateCatalog=buildCandidateCatalogContext(confirmedExtractResult,quoteProduct,productStrategy);
      if(candidateCatalog.total_products===0 || candidateCatalog.total_params===0){
        aggregatedResult.notes.push(`【${toText(quoteProduct.quote_product_name).trim() || `产品${index+1}`}】本地未找到匹配的参数库产品或参数`);
        aggregatedResult.products.push(makeParsedProductFromQuoteSource(quoteProduct,[]));
        continue;
      }
      const expectedCatalogProduct=Array.isArray(candidateCatalog.products) ? candidateCatalog.products[0] : null;
      const quoteTaskId=makeFastGptChatId("quote-select",quoteRunContext,`p${index+1}`);
      const candidateCatalogText=formatCandidateCatalogForAi(candidateCatalog);
      const quoteAnalysisText=formatQuoteProductForSelectAi(quoteProduct,{
        quoteExportType:confirmedExtractResult.quote_export_type,
        quoteExportTypeLabel:confirmedExtractResult.quote_export_type_label
      });
      selectTasks.push({
        index,
        quoteProduct,
        expectedCatalogProduct,
        quoteTaskId,
        payload:buildQuoteSelectPayload(
          selectSettings,
          quoteAnalysisText,
          candidateCatalogText,
          productStrategy,
          {
            chatId:quoteTaskId,
            productRule:{
              quote_task_id:quoteTaskId,
              quote_product_name:toText(quoteProduct && quoteProduct.quote_product_name).trim(),
              database_product_name:[
                expectedCatalogProduct && expectedCatalogProduct.database_name,
                expectedCatalogProduct && expectedCatalogProduct.product_line,
                expectedCatalogProduct && expectedCatalogProduct.version
              ].filter(Boolean).join(" / ")
            }
          }
        )
	      });
	    }
    quoteAnalyticsContext.selectTaskCount=selectTasks.length;
    if(selectTasks.length>0){
      updateAiTaskProgress(2);
      const selectStartedAt=performance.now();
      const batchResults=await requestQuoteSelectWithProgress(selectSettings,selectTasks);
      quoteRunContext.timings.selectMs=performance.now()-selectStartedAt;
      batchResults.forEach(({task,result})=>{
        const productName=toText(task && task.quoteProduct && task.quoteProduct.quote_product_name).trim() || `产品${(task && task.index || 0)+1}`;
        const recoverableBaseParam=normalizeFirstHardwareParamValue(task && task.quoteProduct && task.quoteProduct.first_hardware_param);
	        if(!result || result.ok===false){
	          const reasonInfo=[
	            toText(result && result.error,"AI 调用失败"),
            result && result.reasonType ? `原因：${result.reasonType}` : "",
            result && result.status ? `状态码：${result.status}` : "",
            result && result.elapsedMs ? `耗时：${formatDurationMs(result.elapsedMs)}` : ""
	          ].filter(Boolean).join("，");
	          if(recoverableBaseParam){
	            console.warn("报价单参数选择失败，已保留第一条基础参数",{
	              product:productName,
	              reason:reasonInfo
	            });
	          }else{
	            aggregatedResult.notes.push(`【${productName}】参数选择失败：${reasonInfo}`);
	          }
	          aggregatedResult.products.push(makeParsedProductFromQuoteSource(task && task.quoteProduct,[]));
	          return;
	        }
	        const workflowError=getWorkflowNodeError(result.data);
	        if(workflowError){
	          if(recoverableBaseParam){
	            console.warn("报价单参数选择工作流失败，已保留第一条基础参数",{
	              product:productName,
	              reason:workflowError
	            });
	          }else{
	            aggregatedResult.notes.push(`【${productName}】参数选择失败：${workflowError}`);
	          }
	          aggregatedResult.products.push(makeParsedProductFromQuoteSource(task && task.quoteProduct,[]));
	          return;
	        }
	        try{
	          const parsed=normalizeQuoteParseResult(parseStructuredAiJsonResponse(
	            result.data,
	            createQuoteSelectResultValidator(task && task.expectedCatalogProduct,task && task.quoteTaskId)
	          ));
	          if(parsed.products.length){
	            parsed.products.forEach(product=>{
	              const stageFirstParam=normalizeFirstHardwareParamValue(task && task.quoteProduct && task.quoteProduct.first_hardware_param);
	              const fallbackName=toText(task && task.quoteProduct && task.quoteProduct.quote_product_name).trim()
	                || toText(task && task.quoteProduct && task.quoteProduct.product_model).trim()
	                || productName;
	              product.quote_product_name=toText(product && product.quote_product_name).trim() || fallbackName;
	              product.database_product_hint=toText(product && product.database_product_hint).trim()
	                || toText(task && task.quoteProduct && task.quoteProduct.database_product_hint).trim();
	              product.instance_name=toText(product && product.instance_name).trim() || fallbackName;
	              product._quote_source=task && task.quoteProduct ? task.quoteProduct : null;
	              product.product_analysis=task && task.quoteProduct ? task.quoteProduct.product_analysis : null;
	              product.first_hardware_param=stageFirstParam;
	              product.product_analysis_error=toText(task && task.quoteProduct && task.quoteProduct.product_analysis_error).trim();
	            });
	            aggregatedResult.products.push(...parsed.products);
	          }else{
	            aggregatedResult.products.push(makeParsedProductFromQuoteSource(task && task.quoteProduct,[]));
	          }
	          aggregatedResult.notes.push(...parsed.notes);
	        }catch(parseErr){
	          if(recoverableBaseParam){
	            console.warn("报价单参数选择结果解析失败，已保留第一条基础参数",{
	              product:productName,
	              reason:getQuoteParseErrorMessage(parseErr)
	            });
	          }else{
	            aggregatedResult.notes.push(`【${productName}】参数选择结果解析失败：${getQuoteParseErrorMessage(parseErr)}`);
	          }
	          aggregatedResult.products.push(makeParsedProductFromQuoteSource(task && task.quoteProduct,[]));
	        }
	      });
    }
    quoteRunContext.timings.totalAiMs=(Number(quoteRunContext.timings.extractMs) || 0) + (Number(quoteRunContext.timings.productAnalyzeMs) || 0) + (Number(quoteRunContext.timings.selectMs) || 0);
    quoteAnalyticsContext.aiDurationMs=quoteRunContext.timings.totalAiMs;
    aggregatedResult.notes.push(
      `本次 AI 耗时：产品识别 ${extractChatId==="local" ? "本地跳过" : formatDurationMs(quoteRunContext.timings.extractMs)}，单产品分析 ${productAnalyzeResult.used ? formatDurationMs(quoteRunContext.timings.productAnalyzeMs) : "未配置"}，选参 ${formatDurationMs(quoteRunContext.timings.selectMs)}，AI 合计 ${formatDurationMs(quoteRunContext.timings.totalAiMs)}；选参任务 ${selectTasks.length} 个。`
    );
    console.info("quote parse run finished",{
      fileName:file && file.name,
      fileHash:quoteRunContext.fileHash,
      extractChatId,
      selectChatIds:selectTasks.map(task=>task.payload && task.payload.chatId),
      timings:Object.fromEntries(Object.entries(quoteRunContext.timings).map(([key,value])=>[key,Math.round(Number(value) || 0)]))
    });
    if(aggregatedResult.products.length===0 && aggregatedResult.notes.length>0){
      throw new Error(aggregatedResult.notes.join("\n"));
    }
    const parsed=validateQuoteParseResultStructure(normalizeQuoteParseResult({
      products:aggregatedResult.products,
      notes:[...new Set(aggregatedResult.notes.filter(Boolean))]
    }));
    quoteAnalyticsContext.paramCount=parsed.products.reduce((sum,product)=>sum+(Array.isArray(product && product.selected_params) ? product.selected_params.length : 0),0);
    updateAiTaskProgress(3);
    const applied=await applyQuoteParseResultData(parsed,anchor);
    if(applied){
      sendAnalyticsEvent({
        type:"generate_params",
        status:"success",
        durationMs:performance.now()-quoteAnalyticsStartedAt,
        productCount:quoteAnalyticsContext.productCount,
        paramCount:quoteAnalyticsContext.paramCount,
        targetParamCount:quoteAnalyticsContext.selectTaskCount,
        aiDurationMs:quoteAnalyticsContext.aiDurationMs
      });
    }
  }catch(err){
    console.error(err);
    const message=getQuoteParseErrorMessage(err);
    if(state.quoteUploadModal){
      setQuoteUploadState("识别失败，请检查文件类型后重试。");
    }
    showToast(message,"error",anchor);
    if(quoteAnalyticsStartedAt){
      sendAnalyticsEvent({
        type:"generate_params",
        status:"failure",
        durationMs:performance.now()-quoteAnalyticsStartedAt,
        productCount:quoteAnalyticsContext.productCount,
        paramCount:quoteAnalyticsContext.paramCount,
        targetParamCount:quoteAnalyticsContext.selectTaskCount,
        errorCode:getErrorInfo(err).code || "GENERATE_FAILED"
      });
    }
  }finally{
    hideLoading();
  }
}

function getErrorInfo(error){
  const fallbackMessage=toText(error && error.message ? error.message : error);
  const info={
    message:fallbackMessage,
    code:toText(error && error.code).trim(),
    reasonType:toText(error && error.reasonType).trim(),
    status:Number(error && error.status) || 0
  };
  if(fallbackMessage.startsWith("{")){
    try{
      const parsed=JSON.parse(fallbackMessage);
      if(parsed && typeof parsed==="object"){
        info.message=toText(parsed.error || parsed.message || fallbackMessage);
        info.code=toText(parsed.code || info.code).trim();
        info.reasonType=toText(parsed.reasonType || info.reasonType).trim();
      }
    }catch(parseErr){
      // ignore parse error and use raw message
    }
  }
  info.message=getReadableAiClientErrorMessage(info.message,info.status);
  if(!info.code && (info.status===502 || info.status===503 || info.status===504)){
    info.code="AI_UPSTREAM_TIMEOUT";
    info.reasonType=info.reasonType || "timeout";
  }
  return info;
}

function getQuoteParseErrorMessage(error){
  const info=getErrorInfo(error);
  const message=info.message;
  if(info.code==="AI_DNS_FAILED") return "AI 域名解析失败，请确认 Windows 已登录公司零信任或内网 DNS 可用。";
  if(info.code==="AI_UPSTREAM_TIMEOUT") return message || "AI 接口等待时间较长仍未返回，FastGPT 供应商可能仍在后台生成，请稍后重试。";
  if(info.code==="AI_AUTH_FAILED") return "AI 接口鉴权失败，请检查 API Key 或权限。";
  if(info.reasonType==="config") return message || "AI 后端配置不完整，请检查配置文件。";
  if(message.startsWith("{")){
    try{
      const parsed=JSON.parse(message);
      if(parsed && parsed.error){
        return toText(parsed.error);
      }
    }catch(parseErr){
      // ignore parse error and fall through
    }
  }
  if(message.startsWith("QUOTE_UNSUPPORTED")) return "当前报价单格式暂不支持，请优先使用 Excel、CSV 或文本文件。";
  if(message.startsWith("QUOTE_EMPTY")) return "报价单内容为空，暂时无法解析。";
  if(message.startsWith("AI_SELECT_INVALID_STRUCTURE")) return "参数选择流返回结构不正确，请检查 selected_params 输出结构。";
  if(message.startsWith("FILE_READ")) return "报价单文件读取失败，请重新选择文件。";
  if(message.startsWith("AI_JSON_NOT_FOUND")) return "AI 返回结果里没有找到可用的 JSON。";
  if(message.startsWith("AI_EMPTY")) return "AI 没有返回有效内容。";
  if(message.startsWith("AI_CONFIG_MISSING")) return "后端 AI 流程配置缺失或未加载，请检查 server/ai-config.local.json。";
  if(message.startsWith("HTTP_REQUIRED")) return "请通过 http://127.0.0.1:7654/ 打开工具后再调用 AI。";
  if(message.includes("Failed to fetch")) return "本地 AI 转发服务未启动或网络不可用，请确认本地服务状态。";
  if(message.includes("参数选择失败") || message.includes("参数选择结果解析失败")) return message;
  if(message.startsWith("{") || message.startsWith("AI_PROXY_")) return "AI 接口调用失败，请检查接口地址、密钥或 FastGPT 返回内容。";
  return "报价单解析失败，请检查文件和接口设置。";
}

function getAiErrorMessage(error){
  const info=getErrorInfo(error);
  const message=info.message;
  if(info.code==="AI_DNS_FAILED") return "AI 域名解析失败，请确认 Windows 已登录公司零信任或内网 DNS 可用。";
  if(info.code==="AI_UPSTREAM_TIMEOUT") return message || "AI 接口等待时间较长仍未返回，FastGPT 供应商可能仍在后台生成，请稍后重试。";
  if(info.code==="AI_AUTH_FAILED") return "AI 接口鉴权失败，请检查 API Key 或权限。";
  if(info.code==="AI_RATE_LIMITED") return "AI 接口限流，请稍后重试。";
  if(info.reasonType==="network") return message || "AI 网络连接失败，请检查内网连接。";
  if(info.reasonType==="config") return message || "AI 后端配置不完整，请检查配置文件。";
  if(message.startsWith("{")){
    try{
      const parsed=JSON.parse(message);
      if(parsed && parsed.error){
        return toText(parsed.error);
      }
    }catch(parseErr){
      // ignore parse error and fall through
    }
  }
  if(message.startsWith("AI_JSON_NOT_FOUND")) return "AI 返回结果格式不正确，请检查 FastGPT 输出。";
  if(message.startsWith("AI_EMPTY")) return "AI 没有返回有效内容。";
  if(message.startsWith("AI_CONFIG_MISSING")) return "后端 AI 流程配置缺失或未加载，请检查 server/ai-config.local.json。";
  if(message.startsWith("HTTP_REQUIRED")) return "请通过 http://127.0.0.1:7654/ 打开工具后再调用 AI。";
  if(message.includes("Failed to fetch")) return "本地 AI 转发服务未启动或网络不可用，请确认本地服务状态。";
  if(message.startsWith("{") || message.startsWith("AI_PROXY_")) return "AI 接口调用失败，请检查接口地址、密钥或 FastGPT 返回内容。";
  return "AI 调用失败，请检查接口设置。";
}

function normalizeMatchText(value){
  return toText(value).toLowerCase().replace(/\s+/g,"").replace(/[（）()\-_/]/g,"");
}

function buildProductMatchScore(product,item){
  const hints=[
    toText(item.database_product_hint).trim(),
    toText(item.quote_product_name).trim(),
    toText(item.sheet_name).trim(),
    toText(item.database_name).trim()
  ].filter(Boolean);
  const normalizedNames=[
    normalizeMatchText(product.sheetName),
    normalizeMatchText(product.name),
    normalizeMatchText(product.productLine),
    normalizeMatchText(product.version),
    normalizeMatchText(product.category)
  ];
  let score=0;
  hints.forEach(hint=>{
    const normalizedHint=normalizeMatchText(hint);
    if(!normalizedHint) return;
    if(normalizedHint===normalizeMatchText(product.sheetName)) score+=120;
    if(normalizedHint===normalizeMatchText(product.name)) score+=100;
    if(normalizedHint===normalizeMatchText(product.productLine)) score+=75;
    if(normalizedHint===normalizeMatchText(product.version)) score+=45;
    if(normalizedHint===normalizeMatchText(product.category)) score+=20;
    normalizedNames.forEach(name=>{
      if(!name) return;
      if(name.includes(normalizedHint) || normalizedHint.includes(name)){
        score+=18;
      }
    });
  });
  return score;
}

function matchProductForParsedItem(item){
  const quoteSource=item && item._quote_source ? item._quote_source : item;
  const templateMatched=getBestDatabaseProductForQuoteProduct(quoteSource,{global_keywords:normalizeTextArray(quoteSource && quoteSource.keywords)});
  if(templateMatched) return templateMatched;
  let bestProduct=null;
  let bestScore=0;
  state.products.forEach(product=>{
    const score=buildProductMatchScore(product,item);
    if(score>bestScore){
      bestScore=score;
      bestProduct=product;
    }
  });
  return bestScore>=30 ? bestProduct : null;
}

function matchProductForParsedSelection(item){
  const specs=Array.isArray(item && item.selected_params) ? item.selected_params : [];
  const counts=new Map();
  specs.forEach(spec=>{
    const rawParamId=spec && (
      spec.database_param_id ??
      spec.param_id ??
      spec.id
    );
    const numericParamId=Number(rawParamId);
    if(!Number.isFinite(numericParamId)) return;
    const matchedParam=state.parameters.find(param=>Number(param.id)===numericParamId);
    if(!matchedParam || matchedParam.product_id===undefined || matchedParam.product_id===null) return;
    const productId=matchedParam.product_id;
    counts.set(productId,(counts.get(productId) || 0)+1);
  });
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  if(!ranked.length) return null;
  const productId=ranked[0][0];
  return state.products.find(product=>String(product.id)===String(productId)) || null;
}

function matchParameterForParsedItem(productId,paramSpec){
  const params=getParamsByProductId(productId);
  const rawParamId=paramSpec && (
    paramSpec.database_param_id ??
    paramSpec.param_id ??
    paramSpec.id
  );
  const numericParamId=Number(rawParamId);
  if(Number.isFinite(numericParamId)){
    const byId=params.find(param=>Number(param.id)===numericParamId);
    if(byId) return byId;
  }

  const targetTitle=normalizeMatchText(paramSpec && paramSpec.title);
  if(!targetTitle) return null;
  const exact=params.filter(param=>normalizeMatchText(param.title)===targetTitle);
  if(exact.length===1) return exact[0];
  if(exact.length>1){
    const hint=normalizeMatchText(paramSpec.template_contains);
    if(hint){
      const hinted=exact.find(param=>normalizeMatchText(param.content).includes(hint) || normalizeMatchText(param.remark).includes(hint));
      if(hinted) return hinted;
    }
    return exact[0];
  }
  return params.find(param=>normalizeMatchText(param.title).includes(targetTitle) || targetTitle.includes(normalizeMatchText(param.title))) || null;
}

function applyParsedEditsToContent(baseContent,paramSpec){
  const finalContent=toText(paramSpec && paramSpec.final_content).trim();
  if(finalContent) return finalContent;
  return toText(baseContent);
}

function stripLeadingParamMarker(rawText){
  let text=toText(rawText).trimStart();
  let previous="";
  while(text && text!==previous){
    previous=text;
    text=text
      .replace(/^[★☆▲△◆■●▪•·]+[\s\u3000]*/u,"")
      .replace(/^(?:\d+[.、．]|[（(]\d+[)）])[\s\u3000]*/u,"")
      .trimStart();
  }
  return text;
}

function normalizeParamContentValue(rawText){
  return stripLeadingParamMarker(rawText).trim();
}

function normalizeFirstHardwareParamValue(rawText){
  const original=normalizeParamContentValue(rawText);
  if(!original) return "";
  const clauses=original
    .split(/([，,；;。])/)
    .reduce((items,part,index,array)=>{
      if(index % 2===0){
        const separator=index+1<array.length ? array[index+1] : "";
        const text=part.trim();
        if(text){
          items.push({text,separator});
        }
      }
      return items;
    },[]);
  const hasSoftwareNameClause=clause=>{
    const text=toText(clause).trim();
    if(!/(软件|模块|订阅)/.test(text)) return false;
    if(/(吞吐|并发|新建连接|连接数|用户数|授权数|容量|日志量|资产数|节点数|会话数|带宽|性能)\s*[≥>=不小于至少]/.test(text)) return false;
    return /(包含|含|内置|预装|集成|提供|支持|订阅|软件|模块|V\d|V\d+\.\d+)/i.test(text);
  };
  const kept=clauses.filter(item=>!hasSoftwareNameClause(item.text));
  if(kept.length===0 || kept.length===clauses.length) return original;
  const normalized=kept.map((item,index)=>{
    const separator=index===kept.length-1 ? "" : (item.separator && item.separator!=="。" ? item.separator : "，");
    return `${item.text}${separator}`;
  }).join("").replace(/[，,；;]+$/,"");
  return normalized ? `${normalized}${/[。.!！?？]$/.test(normalized) ? "" : "。"}` : original;
}

function getPrefixedParamContent(param){
  const content=normalizeParamContentValue(param && param.content);
  const prefix=toText(param && param.prefix_symbol).trim();
  return prefix ? `${prefix}${content}` : content;
}

function resetSelectionStateOnly(){
  state.instances=[];
  state.activeInstanceId=null;
  state.lastActiveInstanceByProduct={};
  state.instanceSeed=1;
  state.currentProductId=null;
  state.currentParams=[];
  state.selected=[];
  state.editedContentByParamId={};
  document.querySelectorAll(".product").forEach(item=>item.classList.remove("active"));
}

function createGeneratedBaseParam(product,content){
  const productId=product && product.id!==undefined ? product.id : "unknown";
  const customId=`custom_ai_base_${productId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  return {
    id:customId,
    title:"基础参数",
    content:normalizeParamContentValue(content),
    prefix_symbol:"",
    type:"",
    is_star:"",
    image_proof:"",
    qualification_proof:"",
    remark:"",
    product_id:productId,
    instance_id:"",
    isCustom:true
  };
}

function validateGeneratedBaseParam(content){
  const text=normalizeParamContentValue(content);
  const issues=[];
  if(!text){
    issues.push("基础参数为空");
  }
  if(/[【】]/.test(text) || /(?:^|[^\w])(?:xx|XX)(?:[^\w]|$)/.test(text) || /x口/i.test(text)){
    issues.push("基础参数仍包含占位符");
  }
  if(/单电源的话不写电源|没有选配不加|普通和尊享取最大|内部外部取最大|维护说明/.test(text)){
    issues.push("基础参数仍包含模板维护说明");
  }
  const allowedPorts=["百兆电口","千兆电口","千兆光口","万兆光口","25G光口","40G光口","100G光口"];
  const withoutAllowedPorts=allowedPorts.reduce((value,term)=>value.replaceAll(term,""),text);
  if(/(?:\b(?:\d{1,3}G(?:E)?|百兆|千兆|万兆|25G|40G|100G)?(?:电口|光口|网口)\b|10\/100\/1000Base-T|10\/100Base-T|10GBase-T|1000Base-T|RJ45|SFP\+?|Base-T|x口)/i.test(withoutAllowedPorts)){
    issues.push("基础参数存在非标准网口表述");
  }
  return {
    ok:issues.length===0,
    issues
  };
}

function sanitizeGeneratedBaseParam(content,quoteItem=null){
  let text=normalizeParamContentValue(content);
  if(!text) return "";
  text=text
    .replace(/[（(](?:单电源的话不写电源|没有选配不加这一项|普通和尊享取最大的|内部外部取最大|维护说明)[)）]/g,"")
    .replace(/(?:^|[，,；;\s])单电源(?:$|[，,；;\s])/g,"，")
    .replace(/(?:^|[，,；;\s])单电源的话不写电源(?:$|[，,；;\s])/g,"，")
    .replace(/\b10\/100\/1000Base-T\b/gi,"千兆电口")
    .replace(/\b10\/100Base-T\b/gi,"百兆电口")
    .replace(/\b1000Base-T\b/gi,"千兆电口")
    .replace(/SFP\+/gi,"万兆光口")
    .replace(/\b10GE\b/gi,"万兆光口")
    .replace(/\b10G(?:光口)?\b/gi,"万兆光口")
    .replace(/SFP(?!\+)/gi,"千兆光口");
  text=text
    .replace(/HTTP新建连接数/g,"每秒新建连接数")
    .replace(/DDR代际/g,"")
    .replace(/如发生部件变动以实际装配为准/g,"")
    .replace(/标准网口[：:]?\s*(\d+)\s*[*xX]\s*(百兆电口|千兆电口|千兆光口|万兆光口|25G光口|40G光口|100G光口)/g,"标准网口$2≥$1个")
    .replace(/[，,；;]{2,}/g,"；")
    .replace(/\s{2,}/g," ")
    .replace(/^[，,；;\s]+|[，,；;\s]+$/g,"")
    .replace(/；{2,}/g,"；")
    .replace(/，{2,}/g,"，");
  return text;
}

function escapeLocalRegex(value){
  return toText(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function getAppliedQuoteSource(quoteItem){
  const source=quoteItem && quoteItem._quote_source && typeof quoteItem._quote_source==="object"
    ? quoteItem._quote_source
    : {};
  const merged={...quoteItem,...source};
  [
    "product_line_hints",
    "version_hints",
    "modules",
    "hardware",
    "performance",
    "services",
    "conditional_or_max_capabilities",
    "optional_items",
    "excluded_or_absent",
    "keywords",
    "evidence"
  ].forEach(field=>{
    merged[field]=dedupeTextArray([
      ...normalizeTextArray(source[field]),
      ...normalizeTextArray(quoteItem && quoteItem[field])
    ]);
  });
	  return {
	    ...merged,
	    quote_product_name:toText(source.quote_product_name).trim() || toText(quoteItem && quoteItem.quote_product_name).trim(),
	    quantity:toText(source.quantity).trim() || toText(quoteItem && quoteItem.quantity).trim(),
	    unit:toText(source.unit).trim() || toText(quoteItem && quoteItem.unit).trim(),
	    description:toText(source.description).trim() || toText(quoteItem && quoteItem.description).trim(),
    first_hardware_param:normalizeFirstHardwareParamValue(
      source && source.first_hardware_param
      || quoteItem && quoteItem.first_hardware_param
    )
  };
}

function hasStandardOpeningTemplate(quoteItem){
  return false;
}

function getQuoteSourceText(quoteItem,buckets=null){
  const fields=buckets || [
    "quote_product_name",
	    "database_product_hint",
	    "quantity",
	    "unit",
	    "description",
	    "product_line_hints",
    "version_hints",
    "modules",
    "hardware",
    "performance",
    "services",
    "conditional_or_max_capabilities",
    "optional_items",
    "excluded_or_absent",
    "keywords",
    "evidence"
  ];
  return fields.flatMap(field=>normalizeTextArray(quoteItem && quoteItem[field])).join("；");
}

function getQuoteComponents(quoteItem){
  return Array.isArray(quoteItem && quoteItem.components) ? quoteItem.components : [];
}

function getQuoteModelText(quoteItem){
  return [
    quoteItem && quoteItem.quote_product_name,
    quoteItem && quoteItem.database_product_hint,
    quoteItem && quoteItem.version_hints,
    quoteItem && quoteItem.evidence
  ].flat().map(toText).join(" ");
}

function getInterpretedHardware(quoteItem){
  const interpretation=quoteItem && quoteItem.component_interpretation;
  return interpretation && interpretation.final_hardware_per_device && typeof interpretation.final_hardware_per_device==="object"
    ? interpretation.final_hardware_per_device
    : {};
}

function getComponentQuantityByPattern(quoteItem,pattern,options={}){
  const regex=pattern instanceof RegExp ? pattern : new RegExp(toText(pattern),"i");
  const component=getQuoteComponents(quoteItem).find(item=>regex.test(toText(item && item.name)) || regex.test(toText(item && item.source_text)));
  if(!component) return "";
  if(options.preferPerDevice && component.per_device_quantity!==undefined && component.per_device_quantity!==null){
    return toText(component.per_device_quantity).trim();
  }
  return toText(component.raw_quantity).trim();
}

function splitFactSegments(text){
  return toText(text)
    .replace(/\r/g,"\n")
    .split(/[；;\n，,。]+/)
    .map(item=>item.trim())
    .filter(Boolean);
}

function findFactSegment(quoteItem,labels,buckets=null){
  const labelList=Array.isArray(labels) ? labels : [labels];
  const segments=splitFactSegments(getQuoteSourceText(quoteItem,buckets));
  return segments.find(segment=>labelList.some(label=>toText(segment).includes(label))) || "";
}

function extractFactValue(quoteItem,labels,buckets=null){
  const sourceText=[
    getQuoteSourceText(quoteItem,buckets),
    toText(quoteItem && quoteItem.description)
  ].filter(Boolean).join("；");
  const labelList=Array.isArray(labels) ? labels : [labels];
  const labelPattern=labelList.map(escapeLocalRegex).join("|");
  const directMatch=sourceText.match(new RegExp(`(?:${labelPattern})(?:[（(][^）)]*[）)])?[^：:；;，,。\\n]{0,24}[：:]\\s*([^；;，,。\\n]+)`,"i"));
  if(directMatch){
    return toText(directMatch[1])
      .replace(/[。；;，,]+$/,"")
      .replace(/（单独购买）|\(单独购买\)|（需单独收费）|\(需单独收费\)/g,"")
      .trim();
  }
  const segment=findFactSegment(quoteItem,labels,buckets);
  if(!segment) return "";
  const colonMatch=segment.match(new RegExp(`(?:${labelPattern})[^：:]*[：:]\\s*([^；;，,。]+)`));
  const raw=colonMatch ? colonMatch[1] : segment.replace(new RegExp(`.*(?:${labelPattern})[^\\dA-Za-z一-龥]*`),"");
  return toText(raw)
    .replace(/[。；;，,]+$/,"")
    .replace(/（单独购买）|\(单独购买\)|（需单独收费）|\(需单独收费\)/g,"")
    .trim();
}

function extractFirstNumber(value){
  const match=toText(value).match(/\d+(?:\.\d+)?/);
  return match ? match[0] : "";
}

function normalizeCapacityUnit(value,defaultUnit=""){
  const text=toText(value).trim();
  const match=text.match(/(\d+(?:\.\d+)?)\s*(TB|T|GB|G|MB|M)?/i);
  if(!match) return "";
  const unit=(match[2] || defaultUnit).toUpperCase();
  if(unit==="T") return `${match[1]}TB`;
  if(unit==="G") return `${match[1]}GB`;
  if(unit==="M") return `${match[1]}MB`;
  return unit ? `${match[1]}${unit}` : match[1];
}

function normalizePortTerm(rawTerm,context=""){
  const source=`${rawTerm} ${context}`;
  if(/100G/i.test(source)) return "100G光口";
  if(/40G/i.test(source)) return "40G光口";
  if(/25G/i.test(source)) return "25G光口";
  if(/SFP\+|万兆|10G|10GE/i.test(source)) return /电口|Base-T/i.test(source) && !/光口|SFP/i.test(source) ? "万兆光口" : "万兆光口";
  if(/SFP|千兆光|1000Base-X/i.test(source)) return "千兆光口";
  if(/百兆|10\/100(?!\/1000)/i.test(source)) return "百兆电口";
  if(/千兆|10\/100\/1000|1000Base-T|GE|电口/i.test(source)) return "千兆电口";
  return "";
}

function extractStandardPorts(quoteItem){
  const interpreted=getInterpretedHardware(quoteItem);
  const interpretedPorts=interpreted.ports || interpreted.final_ports_per_device || interpreted.port_counts;
  if(interpretedPorts && typeof interpretedPorts==="object"){
    const portMap=[
      ["百兆电口",interpretedPorts.fe_copper || interpretedPorts.fast_copper || interpretedPorts["百兆电口"]],
      ["千兆电口",interpretedPorts.ge_copper || interpretedPorts.gigabit_copper || interpretedPorts["千兆电口"]],
      ["千兆光口",interpretedPorts.ge_fiber || interpretedPorts.gigabit_fiber || interpretedPorts["千兆光口"]],
      ["万兆光口",interpretedPorts.ten_g_fiber || interpretedPorts["10g_fiber"] || interpretedPorts["万兆光口"]],
      ["25G光口",interpretedPorts["25g_fiber"] || interpretedPorts["25G光口"]],
      ["40G光口",interpretedPorts["40g_fiber"] || interpretedPorts["40G光口"]],
      ["100G光口",interpretedPorts["100g_fiber"] || interpretedPorts["100G光口"]]
    ];
    const text=portMap
      .map(([term,value])=>[term,Number(value)])
      .filter(([,value])=>Number.isFinite(value) && value>0)
      .map(([term,value])=>`${term}≥${value}个`)
      .join("、");
    if(text) return text;
  }
  const switchInfo=extractSwitchInfo(quoteItem);
  if(switchInfo.standardPorts) return switchInfo.standardPorts;
  const counts=new Map();
	  const addPort=(term,count)=>{
	    const normalized=normalizePortTerm(term);
	    const numeric=Number(count);
	    if(!normalized || !Number.isFinite(numeric) || numeric<=0) return;
	    counts.set(normalized,Math.max(counts.get(normalized) || 0,numeric));
	  };
  const text=getQuoteSourceText(quoteItem,["hardware","evidence"])
    .replace(/\b10\/100\/1000Base-T\b/gi,"千兆电口")
    .replace(/\b10\/100Base-T\b/gi,"百兆电口")
    .replace(/\b1000Base-T\b/gi,"千兆电口")
    .replace(/SFP\+/gi,"万兆光口")
    .replace(/SFP(?!\+)/gi,"千兆光口");
  let match;
  const portRegex=/(\d+(?:\.\d+)?)\s*(?:个|口|路|条)?\s*(百兆电口|千兆电口|千兆光口|万兆光口|25G光口|40G光口|100G光口|百兆(?:电口)?|千兆(?:电口|光口)|万兆(?:电口|光口)|25G光口|40G光口|100G光口)/gi;
  while((match=portRegex.exec(text))){
    const around=text.slice(Math.max(0,match.index-12),match.index+match[0].length+12);
    if(/光纤线|多模|单模|模块|光模块|双纤|线缆|硬盘|数据盘|系统盘|缓存盘|SATA|SSD/.test(around)) continue;
    addPort(match[2],match[1]);
  }
  const bareRegex=/(\d+(?:\.\d+)?)\s*(?:个|口)?\s*(SFP\+?|10\/100\/1000Base-T|1000Base-T|10\/100Base-T)/gi;
  while((match=bareRegex.exec(getQuoteSourceText(quoteItem,["hardware","evidence"])))){
    const around=text.slice(Math.max(0,match.index-12),match.index+match[0].length+12);
    if(/光纤线|多模|单模|模块|光模块|双纤|线缆|硬盘|数据盘|系统盘|缓存盘|SATA|SSD/.test(around)) continue;
    addPort(normalizePortTerm(match[2]),match[1]);
  }
  const compactPortMatch=getQuoteSourceText(quoteItem,["hardware","evidence"]).match(/(\d+)\s*电\s*(\d+)\s*光\s*(\d+)\s*万兆光/);
  if(compactPortMatch){
    addPort("千兆电口",compactPortMatch[1]);
    addPort("千兆光口",compactPortMatch[2]);
    addPort("万兆光口",compactPortMatch[3]);
  }
  const order=["百兆电口","千兆电口","千兆光口","万兆光口","25G光口","40G光口","100G光口"];
  return order
    .filter(term=>(counts.get(term) || 0)>0)
    .map(term=>`${term}≥${counts.get(term)}个`)
    .join("、");
}

function extractSwitchInfo(quoteItem){
  const model=getQuoteModelText(quoteItem);
  const exact=[
    {
      pattern:/aRS6300-24X-LI-12X/i,
      standardPorts:"千兆电口≥12个、万兆光口≥12个",
      exchangeCapacity:"2.4Tbps",
      packetRate:"780Mpps"
    },
    {
      pattern:/aRS5300-28T-4F/i,
      standardPorts:"千兆电口≥24个、万兆光口≥4个",
      exchangeCapacity:"672Gbps",
      packetRate:"171Mpps"
    }
  ].find(item=>item.pattern.test(model));
  if(exact) return exact;
  const match=model.match(/aRS\d+-(\d+)T-(\d+)F/i);
  if(match){
    return {
      standardPorts:`千兆电口≥${match[1]}个、万兆光口≥${match[2]}个`,
      exchangeCapacity:"",
      packetRate:""
    };
  }
  return {standardPorts:"",exchangeCapacity:"",packetRate:""};
}

function hasRedundantPower(quoteItem){
  const text=getQuoteSourceText(quoteItem,["hardware","evidence"]);
  return /(冗余电源|双电源|白金，?冗余|1\+1电源|双路电源)/.test(text);
}

function extractDeviceHeight(quoteItem){
  const segment=findFactSegment(quoteItem,["规格","标准"],["hardware","evidence"]);
  const match=segment.match(/(\d+(?:\.\d+)?)\s*U/i) || getQuoteSourceText(quoteItem,["hardware","evidence"]).match(/(\d+(?:\.\d+)?)\s*U/i);
  return match ? match[1] : "";
}

function extractCpuInfo(quoteItem){
  const text=getQuoteSourceText(quoteItem,["hardware","evidence"]);
  const segment=findFactSegment(quoteItem,["CPU","处理器"],["hardware","evidence"]) || text;
  const count=(segment.match(/(\d+)\s*颗/) || [])[1] || "";
  const core=(segment.match(/(\d+)\s*C\b/i) || segment.match(/(\d+)\s*核/) || [])[1] || "";
  const frequency=(segment.match(/(\d+(?:\.\d+)?)\s*GHz/i) || [])[1] || "";
  let architecture="";
  if(/Hygon|海光|C86/i.test(segment)) architecture="C86";
  if(/Kunpeng|鲲鹏|ARM/i.test(segment)) architecture="ARM";
  return {count,core,frequency,architecture};
}

function extractMemoryInfo(quoteItem){
  const interpreted=getInterpretedHardware(quoteItem);
  if(interpreted.memory_modules || interpreted.memory_module_count || interpreted.memory_module_capacity_gb){
    return {
      count:toText(interpreted.memory_modules || interpreted.memory_module_count).trim(),
      capacity:toText(interpreted.memory_module_capacity_gb || interpreted.memory_capacity_per_module_gb).trim(),
      ddr:toText(interpreted.memory_ddr_generation || interpreted.memory_generation).replace(/^DDR/i,"").trim(),
      simpleCapacity:toText(interpreted.memory_total_gb).trim()
    };
  }
  const text=getQuoteSourceText(quoteItem,["hardware","evidence"]);
  let count=0;
  let capacity="";
  let ddr="";
  const base=text.match(/内存[：:]\s*(\d+)\s*[*xX]\s*(\d+)\s*GB?\s*DDR\s*(\d+)/i);
  if(base){
    count+=Number(base[1]) || 0;
    capacity=base[2];
    ddr=base[3];
  }
	  const componentRegex=/每台\s*(\d+)\s*条[^；;，,。]*?(\d+)\s*G(?:B)?[^；;，,。]*?DDR\s*(\d+)/gi;
	  let match;
	  while((match=componentRegex.exec(text))){
	    count+=Number(match[1]) || 0;
	    capacity=capacity || match[2];
	    ddr=ddr || match[3];
	  }
	  getQuoteComponents(quoteItem).forEach(component=>{
	    const componentText=[component && component.name,component && component.source_text].map(toText).join(" ");
	    if(!/(内存|DDR)/i.test(componentText)) return;
	    const perDevice=Number(component && component.per_device_quantity);
	    if(Number.isFinite(perDevice) && perDevice>0){
	      count+=perDevice;
	    }
	    const capacityMatch=componentText.match(/(\d+(?:\.\d+)?)\s*G(?:B)?/i);
	    const ddrMatch=componentText.match(/DDR\s*(\d+)/i);
	    capacity=capacity || (capacityMatch ? capacityMatch[1] : "");
	    ddr=ddr || (ddrMatch ? ddrMatch[1] : "");
	  });
	  const simple=text.match(/内存[：:]\s*(\d+)\s*GB/i);
  return {
    count:count ? String(count) : "",
    capacity:capacity || (simple ? simple[1] : ""),
    ddr,
    simpleCapacity:simple ? simple[1] : ""
  };
}

function extractDiskInfo(quoteItem){
  const interpreted=getInterpretedHardware(quoteItem);
  if(Object.keys(interpreted).length){
    const systemCount=toText(interpreted.system_disk_count || interpreted.system_disks).trim();
    const systemCapacity=toText(interpreted.system_disk_capacity || interpreted.system_disk_capacity_gb || interpreted.system_disk_capacity_tb).trim();
    const cacheCount=toText(interpreted.cache_disk_count || interpreted.cache_disks).trim();
    const cacheCapacity=toText(interpreted.cache_disk_capacity || interpreted.cache_disk_capacity_gb || interpreted.cache_disk_capacity_tb).trim();
    const dataCount=toText(interpreted.data_disk_count || interpreted.data_disks).trim();
    const dataCapacity=toText(interpreted.data_disk_capacity || interpreted.data_disk_capacity_tb || interpreted.data_disk_capacity_gb).trim();
    if(systemCount || cacheCount || dataCount){
      return {
        systemCount,
        systemCapacity:systemCapacity ? normalizeCapacityUnit(systemCapacity) : "",
        cacheCount,
        cacheCapacity:cacheCapacity ? normalizeCapacityUnit(cacheCapacity) : "",
        dataCount,
        dataCapacity:dataCapacity ? normalizeCapacityUnit(dataCapacity).replace(/TB$/i,"").replace(/GB$/i,"") : ""
      };
    }
  }
	  const text=getQuoteSourceText(quoteItem,["hardware","evidence"]);
	  const system=(text.match(/系统盘[：:]\s*(\d+)\s*[*xX]\s*(\d+(?:\.\d+)?)\s*(TB|T|GB|G)?[^；;，,。]*SSD/i) || []);
	  const cache=(text.match(/每台\s*(\d+)\s*个[^；;，,。]*(?:固态|SSD)[^；;，,。]*?(\d+(?:\.\d+)?)\s*(TB|T|GB|G)/i) || []);
	  let data=text.match(/每台\s*(\d+)\s*个[^；;，,。]*(?:机械硬盘|数据盘)[^；;，,。]*?(\d+(?:\.\d+)?)\s*(TB|T|GB|G)/i) || [];
	  const backupData=text.match(/服务器机械硬盘\s*\d+\s*T[（(]\s*(\d+)\s*[*xX]\s*(\d+(?:\.\d+)?)\s*T\s*[）)]/i) || [];
	  if(backupData.length){
	    data=["",backupData[1],backupData[2],"T"];
	  }
	  let componentCacheCount="";
	  let componentCacheCapacity="";
	  let componentDataCount="";
	  let componentDataCapacity="";
	  getQuoteComponents(quoteItem).forEach(component=>{
	    const componentText=[component && component.name,component && component.source_text].map(toText).join(" ");
	    const perDevice=Number(component && component.per_device_quantity);
	    if(!Number.isFinite(perDevice) || perDevice<=0) return;
	    const capacityMatch=componentText.match(/(\d+(?:\.\d+)?)\s*(TB|T|GB|G)/i);
	    if(/机械硬盘|数据盘/i.test(componentText) && capacityMatch){
	      componentDataCount=String((Number(componentDataCount) || 0)+perDevice);
	      componentDataCapacity=normalizeCapacityUnit(`${capacityMatch[1]}${capacityMatch[2] || "TB"}`).replace(/TB$/i,"").replace(/GB$/i,"");
	      return;
	    }
	    if(/固态|SSD|缓存盘/i.test(componentText) && !/系统盘/i.test(componentText) && capacityMatch){
	      componentCacheCount=String((Number(componentCacheCount) || 0)+perDevice);
	      componentCacheCapacity=normalizeCapacityUnit(`${capacityMatch[1]}${capacityMatch[2] || "GB"}`);
	    }
	  });
	  return {
	    systemCount:system[1] || "",
	    systemCapacity:system[2] ? normalizeCapacityUnit(`${system[2]}${system[3] || "GB"}`) : "",
	    cacheCount:componentCacheCount || cache[1] || "",
	    cacheCapacity:componentCacheCapacity || (cache[2] ? normalizeCapacityUnit(`${cache[2]}${cache[3] || "GB"}`) : ""),
	    dataCount:componentDataCount || data[1] || "",
	    dataCapacity:componentDataCapacity || (data[2] ? normalizeCapacityUnit(`${data[2]}${data[3] || "TB"}`).replace(/TB$/i,"").replace(/GB$/i,"") : "")
	  };
	}

function extractServiceYears(quoteItem){
  const text=getQuoteSourceText(quoteItem,["services","modules","evidence"]);
  const matches=[...text.matchAll(/(\d+(?:\.\d+)?)\s*年/g)].map(match=>Number(match[1])).filter(Number.isFinite);
  return matches.length ? String(Math.max(...matches)) : "";
}

function extractAuthorizationCount(quoteItem,pattern){
  const regex=pattern instanceof RegExp ? pattern : new RegExp(pattern,"i");
  const component=getQuoteComponents(quoteItem).find(item=>regex.test(toText(item && item.name)) || regex.test(toText(item && item.source_text)));
  if(component && component.raw_quantity!==undefined && component.raw_quantity!==null){
    return toText(component.raw_quantity).trim();
  }
  const text=getQuoteSourceText(quoteItem,["modules","services","evidence","performance"]);
  const segment=splitFactSegments(text).find(item=>regex.test(item)) || "";
  const quantityMatch=segment.match(/数量\s*(\d+(?:\.\d+)?)\s*(?:套|个|点|用户)?/i)
    || segment.match(/(\d+(?:\.\d+)?)\s*(?:套|个|点|用户)\s*[*×xX]?/i);
  if(quantityMatch) return quantityMatch[1];
  const match=segment.match(/(\d+(?:\.\d+)?)/);
  return match ? match[1] : "";
}

function buildOpeningVariables(quoteItem){
  const cpu=extractCpuInfo(quoteItem);
  const memory=extractMemoryInfo(quoteItem);
  const disks=extractDiskInfo(quoteItem);
  const switchInfo=extractSwitchInfo(quoteItem);
  const hardwareText=getQuoteSourceText(quoteItem,["hardware","evidence","modules"]);
  const storageCapacity=extractFactValue(quoteItem,["存储容量"],["performance","evidence"])
    || normalizeCapacityUnit(extractFactValue(quoteItem,["硬盘容量"],["hardware","evidence"]));
  const variables={
    "标准网口列表":extractStandardPorts(quoteItem),
    "设备高度":extractDeviceHeight(quoteItem),
    "硬盘容量":extractFactValue(quoteItem,["硬盘容量"],["hardware","evidence"]),
    "网络层吞吐量":extractFactValue(quoteItem,["网络层吞吐量"],["performance","hardware","evidence"]),
    "应用层吞吐量":extractFactValue(quoteItem,["应用层吞吐量"],["performance","hardware","evidence"]),
    "带宽性能":extractFactValue(quoteItem,["带宽性能"],["performance","evidence"]),
    "支持用户数":extractFactValue(quoteItem,["支持用户数"],["performance","evidence"]),
	    "终端准入用户数":/(准入|终端).*?(购买|已购|授权|包含)/.test(getQuoteSourceText(quoteItem,["modules","optional_items"]))
	      ? extractFactValue(quoteItem,["准入终端数","终端准入用户数"],["performance","conditional_or_max_capabilities","evidence"])
	      : "",
    "并发连接数":extractFactValue(quoteItem,["并发连接数"],["performance","evidence"]),
    "最大并发连接数":extractFactValue(quoteItem,["最大并发连接数","并发连接数"],["performance","evidence"]),
    "每秒新建连接数":extractFactValue(quoteItem,["HTTP新建连接数","每秒新建连接数","新建连接数"],["performance","evidence"]),
    "日志接入授权":extractFactValue(quoteItem,["默认包含主机审计许可证书数量","主机审计许可证书数量","日志接入授权"],["performance","evidence"]),
    "最大可扩展授权":extractFactValue(quoteItem,["最大可扩展审计主机许可数","最大可扩展至"],["performance","conditional_or_max_capabilities","evidence"]),
    "每秒处理日志数":extractFactValue(quoteItem,["平均每秒处理日志数","每秒处理日志数","eps"],["performance","evidence"]),
    "PC授权数量":extractAuthorizationCount(quoteItem,"PC全量版|PC客户端"),
    "服务器授权数量":extractAuthorizationCount(quoteItem,"服务器全量版|服务器端"),
    "VDI授权数量":extractAuthorizationCount(quoteItem,"VDI接入授权|并发用户连接授权"),
    "交换容量":switchInfo.exchangeCapacity || extractFactValue(quoteItem,["交换容量"],["performance","hardware","evidence"]),
    "包转发率":switchInfo.packetRate || extractFactValue(quoteItem,["包转发率"],["performance","hardware","evidence"]),
    "加密流量":extractFactValue(quoteItem,["加密流量"],["performance","evidence"]),
    "并发用户数":extractFactValue(quoteItem,["并发用户数"],["performance","evidence"]),
    "新建连接数":extractFactValue(quoteItem,["新建连接数"],["performance","evidence"]),
    "最大并发用户数":extractFactValue(quoteItem,["最大并发用户数","并发用户数"],["performance","evidence"]),
    "每秒新建用户数":extractFactValue(quoteItem,["每秒新建用户数","新建用户数"],["performance","evidence"]),
    "系统漏扫授权数":extractFactValue(quoteItem,["系统漏扫授权数"],["performance","evidence"]),
    "WEB漏扫授权数":extractFactValue(quoteItem,["WEB漏扫授权数"],["performance","evidence"]),
    "主机漏扫并发数":extractFactValue(quoteItem,["主机漏扫并发数"],["performance","evidence"]),
    "WEB漏扫并发数":extractFactValue(quoteItem,["WEB漏扫并发数"],["performance","evidence"]),
    "运维授权数":extractFactValue(quoteItem,["运维授权数"],["performance","evidence"]),
    "图形运维并发数":extractFactValue(quoteItem,["图形运维并发数"],["performance","evidence"]),
    "字符运维并发数":extractFactValue(quoteItem,["字符运维并发数"],["performance","evidence"]),
    "吞吐量":extractFactValue(quoteItem,["吞吐量"],["performance","evidence"]),
    "数据库流量":extractFactValue(quoteItem,["数据库流量"],["performance","evidence"]),
    "SQL处理性能":extractFactValue(quoteItem,["SQL处理性能"],["performance","evidence"]),
    "日志检索":extractFactValue(quoteItem,["日志检索"],["performance","evidence"]),
    "四层吞吐量":extractFactValue(quoteItem,["四层吞吐量"],["performance","evidence"]),
    "四层并发连接数":extractFactValue(quoteItem,["四层并发连接数"],["performance","evidence"]),
    "四层新建连接数":extractFactValue(quoteItem,["四层新建连接数"],["performance","evidence"]),
    "七层新建请求数":extractFactValue(quoteItem,["七层新建请求数"],["performance","evidence"]),
    "CPU颗数":cpu.count,
    "CPU核数":cpu.core,
    "CPU主频":cpu.frequency,
    "CPU架构":cpu.architecture,
    "内存条数":memory.count,
    "单条内存容量":memory.capacity,
    "内存代际":memory.ddr,
    "内存容量":memory.simpleCapacity || memory.capacity,
    "系统盘数量":disks.systemCount,
    "系统盘容量":disks.systemCapacity,
    "缓存盘数量":disks.cacheCount,
    "缓存盘容量":disks.cacheCapacity,
    "数据盘数量":disks.dataCount,
    "数据盘容量":disks.dataCapacity,
    "服务年限":extractServiceYears(quoteItem),
    "终端数量":extractFirstNumber(quoteItem && quoteItem.quantity),
    "存储容量":storageCapacity.replace(/GB$/i,"").replace(/TB$/i,""),
    "存储时长":extractFactValue(quoteItem,["存储时长"],["performance","evidence"]),
    "备份软件容量授权":extractFirstNumber((hardwareText.match(/（\s*(\d+(?:\.\d+)?)\s*T\s*[)）]/) || [])[1] || extractFactValue(quoteItem,["备份软件容量授权","容量授权"],["modules","performance","evidence"])),
    "USB接口数量":extractFirstNumber((hardwareText.match(/USB[：:]\s*(\d+)\s*[*xX]?\s*USB/i) || hardwareText.match(/(\d+)\s*[*xX]?\s*USB/i) || [])[1]),
    "视频接口数量":extractFirstNumber((hardwareText.match(/接口类型[：:][^；;，,。]*(HDMI|VGA|DP)/i) ? (hardwareText.match(/接口类型[：:]([^；;，,。]+)/i) || ["",""])[1].split(/HDMI|VGA|DP/ig).length-1 : "")),
    "音频接口数量":extractFirstNumber((hardwareText.match(/音频[^；;，,。]*?(\d+)/i) || [])[1])
  };
  return variables;
}

function pruneUnresolvedTemplateText(text){
  return toText(text)
    .split("；")
    .map(section=>{
      const chunks=section
        .split("，")
        .map(chunk=>chunk.trim())
        .filter(chunk=>chunk && !/【[^】]+】/.test(chunk))
        .filter(chunk=>!/≥\s*(?:个|套|颗|核|GHz|GB|TB|年|台)/i.test(chunk))
        .filter(chunk=>!/≥\s*0\s*(?:个|套|颗|核|GHz|GB|TB|年|台)?/i.test(chunk));
      return chunks.join("，");
    })
    .filter(Boolean)
    .join("；");
}

function cleanLocalOpeningText(text){
  return sanitizeGeneratedBaseParam(text)
    .replace(/[（(](?:单电源的话不写电源|没有选配不加这一项|没有配备去掉这一项目|普通和尊享取最大的|内部外部取最大)[)）]/g,"")
    .replace(/配置冗余电源[，,]?/g,match=>match)
    .replace(/(\d+(?:\.\d+)?)(GB|TB)\s*GB\/TB/gi,"$1$2")
    .replace(/(\d+(?:\.\d+)?)GB\s*TB/gi,"$1GB")
    .replace(/(\d+(?:\.\d+)?)TB\s*TB/gi,"$1TB")
    .replace(/(\d+(?:\.\d+)?)GB\s*GB/gi,"$1GB")
    .replace(/TBTB/gi,"TB")
    .replace(/GBGB/gi,"GB")
    .replace(/(\d+(?:\.\d+)?)TB\s*SATA\/NVME\s*SSD/gi,"$1TB SATA/NVME SSD")
    .replace(/千兆千兆/g,"千兆")
    .replace(/万兆万兆/g,"万兆")
    .replace(/光口光口/g,"光口")
    .replace(/电口电口/g,"电口")
    .replace(/自适应电口/g,"电口")
    .replace(/VGA\/HMID/gi,"VGA/HDMI")
    .replace(/千兆光口≥0个[、，,；;]?|万兆光口≥0个[、，,；;]?|百兆电口≥0个[、，,；;]?/g,"")
    .replace(/[，,]{2,}/g,"，")
    .replace(/；{2,}/g,"；")
    .replace(/；。/g,"。")
    .replace(/^[，,；;\s]+|[，,；;\s]+$/g,"")
    .trim();
}

function makeParsedProductFromQuoteSource(quoteProduct,selectedParams=[]){
  const source=quoteProduct && typeof quoteProduct==="object" ? quoteProduct : {};
  const firstHardwareParam=normalizeFirstHardwareParamValue(source.first_hardware_param);
  return {
    quote_product_name:toText(source.quote_product_name).trim(),
    database_product_hint:toText(source.database_product_hint).trim(),
    instance_name:toText(source.quote_product_name).trim(),
    selected_params:Array.isArray(selectedParams) ? selectedParams : [],
    first_hardware_param:firstHardwareParam,
    product_analysis:source.product_analysis || null,
    product_analysis_error:toText(source.product_analysis_error).trim(),
    _quote_source:source
  };
}

function isVdiQuoteProduct(quoteItem){
  return /VDI授权|VDI接入授权|授权与配件|桌面云授权/i.test(getQuoteSourceText(quoteItem));
}

function isThinTerminalQuoteProduct(quoteItem){
  return /瘦终端|aDesk-STD|云终端/i.test(getQuoteSourceText(quoteItem));
}

function isPureSoftwareQuoteProduct(quoteItem){
  const text=getQuoteSourceText(quoteItem);
  return /(纯软件|软件交付|授权|虚拟化部署|无硬件|服务类)/.test(text)
    && !/(标准产品|硬件参数|机架式|电源|电口|光口|接口)/.test(getQuoteSourceText(quoteItem,["hardware","evidence"]));
}

function shouldFilterCatalogParam(param,spec,quoteItem){
  if(param && param.ai_select_visible===false){
    return "该参数标记为不上传 AI 筛选";
  }
  const text=[
    param && param.title,
    param && param.module,
    param && param.function_item,
    param && param.content,
    spec && spec.title,
    spec && spec.final_content
  ].map(toText).join(" ");
  if(isVdiQuoteProduct(quoteItem) && /(瘦终端|云终端|ARM架构|CPU主频|USB接口|HDMI|VGA|音频输入|音频输出)/i.test(text)){
    return "VDI授权产品过滤瘦终端硬件参数";
  }
  if(isThinTerminalQuoteProduct(quoteItem) && /(VDI接入授权|并发用户连接授权|专有桌面|池化桌面|远程应用|TCI终端)/i.test(text)){
    return "瘦终端产品过滤VDI授权参数";
  }
  if(isPureSoftwareQuoteProduct(quoteItem) && /(机架式|电源|电口|光口|网口|硬盘|系统盘|缓存盘|数据盘|CPU|处理器|ARM架构|USB|HDMI)/i.test(text)){
    return "纯软件/授权产品过滤硬件参数";
  }
  const titleText=[param && param.title,spec && spec.title].map(toText).join(" ");
  const hasBaseTitle=/(基础要求|基础规格|硬件规格|产品规格|基础参数|单台配置|硬件要求|数量要求)/.test(titleText);
  const hasHardwareBody=/(标准.*U|机架式|CPU|处理器|内存|硬盘|系统盘|缓存盘|数据盘|电源|电口|光口|网口|接口|ARM架构|USB|HDMI|单台.*配置|配置.*≥)/i.test(text);
  if(hasBaseTitle && hasHardwareBody){
    return "参数库基础/硬件规格已由第一阶段基础参数替代";
  }
  if(/【\s*】|【[^】]*(?:标准网口列表|设备高度|CPU|内存|硬盘|数量|容量|年限|主频|架构|授权|待填|填写|x|XX)[^】]*】|(?:^|[^\w])(?:xx|XX)(?:[^\w]|$)|x口|千兆（万兆）网口|根据项目实际需求|注意：/.test(text)){
    return "参数库条目含占位符或维护说明";
  }
  return "";
}

function buildAppliedSelection(product,paramSpecs,instanceName="",quoteItem=null){
  const selected=[];
  const editedContentByParamId={};
  const matchedTitles=[];
  const missingTitles=[];
  const notes=[];
  const quoteSource=getAppliedQuoteSource(quoteItem);
  const filteredTitles=[];

  paramSpecs.forEach(spec=>{
    const param=matchParameterForParsedItem(product.id,spec);
    if(!param){
      missingTitles.push(toText(spec && spec.title).trim() || "未命名参数");
      return;
    }
    const filterReason=shouldFilterCatalogParam(param,spec,quoteSource);
    if(filterReason){
      filteredTitles.push(`${toText(param.title).trim() || toText(spec && spec.title).trim() || "未命名参数"}（${filterReason}）`);
      return;
    }
    const finalContent=normalizeParamContentValue(applyParsedEditsToContent(param.content,spec));
    const originalContent=normalizeParamContentValue(param.content);
    selected.push({
      ...param,
      content:finalContent,
      prefix_symbol:""
    });
    if(finalContent!==originalContent){
      editedContentByParamId[param.id]=finalContent;
    }
    matchedTitles.push(toText(param.title).trim());
  });

  if(filteredTitles.length){
    notes.push(`【${toText(instanceName || quoteSource && quoteSource.quote_product_name || product && product.name).trim() || "未命名产品"}】已过滤参数库基础/硬件规格参数：${[...new Set(filteredTitles)].join("、")}`);
  }
  if(missingTitles.length){
    notes.push(`【${toText(instanceName || quoteSource && quoteSource.quote_product_name || product && product.name).trim() || "未命名产品"}】有 ${missingTitles.length} 条 AI 返回参数未在当前参数库产品中匹配：${[...new Set(missingTitles)].slice(0,12).join("、")}`);
  }

	  const productAnalysis=quoteSource && quoteSource.product_analysis && typeof quoteSource.product_analysis==="object"
	    ? quoteSource.product_analysis
	    : {};
	  let firstHardwareParam=normalizeFirstHardwareParamValue(
	    quoteSource && quoteSource.first_hardware_param
	  );
	  const baseParamIssues=normalizeTextArray(quoteSource && quoteSource.product_analysis_error);
	  if(baseParamIssues.length){
	    notes.push(`【${toText(instanceName || quoteSource && quoteSource.quote_product_name || product && product.name).trim() || "未命名产品"}】第一阶段产品分析提示：${baseParamIssues.join("、")}`);
	  }
	  if(!firstHardwareParam){
	    notes.push(`【${toText(instanceName || quoteSource && quoteSource.quote_product_name || product && product.name).trim() || "未命名产品"}】第一阶段未生成可用基础参数`);
	  }
  if(firstHardwareParam){
    const sanitizedFirstHardwareParam=sanitizeGeneratedBaseParam(firstHardwareParam,quoteSource);
    const validation=validateGeneratedBaseParam(sanitizedFirstHardwareParam);
    if(validation.ok){
      const baseParam=createGeneratedBaseParam(product,sanitizedFirstHardwareParam);
      selected.unshift(baseParam);
      editedContentByParamId[baseParam.id]=sanitizedFirstHardwareParam;
      matchedTitles.unshift(baseParam.title);
    }else{
      notes.push(`【${toText(instanceName || quoteItem && quoteItem.quote_product_name || product && product.name).trim() || "未命名产品"}】第一条基础参数未插入：${validation.issues.join("、")}`);
    }
  }else{
    notes.push(`【${toText(instanceName || quoteItem && quoteItem.quote_product_name || product && product.name).trim() || "未命名产品"}】未生成第一条基础参数`);
  }

  return {
    instanceName:toText(instanceName).trim(),
    selected,
    editedContentByParamId,
    matchedTitles,
    missingTitles,
    notes
  };
}

function isInformationalQuoteNote(note){
  const text=toText(note).trim();
  if(!text) return true;
  if(text.startsWith("本次 AI 耗时")) return true;
  if(text==="本地已完成报价单类型识别和产品行归一化。") return true;
  if(/^依据模块覆盖和策略要求/.test(text)) return true;
  if(/已使用本地报价单事实生成|已用本地事实兜底/.test(text)) return true;
  if(/已过滤参数库|AI 返回参数未在当前参数库产品中匹配|参数库条目含占位符|参数选择失败/.test(text)) return true;
  if(/产品分析需确认/.test(text) && /基础参数为空|AI 第一条基础参数不可用/.test(text)) return true;
  const firstStageMatch=text.match(/^第一阶段基础参数生成：(\d+)\/(\d+) 个产品已生成。$/);
  if(firstStageMatch && firstStageMatch[1]===firstStageMatch[2]) return true;
  return false;
}

function isBlockingQuoteIssueNote(note){
  const text=toText(note).trim();
  if(!text || isInformationalQuoteNote(text)) return false;
  if(/未匹配参数库产品|没有匹配到参数库|未找到匹配的参数库产品/.test(text)) return true;
  if(/未生成第一条基础参数|第一阶段未生成可用基础参数|未生成可用基础参数/.test(text)) return true;
  if(/无法应用|无法解析|结构不正确|未识别到有效报价产品/.test(text)) return true;
  return false;
}

function buildQuoteApplyIssueSummary(matchedProducts,unmatchedProducts,notes){
  const issues=[];
  dedupeExactTextArray(unmatchedProducts).forEach(name=>{
    issues.push(`未匹配参数库产品：${name}`);
  });
  dedupeExactTextArray(notes)
    .filter(isBlockingQuoteIssueNote)
    .forEach(note=>issues.push(note));
  const visibleIssues=dedupeExactTextArray(issues);
  return {
    appliedCount:Array.isArray(matchedProducts) ? matchedProducts.length : 0,
    issueCount:visibleIssues.length,
    issues:visibleIssues.slice(0,80),
    hiddenCount:Math.max(0,visibleIssues.length-80)
  };
}

function openQuoteApplyIssueModal(summary){
  if(!summary || !summary.issueCount) return;
  const existing=document.getElementById("quoteApplyIssueModal");
  if(existing) existing.remove();
  const modal=document.createElement("div");
  modal.id="quoteApplyIssueModal";
  modal.className="ai-modal open";
  const panel=document.createElement("div");
  panel.className="ai-modal-panel";
  panel.style.width="min(720px,calc(100vw - 32px))";
  const head=document.createElement("div");
  head.className="ai-modal-head";
  const titleWrap=document.createElement("div");
  const title=document.createElement("div");
  title.className="ai-modal-title";
  title.textContent="生成结果检查";
  const subtitle=document.createElement("div");
  subtitle.className="ai-modal-subtitle";
  subtitle.textContent=`已应用 ${summary.appliedCount} 个产品，仍有 ${summary.issueCount} 个阻断问题需要处理。`;
  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);
  const closeBtn=document.createElement("button");
  closeBtn.type="button";
  closeBtn.className="ai-close";
  closeBtn.title="关闭";
  closeBtn.setAttribute("aria-label","关闭");
  closeBtn.textContent="×";
  head.appendChild(titleWrap);
  head.appendChild(closeBtn);

  const list=document.createElement("div");
  list.className="ai-card";
  list.style.maxHeight="min(52vh,420px)";
  list.style.overflow="auto";
  list.style.display="flex";
  list.style.flexDirection="column";
  list.style.gap="8px";
  summary.issues.forEach((issue,index)=>{
    const item=document.createElement("div");
    item.style.fontSize="13px";
    item.style.lineHeight="1.6";
    item.style.color="var(--text-primary)";
    item.textContent=`${index+1}. ${issue}`;
    list.appendChild(item);
  });
  if(summary.hiddenCount>0){
    const more=document.createElement("div");
    more.style.fontSize="12px";
    more.style.color="var(--text-muted)";
    more.textContent=`还有 ${summary.hiddenCount} 条提示已省略，请查看浏览器控制台完整日志。`;
    list.appendChild(more);
  }

  const actions=document.createElement("div");
  actions.className="ai-actions ai-actions--spaced";
  const okBtn=document.createElement("button");
  okBtn.type="button";
  okBtn.className="btn-ai-primary";
  okBtn.textContent="知道了";
  actions.appendChild(okBtn);

  const close=()=>modal.remove();
  closeBtn.addEventListener("click",close);
  okBtn.addEventListener("click",close);
  modal.addEventListener("pointerdown",event=>{
    if(event.target===modal) close();
  });
  panel.appendChild(head);
  panel.appendChild(list);
  panel.appendChild(actions);
  modal.appendChild(panel);
  document.body.appendChild(modal);
}

async function applyQuoteParseResultData(parsedResult,anchor=null){
  parsedResult=validateQuoteParseResultStructure(normalizeQuoteParseResult(parsedResult));

  if(parsedResult.products.length===0){
    showToast("解析结果里没有可应用的产品","error",anchor);
    return false;
  }

  const hasExistingSelection=state.selected.length>0 || state.instances.length>0;
  if(hasExistingSelection){
    const confirmed=await confirmAtAnchor("应用解析结果会覆盖当前已选参数，是否继续？",anchor);
    if(!confirmed) return false;
  }

  const matchedProducts=[];
  const unmatchedProducts=[];

  parsedResult.products.forEach(item=>{
    const matchedProduct=matchProductForParsedSelection(item) || matchProductForParsedItem(item);
    if(!matchedProduct){
      unmatchedProducts.push(toText(item.database_product_hint || item.quote_product_name).trim() || "未命名产品");
      return;
    }
    const applied=buildAppliedSelection(
      matchedProduct,
      Array.isArray(item.selected_params) ? item.selected_params : [],
      toText(item.instance_name || item.quote_product_name).trim(),
      item
    );
    if(applied.notes.length){
      parsedResult.notes.push(...applied.notes);
    }
    matchedProducts.push({product:matchedProduct,applied});
  });

  if(matchedProducts.length===0){
    showToast("没有匹配到参数库中的产品","error",anchor);
    return false;
  }

  resetSelectionStateOnly();
  matchedProducts.forEach((item,index)=>{
    const instance=createInstance(item.product.id,item.applied.instanceName || item.product.name);
    instance.selected=item.applied.selected.map(param=>param && param.isCustom && !param.instance_id
      ? {...param,instance_id:instance.id}
      : param
    );
    instance.editedContentByParamId=item.applied.editedContentByParamId;
    state.instances.push(instance);
    if(index===0){
      state.activeInstanceId=instance.id;
    }
  });
  if(state.activeInstanceId){
    activateInstance(state.activeInstanceId);
  }

  const issueSummary=buildQuoteApplyIssueSummary(matchedProducts,unmatchedProducts,parsedResult.notes);
  if(unmatchedProducts.length || parsedResult.notes.length){
    console.warn("报价单应用提示",{
      unmatchedProducts,
      notes:parsedResult.notes
    });
  }
  showToast(
    issueSummary.issueCount
      ? `已应用 ${matchedProducts.length} 个产品，仍有 ${issueSummary.issueCount} 个阻断问题`
      : `已应用 ${matchedProducts.length} 个产品`,
    "success",
    anchor
  );
  openQuoteApplyIssueModal(issueSummary);
  if(isMobileViewport()){
    setMobileTab("select");
    if(typeof updateMobileHome==="function") updateMobileHome();
  }
  return true;
}

function activateInstance(instanceId,activeElement){
  const instance=getInstanceById(instanceId);
  if(!instance) return;

  showEditorPanels();

  state.activeInstanceId=instance.id;
  state.currentProductId=instance.productId;
  state.currentParams=getParamsByProductId(instance.productId);
  state.selected=instance.selected;
  state.editedContentByParamId=instance.editedContentByParamId;
  rememberLastActiveInstance(instance);

  setSidebarActiveProduct(instance.productId,activeElement);
  renderProductMeta(instance.productId);
  renderInstancePanel();
  renderParamList();
  renderEditArea();
  schedulePreviewUpdate();
  updateMobileContext();
  if(typeof updateMobileHome==="function") updateMobileHome();
}

function ensureDefaultInstanceForProduct(productId){
  const activeInstance=getActiveInstance();
  if(activeInstance && activeInstance.productId===productId){
    return activeInstance;
  }
  const rememberedInstance=getRememberedInstance(productId);
  if(rememberedInstance){
    return rememberedInstance;
  }
  const existingInstances=getInstancesByProduct(productId);
  if(existingInstances.length>0){
    return existingInstances[0];
  }
  const instance=createInstance(productId);
  state.instances.push(instance);
  return instance;
}

function openProductWithoutInstance(productId,activeElement){
  showEditorPanels();

  state.activeInstanceId=null;
  state.currentProductId=productId;
  state.currentParams=getParamsByProductId(productId);
  state.selected=[];
  state.editedContentByParamId={};

  setSidebarActiveProduct(productId,activeElement);
  renderProductMeta(productId);
  renderInstancePanel();
  renderParamList();
  renderEditArea();
  schedulePreviewUpdate();
  updateMobileContext();
  if(typeof updateMobileHome==="function") updateMobileHome();
}

function ensureActiveInstanceForCurrentProduct(){
  if(!state.currentProductId){
    return null;
  }
  const instance=ensureDefaultInstanceForProduct(state.currentProductId);
  if(state.activeInstanceId!==instance.id){
    activateInstance(instance.id);
  }
  return instance;
}

function updateInstancePanelVisibility(){
  const dock=document.getElementById("instanceDock");
  if(!dock) return;
  dock.style.display="flex";
  applySidebarSplitRatio();
}

function renderInstancePanel(){
  const list=document.getElementById("instanceList");
  if(!list) return;

  updateInstancePanelVisibility();
  list.innerHTML="";

  if(state.instances.length===0){
    const empty=document.createElement("div");
    empty.className="empty-hint";
    empty.textContent="暂无产品，请先选择产品后新增产品";
    list.appendChild(empty);
    updateMobileContext();
    return;
  }

  const fragment=document.createDocumentFragment();
  state.instances.forEach(instance=>{
    const product=getProductById(instance.productId);
    const item=document.createElement("div");
    item.className="instance-item"+(instance.id===state.activeInstanceId ? " active" : "");
    item.dataset.instanceId=instance.id;
    item.draggable=true;
    item.title="拖拽可调整产品顺序";
    item.addEventListener("dragover",event=>handleInstanceDragOver(event,instance.id));
    item.addEventListener("drop",event=>handleInstanceDrop(event,instance.id));
    item.addEventListener("dragleave",event=>{
      if(!event.currentTarget.contains(event.relatedTarget)){
        event.currentTarget.classList.remove("drag-over");
      }
    });
    item.addEventListener("dragstart",event=>{
      const target=event.target;
      if(target && target.closest && target.closest(".instance-name-input,.instance-del")){
        event.preventDefault();
        return;
      }
      startInstanceDrag(event,instance.id);
    });
    item.addEventListener("dragend",endInstanceDrag);

    const name=document.createElement("label");
    name.className="instance-name";

    const nameInput=document.createElement("input");
    nameInput.type="text";
    nameInput.className="instance-name-input";
    nameInput.draggable=false;
    let instanceName=toText(instance.name).trim();
    if(!instanceName){
      instanceName=getUniqueInstanceName(getNextInstanceName(instance.productId),instance.id);
      instance.name=instanceName;
      rememberLastActiveInstance(instance);
    }
    nameInput.value=instanceName;
    nameInput.placeholder=getNextInstanceName(instance.productId);
    nameInput.setAttribute("aria-label","产品名称");
    nameInput.addEventListener("click",event=>event.stopPropagation());
    nameInput.addEventListener("keydown",event=>{
      event.stopPropagation();
      if(event.key==="Enter"){
        event.preventDefault();
        nameInput.blur();
        return;
      }
      if(event.key==="Escape"){
        event.preventDefault();
        nameInput.value=toText(instance.name).trim();
        nameInput.blur();
      }
    });
    nameInput.addEventListener("blur",()=>{
      renameInstance(instance.id,nameInput.value,nameInput);
    });
    name.appendChild(nameInput);

    const meta=document.createElement("div");
    meta.className="instance-meta";

    const productBadge=document.createElement("span");
    productBadge.className="instance-product";
    productBadge.textContent=toText(product && product.name,`产品 #${instance.productId}`);
    productBadge.title=toText(product && product.name,`产品 #${instance.productId}`);

    const delBtn=document.createElement("button");
    delBtn.type="button";
    delBtn.className="instance-del";
    delBtn.title="删除产品";
    delBtn.setAttribute("aria-label","删除产品");
    delBtn.textContent="×";
    delBtn.addEventListener("click",event=>{
      event.stopPropagation();
      removeInstance(instance.id,event.currentTarget);
    });
    delBtn.addEventListener("keydown",event=>{
      event.stopPropagation();
    });

    meta.appendChild(productBadge);
    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(delBtn);
    bindAccessibleAction(item,()=>activateInstance(instance.id));
    fragment.appendChild(item);
  });

  list.appendChild(fragment);
  updateMobileContext();
}

function addInstanceFromCurrentProduct(event){
  const anchor=getEventAnchor(event);
  if(!state.currentProductId){
    showToast("请先选择产品","error",anchor);
    if(isMobileViewport()){
      openMobileProductDrawer(event);
    }
    return;
  }

  const instance=createInstance(state.currentProductId);
  state.instances.push(instance);
  activateInstance(instance.id);
  showToast(`已新增产品：${instance.name}`,"success",anchor);
  if(isMobileViewport()){
    setMobileTab("edit");
    if(typeof updateMobileHome==="function") updateMobileHome();
  }
}

function renameInstance(instanceId,nextName,anchorEl=null){
  const instance=getInstanceById(instanceId);
  if(!instance) return;

  const rawName=toText(nextName).trim() || instance.name;
  const normalizedName=getUniqueInstanceName(rawName,instance.id);
  if(normalizedName===instance.name) return;

  instance.name=normalizedName;
  rememberLastActiveInstance(instance);
  renderInstancePanel();
  schedulePreviewUpdate();
  if(normalizedName!==rawName){
    showToast(`名称重复，已自动调整为：${normalizedName}`,"error",anchorEl);
    return;
  }
  showToast("产品名称已更新","success",anchorEl);
}

function clearInstanceDragOverStyles(){
  document.querySelectorAll("#instanceList .instance-item.drag-over").forEach(item=>{
    item.classList.remove("drag-over");
  });
}

function startInstanceDrag(event,instanceId){
  state.draggingInstanceId=instanceId;
  if(event.dataTransfer){
    event.dataTransfer.effectAllowed="move";
    event.dataTransfer.setData("text/plain",instanceId);
  }
}

function endInstanceDrag(){
  state.draggingInstanceId=null;
  clearInstanceDragOverStyles();
}

function handleInstanceDragOver(event,targetInstanceId){
  const sourceId=state.draggingInstanceId;
  if(!sourceId || sourceId===targetInstanceId){
    return;
  }
  event.preventDefault();
  clearInstanceDragOverStyles();
  event.currentTarget.classList.add("drag-over");
  if(event.dataTransfer){
    event.dataTransfer.dropEffect="move";
  }
}

function handleInstanceDrop(event,targetInstanceId){
  event.preventDefault();
  const sourceId=state.draggingInstanceId || (
    event.dataTransfer
      ? toText(event.dataTransfer.getData("text/plain")).trim()
      : ""
  );
  endInstanceDrag();
  if(!sourceId || sourceId===targetInstanceId) return;

  const fromIndex=state.instances.findIndex(item=>item.id===sourceId);
  const targetIndex=state.instances.findIndex(item=>item.id===targetInstanceId);
  if(fromIndex===-1 || targetIndex===-1 || fromIndex===targetIndex){
    return;
  }

  const [moved]=state.instances.splice(fromIndex,1);
  const insertIndex=fromIndex<targetIndex ? targetIndex-1 : targetIndex;
  state.instances.splice(insertIndex,0,moved);
  renderInstancePanel();
  schedulePreviewUpdate();
  showToast("产品顺序已更新","success",event.currentTarget);
}

async function removeInstance(instanceId,anchorEl=null){
  const index=state.instances.findIndex(item=>item.id===instanceId);
  if(index===-1) return;

  const instance=state.instances[index];
  const confirmed=await confirmAtAnchor(`确定删除产品「${instance.name}」吗？`,anchorEl);
  if(!confirmed){
    return;
  }

  state.instances.splice(index,1);
  const productKey=String(instance.productId);
  if(state.lastActiveInstanceByProduct[productKey]===instanceId){
    const sameProductInstances=getInstancesByProduct(instance.productId);
    if(sameProductInstances.length>0){
      state.lastActiveInstanceByProduct[productKey]=sameProductInstances[sameProductInstances.length-1].id;
    }else{
      delete state.lastActiveInstanceByProduct[productKey];
    }
  }

  if(state.activeInstanceId!==instanceId){
    renderInstancePanel();
    schedulePreviewUpdate();
    updateMobileContext();
    showToast("产品已删除","success",anchorEl);
    return;
  }

  const rememberedFallback=getRememberedInstance(instance.productId);
  const fallback=rememberedFallback || state.instances[index] || state.instances[index-1] || null;
  if(fallback){
    activateInstance(fallback.id);
    showToast("产品已删除","success",anchorEl);
    return;
  }

  state.activeInstanceId=null;
  state.currentProductId=null;
  state.currentParams=[];
  state.selected=[];
  state.editedContentByParamId={};

  renderProductMeta(null);
  renderInstancePanel();
  renderParamList();
  renderEditArea();
  schedulePreviewUpdate();
  document.querySelectorAll(".product").forEach(item=>item.classList.remove("active"));
  showGuidePanel();
  updateMobileContext();
  if(isMobileViewport()){
    setMobileTab("home",true);
  }
  showToast("产品已删除","success",anchorEl);
}

// ===== 确认删除 =====
async function confirmRemoveItem(index,event){
  const anchor=getEventAnchor(event);
  const confirmed=await confirmAtAnchor("确定要删除这个参数吗？",anchor);
  if(confirmed){
    removeItem(index);
    showToast("参数已删除","success",anchor);
  }
}

async function loadExcel(){
  state.draftSavePaused=true;
  resetWorkbookState();
  renderSidebarSkeleton();
  setGuideLoadingState(true);

  if(window.location.protocol!=="http:" && window.location.protocol!=="https:"){
    showToast("请使用 http://127.0.0.1:7654/ 打开页面。","error");
    return;
  }

  let cachedEntry=null;
  let cacheApplied=false;
  try{
    cachedEntry=await readDatabaseCatalogCache();
    if(cachedEntry && cachedEntry.payload){
      applyDatabaseCatalog(cachedEntry.payload);
      state.draftSavePaused=false;
      cacheApplied=true;
      setGuideLoadingState(false,`已从本地缓存加载 ${cachedEntry.payload.products.length} 个产品、${cachedEntry.payload.parameters.length} 条参数，正在检查更新。`);
    }
  }catch(err){
    console.warn("读取参数库缓存失败:",err);
  }

  try{
    const result=await fetchDatabaseCatalog(cachedEntry && cachedEntry.etag);
    if(result.notModified && cacheApplied){
      setGuideLoadingState(false,`已加载 ${cachedEntry.payload.products.length} 个产品、${cachedEntry.payload.parameters.length} 条参数。`);
      promptSavedDraftIfAvailable();
      return;
    }
    applyDatabaseCatalog(result.payload);
    state.draftSavePaused=false;
    setGuideLoadingState(false,`已加载 ${result.payload.products.length} 个产品、${result.payload.parameters.length} 条参数。`);
    promptSavedDraftIfAvailable();
    writeDatabaseCatalogCache({
      payload:result.payload,
      etag:result.etag || "",
      savedAt:new Date().toISOString()
    }).catch(err=>console.warn("写入参数库缓存失败:",err));
  }catch(err){
    state.draftSavePaused=false;
    if(cacheApplied){
      setGuideLoadingState(false,`已使用本地缓存 ${cachedEntry.payload.products.length} 个产品、${cachedEntry.payload.parameters.length} 条参数。`);
      promptSavedDraftIfAvailable();
      showToast("参数库更新检查失败，已使用本地缓存","error");
      console.warn(err);
      return;
    }
    setGuideLoadingState(false,"参数库加载失败，请根据提示检查数据文件。");
    showToast(getLoadErrorMessage(err),"error");
    console.error(err);
  }
}

function fetchDatabaseCatalog(etag=""){
  const headers={};
  if(etag){
    headers["If-None-Match"]=etag;
  }
  return fetch("/api/database",{cache:"no-store",headers})
    .then(res=>{
      if(res.status===304){
        return {notModified:true,etag};
      }
      if(!res.ok) throw new Error("HTTP_"+res.status);
      const responseEtag=res.headers.get("ETag") || "";
      return res.json().then(payload=>({payload,etag:responseEtag}));
    });
}

function openDatabaseCacheDb(){
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){
      reject(new Error("INDEXEDDB_UNAVAILABLE"));
      return;
    }
    const request=indexedDB.open(DATABASE_CACHE_DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(DATABASE_CACHE_STORE_NAME)){
        db.createObjectStore(DATABASE_CACHE_STORE_NAME,{keyPath:"key"});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
  });
}

async function readDatabaseCatalogCache(){
  const db=await openDatabaseCacheDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DATABASE_CACHE_STORE_NAME,"readonly");
    const store=tx.objectStore(DATABASE_CACHE_STORE_NAME);
    const request=store.get(DATABASE_CACHE_KEY);
    request.onsuccess=()=>{
      const value=request.result;
      resolve(value && value.payload ? value : null);
      db.close();
    };
    request.onerror=()=>{
      reject(request.error || new Error("INDEXEDDB_READ_FAILED"));
      db.close();
    };
  });
}

async function writeDatabaseCatalogCache(entry){
  if(!entry || !entry.payload) return;
  const db=await openDatabaseCacheDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DATABASE_CACHE_STORE_NAME,"readwrite");
    tx.oncomplete=()=>{
      resolve();
      db.close();
    };
    tx.onerror=()=>{
      reject(tx.error || new Error("INDEXEDDB_WRITE_FAILED"));
      db.close();
    };
    tx.objectStore(DATABASE_CACHE_STORE_NAME).put({
      key:DATABASE_CACHE_KEY,
      payload:entry.payload,
      etag:entry.etag || "",
      savedAt:entry.savedAt || new Date().toISOString()
    });
  });
}

function applyDatabaseCatalog(payload){
  if(!payload || !Array.isArray(payload.products) || !Array.isArray(payload.parameters)){
    throw new Error("DATABASE_JSON_INVALID");
  }
  state.products=payload.products.map(product=>({
    ...product,
    id:Number(product.id),
    vendorHeaders:Array.isArray(product.vendorHeaders) ? product.vendorHeaders : []
  }));
  state.matchRules=Array.isArray(payload.matchRules)
    ? payload.matchRules.map(rule=>({
      ...rule,
      enabled:rule.enabled!==false,
      priority:Number(rule.priority) || 100,
      model_patterns:Array.isArray(rule.model_patterns) ? rule.model_patterns : [],
      keyword_patterns:Array.isArray(rule.keyword_patterns) ? rule.keyword_patterns : []
    }))
    : [];
  state.parameters=payload.parameters.map(param=>({
    ...param,
    id:Number(param.id),
    product_id:Number(param.product_id),
    ai_select_visible:param.ai_select_visible!==false,
    tags:Array.isArray(param.tags) ? param.tags : [],
    vendor_support:param.vendor_support && typeof param.vendor_support==="object" ? param.vendor_support : {},
    vendor_headers:Array.isArray(param.vendor_headers) ? param.vendor_headers : []
  }));
  buildSidebar();
  showGuidePanel();
  if(typeof updateMobileMode==="function"){
    updateMobileMode();
  }
  if(typeof updateMobileHome==="function"){
    updateMobileHome();
  }
  renderEditArea();
  schedulePreviewUpdate();

  if(Number(payload.skippedSheetCount)>0){
    showToast(`已跳过 ${payload.skippedSheetCount} 个空工作表`,"error");
  }
  if(Array.isArray(payload.metaWarnings) && payload.metaWarnings.length>0){
    showToast("部分产品文档信息存在多值，已按第一条显示","error");
    console.warn(payload.metaWarnings.join("\n"));
  }
}

function buildSidebar(){
  const sidebar=document.getElementById("sidebar");
  sidebar.innerHTML="";

  const categories=[...new Set(state.products.map(product=>product.category))];
  const fragment=document.createDocumentFragment();

  categories.forEach(category=>{
    const filteredProducts=state.products.filter(product=>product.category===category);

    const categoryTitle=document.createElement("div");
    categoryTitle.className="category-title level-bg";
    categoryTitle.textContent="▼ "+category;

    const categoryContainer=document.createElement("div");
    categoryContainer.className="sidebar-group";
    categoryContainer.style.display="block";
    categoryTitle.setAttribute("aria-expanded","true");

    bindAccessibleAction(categoryTitle,()=>{
      const opened=categoryContainer.style.display!=="none";
      categoryContainer.style.display=opened ? "none" : "block";
      categoryTitle.textContent=(opened ? "▶ " : "▼ ")+category;
      categoryTitle.setAttribute("aria-expanded",opened ? "false" : "true");
    });

    const productLines=[...new Set(
      filteredProducts.map(product=>toText(product.productLine || product.sheetName).trim()).filter(Boolean)
    )];

    productLines.forEach(productLine=>{
      const lineTitle=document.createElement("div");
      lineTitle.className="category-title level-line";
      lineTitle.textContent="▶ "+productLine;

      const lineContainer=document.createElement("div");
      lineContainer.className="sidebar-versions";
      lineContainer.style.display="none";
      lineTitle.setAttribute("aria-expanded","false");

      bindAccessibleAction(lineTitle,()=>{
        const isOpen=lineContainer.style.display==="block";
        lineContainer.style.display=isOpen ? "none" : "block";
        lineTitle.textContent=(isOpen ? "▶ " : "▼ ")+productLine;
        lineTitle.setAttribute("aria-expanded",isOpen ? "false" : "true");
      });

      filteredProducts
        .filter(product=>toText(product.productLine || product.sheetName).trim()===productLine)
        .sort((a,b)=>toText(a.version).localeCompare(toText(b.version),"zh-Hans-CN"))
        .forEach(product=>{
          const productItem=document.createElement("div");
          productItem.className="product";
          productItem.dataset.productId=String(product.id);

          const versionLabel=toText(product.version).trim();
          productItem.textContent=versionLabel || "默认版本";
          productItem.title=toText(product.name,productLine);

          bindAccessibleAction(productItem,()=>loadProduct(product.id,productItem));
          lineContainer.appendChild(productItem);
        });

      categoryContainer.appendChild(lineTitle);
      categoryContainer.appendChild(lineContainer);
    });

    fragment.appendChild(categoryTitle);
    fragment.appendChild(categoryContainer);
  });

  sidebar.appendChild(fragment);
}

function loadProduct(productId,activeElement){
  if(isMobileViewport() && typeof rememberMobileRecentProduct==="function"){
    rememberMobileRecentProduct(productId);
  }
  const existingInstances=getInstancesByProduct(productId);
  if(existingInstances.length>0){
    const rememberedInstance=getRememberedInstance(productId);
    const fallbackInstance=existingInstances[existingInstances.length-1];
    const targetInstance=rememberedInstance || fallbackInstance;
    activateInstance(targetInstance.id,activeElement);
    if(isMobileViewport()){
      setMobileTab("select");
    }
    return;
  }
  if(isMobileViewport()){
    const instance=ensureDefaultInstanceForProduct(productId);
    activateInstance(instance.id,activeElement);
    setMobileTab("select");
    closeMobileProductDrawer();
    return;
  }
  openProductWithoutInstance(productId,activeElement);
  if(isMobileViewport()){
    setMobileTab("select");
  }
}

function renderProductMeta(productId){
  const metaBox=document.getElementById("productMeta");
  const nameEl=document.getElementById("productDocName");
  const timeEl=document.getElementById("productDocUpdatedAt");
  if(!metaBox || !nameEl || !timeEl) return;

  if(!productId){
    metaBox.style.display="none";
    return;
  }

  const product=state.products.find(item=>item.id===productId);
  const docName=toText(product && product.refDocName).trim() || "未填写";
  const docUpdatedAt=toText(product && product.refDocUpdatedAt).trim() || "未填写";
  nameEl.textContent=docName;
  timeEl.textContent=docUpdatedAt;
  metaBox.style.display="flex";
}

function createProofBadge(label,rawValue){
  const proof=normalizeProofMark(rawValue);
  const badge=document.createElement("div");
  const mark=proof.mark || "-";
  badge.className="param-proof"+(proof.status ? " "+proof.status : " missing");
  badge.textContent=`${label}:${mark}`;
  badge.title=`${label}：${mark}`;
  return badge;
}

function getSupportStatusClass(value){
  const text=toText(value).trim();
  if(!text || text==="-" || text.includes("未知") || text.includes("不清楚")) return "unknown";
  if(text.includes("不满足") || text.toLowerCase()==="n"){
    return "fail";
  }
  if(text.includes("部分") || text.includes("待确认")){
    return "partial";
  }
  if(text.includes("满足") || text.toLowerCase()==="y" || text==="是"){
    return "ok";
  }
  return "partial";
}

function normalizeSupportValue(value){
  const text=toText(value).trim();
  if(!text || text==="-" || text.includes("待确认") || text.includes("未知") || text.includes("不清楚")){
    return "未知";
  }
  return text;
}

function getVendorSupportEntries(param){
  const support=param && param.vendor_support && typeof param.vendor_support==="object"
    ? param.vendor_support
    : {};
  const product=getProductById(param && param.product_id);
  const vendorHeaders=Array.isArray(param && param.vendor_headers) && param.vendor_headers.length>0
    ? param.vendor_headers
    : (Array.isArray(product && product.vendorHeaders) ? product.vendorHeaders : []);
  if(vendorHeaders.length>0){
    return vendorHeaders
      .map(vendor=>toText(vendor).trim())
      .filter(vendor=>vendor && !vendor.includes("深信服"))
      .map(vendor=>[vendor,toText(support[vendor]).trim()]);
  }
  return [];
}

function getShortVendorName(vendor){
  const text=toText(vendor).trim();
  const match=text.match(/[\u4e00-\u9fffA-Za-z]/);
  return match ? match[0].toUpperCase() : text.slice(0,1) || "-";
}

function createMetaPill(label,content,emptyText="无"){
  const text=toText(content).trim() || emptyText;
  const pill=document.createElement("span");
  pill.className="param-meta-pill";
  pill.title=`${label}：${text}`;
  const labelEl=document.createElement("span");
  labelEl.className="param-meta-label";
  labelEl.textContent=`${label}:`;
  const textEl=document.createElement("span");
  textEl.className="param-meta-text";
  textEl.textContent=text;
  pill.appendChild(labelEl);
  pill.appendChild(textEl);
  return pill;
}

function createVendorSupportList(param){
  const entries=getVendorSupportEntries(param);
  if(!entries.length) return null;
  const group=document.createElement("div");
  group.className="vendor-compare";
  group.title="厂商对比";
  const label=document.createElement("span");
  label.className="vendor-compare-label";
  label.textContent="厂商对比:";
  const list=document.createElement("div");
  list.className="support-list";
  list.style.setProperty("--vendor-count",String(entries.length));
  entries.forEach(([vendor,value])=>{
    const displayValue=normalizeSupportValue(value);
    const shortName=getShortVendorName(vendor);
    const chip=document.createElement("span");
    chip.className="support-chip";
    const statusClass=getSupportStatusClass(displayValue);
    if(statusClass) chip.classList.add(statusClass);
    chip.textContent=shortName;
    chip.title=`${vendor}: ${displayValue}`;
    list.appendChild(chip);
  });
  group.appendChild(label);
  group.appendChild(list);
  return group;
}

function appendParamDetails(container,param){
  const details=[
    ["模块",param.requires_module],
    ["备注",param.remark]
  ].filter(([,value])=>isMeaningfulMetaText(value));
  if(!details.length) return;
  const detailRow=document.createElement("div");
  detailRow.className="param-detail-row"+(details.length===1 ? " single" : "");
  details.forEach(([label,value])=>{
    detailRow.appendChild(createMetaPill(label,value,""));
  });
  container.appendChild(detailRow);
}

function isBasicParameterProject(param){
  return normalizeMatchText(param && param.module)==="基础参数";
}

function getParamSearchHaystack(param){
  return [
    param && param.title,
    param && param.content,
    param && param.module,
    param && param.function_item,
    param && param.requires_module,
    param && param.remark,
    param && param.is_star,
    param && param.type
  ].map(value=>normalizeMatchText(value)).join(" ");
}

function getFilteredCurrentParams(){
  const query=normalizeMatchText(state.paramSearchQuery);
  if(!query) return state.currentParams;
  const keywords=query.split(/\s+/).filter(Boolean);
  return state.currentParams.filter(param=>{
    const haystack=getParamSearchHaystack(param);
    return keywords.every(keyword=>haystack.includes(keyword));
  });
}

function handleParamSearchInput(value){
  state.paramSearchQuery=toText(value).trim();
  const clearBtn=document.getElementById("paramSearchClear");
  if(clearBtn) clearBtn.hidden=!state.paramSearchQuery;
  renderParamList();
}

function clearParamSearch(){
  state.paramSearchQuery="";
  const input=document.getElementById("paramSearchInput");
  const clearBtn=document.getElementById("paramSearchClear");
  if(input) input.value="";
  if(clearBtn) clearBtn.hidden=true;
  renderParamList();
}

function clearParamSearchControlsOnly(){
  state.paramSearchQuery="";
  const input=document.getElementById("paramSearchInput");
  const clearBtn=document.getElementById("paramSearchClear");
  if(input) input.value="";
  if(clearBtn) clearBtn.hidden=true;
}

function getParamMobileAccentState(param){
  if(getTypeCategory(param && (param.is_star || param.type))==="control") return "control";
  const proofStates=[
    normalizeProofMark(param && param.image_proof).status,
    normalizeProofMark(param && param.qualification_proof).status
  ].filter(Boolean);
  const supportStates=getVendorSupportEntries(param).map(([,value])=>getSupportStatusClass(value));
  const states=[...proofStates,...supportStates];
  if(states.includes("fail")) return "fail";
  if(states.includes("partial")) return "partial";
  if(states.includes("unknown") || states.length===0) return "missing";
  if(states.includes("ok")) return "ok";
  return "missing";
}

function createParamItem(param,isSelected){
  const card=document.createElement("div");
  card.className="param-item"+(isSelected ? " selected" : "");
  card.dataset.paramId=String(param.id);
  card.dataset.mobileAccent=getParamMobileAccentState(param);
  const isBasicProject=isBasicParameterProject(param);
  if(isBasicProject){
    card.classList.add("basic-project-param");
  }

  const checkbox=document.createElement("input");
  checkbox.type="checkbox";
  checkbox.checked=isSelected;
  checkbox.addEventListener("change",()=>toggle(param.id,checkbox.checked));

  const main=document.createElement("div");
  main.className="param-main";

  const head=document.createElement("div");
  head.className="param-head";

  const typeText=toText(param.is_star || param.type);
  const typeCategory=getTypeCategory(typeText);

  const title=document.createElement("div");
  title.className="param-title";
  title.textContent=toText(param.title,"无标题");
  if(typeCategory==="control"){
    const controlTag=document.createElement("span");
    controlTag.className="title-control-tag";
    controlTag.textContent="控标";
    controlTag.title="控标项";
    title.appendChild(controlTag);
  }

  if(typeCategory==="control"){
    card.classList.add("control-item");
  }

  const content=document.createElement("div");
  content.className="param-content";
  const displayContent=Object.prototype.hasOwnProperty.call(state.editedContentByParamId,param.id)
    ? state.editedContentByParamId[param.id]
    : param.content;
  content.textContent=toText(displayContent);

  head.appendChild(title);

  if(!isBasicProject){
    const imageProofBadge=createProofBadge("图像",param.image_proof);
    const qualificationProofBadge=createProofBadge("资质",param.qualification_proof);
    const type=document.createElement("div");
    type.className="param-type";
    if(typeText && typeCategory){
      type.classList.add(`type-${typeCategory}`);
    }else if(!typeText){
      type.classList.add("missing");
    }
    type.textContent=typeText || "类型:-";
    const vendorSupportList=createVendorSupportList(param);
    const statusRow=document.createElement("div");
    statusRow.className="param-status-row";
    if(!vendorSupportList){
      statusRow.classList.add("no-vendor");
    }
    statusRow.appendChild(imageProofBadge);
    statusRow.appendChild(qualificationProofBadge);
    statusRow.appendChild(type);
    if(vendorSupportList){
      statusRow.appendChild(vendorSupportList);
    }
    head.appendChild(statusRow);
  }

  main.appendChild(head);
  main.appendChild(content);

  appendParamDetails(main,param);

  card.appendChild(checkbox);
  card.appendChild(main);

  card.addEventListener("click",event=>{
    if(event.target===checkbox) return;
    toggle(param.id);
  });

  return card;
}

function createCollapsibleGroup(className,title,count,bodyBuilder){
  const group=document.createElement("div");
  group.className=className;
  const head=document.createElement("button");
  head.type="button";
  head.className=`${className}-head`;
  const titleEl=document.createElement("span");
  titleEl.className="param-group-title";
  titleEl.textContent=`▼ ${title}`;
  const countEl=document.createElement("span");
  countEl.className="param-group-count";
  countEl.textContent=`${count} 条`;
  head.appendChild(titleEl);
  head.appendChild(countEl);
  const body=document.createElement("div");
  body.className=`${className}-body`;
  bodyBuilder(body);
  head.addEventListener("click",()=>{
    const collapsed=group.classList.toggle("collapsed");
    titleEl.textContent=`${collapsed ? "▶" : "▼"} ${title}`;
  });
  group.appendChild(head);
  group.appendChild(body);
  return group;
}

function getParamGroupKey(type,...parts){
  return [type,...parts].map(part=>encodeURIComponent(toText(part))).join("::");
}

function isParamGroupCollapsed(key){
  return Boolean(state.paramGroupCollapsed && state.paramGroupCollapsed[key]);
}

function setParamGroupCollapsed(key,collapsed){
  state.paramGroupCollapsed={...state.paramGroupCollapsed,[key]:collapsed};
}

function buildParamModuleMap(){
  const moduleMap=new Map();
  getFilteredCurrentParams().forEach(param=>{
    const moduleName=toText(param.module).trim() || "未分项目";
    const functionName=toText(param.function_item).trim() || "未分功能项";
    if(!moduleMap.has(moduleName)){
      moduleMap.set(moduleName,new Map());
    }
    const functionMap=moduleMap.get(moduleName);
    if(!functionMap.has(functionName)){
      functionMap.set(functionName,[]);
    }
    functionMap.get(functionName).push(param);
  });
  return moduleMap;
}

function estimateParamVirtualRowHeight(row){
  if(row.type==="module") return PARAM_ROW_HEIGHTS.module;
  if(row.type==="function") return PARAM_ROW_HEIGHTS.function;
  const contentLength=toText(row.param && row.param.content).length;
  const base=isMobileViewport() ? PARAM_ROW_HEIGHTS.paramMobile : PARAM_ROW_HEIGHTS.paramDesktop;
  const charsPerLine=isMobileViewport() ? 24 : 76;
  const lineHeight=isMobileViewport() ? 24 : 18;
  return Math.min(isMobileViewport() ? 330 : 230,base + Math.max(0,Math.ceil(contentLength/charsPerLine)-2)*lineHeight);
}

function buildParamVirtualRows(){
  const rows=[];
  if(state.paramVirtualNodeCache && typeof state.paramVirtualNodeCache.clear==="function"){
    state.paramVirtualNodeCache.clear();
  }
  const moduleMap=buildParamModuleMap();
  moduleMap.forEach((functionMap,moduleName)=>{
    const moduleCount=[...functionMap.values()].reduce((sum,items)=>sum+items.length,0);
    const moduleKey=getParamGroupKey("module",moduleName);
    const moduleCollapsed=isParamGroupCollapsed(moduleKey);
    rows.push({type:"module",key:moduleKey,title:moduleName,count:moduleCount,collapsed:moduleCollapsed});
    if(moduleCollapsed) return;
    functionMap.forEach((params,functionName)=>{
      const functionKey=getParamGroupKey("function",moduleName,functionName);
      const functionCollapsed=isParamGroupCollapsed(functionKey);
      rows.push({type:"function",key:functionKey,moduleName,title:functionName,count:params.length,collapsed:functionCollapsed});
      if(functionCollapsed) return;
      params.forEach(param=>{
        rows.push({type:"param",key:`param::${param.id}`,param});
      });
    });
  });

  let offset=0;
  rows.forEach(row=>{
    row.estimatedHeight=estimateParamVirtualRowHeight(row);
    row.offset=offset;
    offset+=row.estimatedHeight;
  });
  state.paramVirtualRows=rows;
  state.paramVirtualTotalHeight=offset;
  state.paramVirtualRangeKey="";
  return rows;
}

function findParamVirtualStartIndex(rows,viewportTop){
  let low=0;
  let high=rows.length;
  while(low<high){
    const mid=(low+high)>>1;
    if(rows[mid].offset+rows[mid].estimatedHeight<viewportTop){
      low=mid+1;
    }else{
      high=mid;
    }
  }
  return low;
}

function findParamVirtualEndIndex(rows,viewportBottom){
  let low=0;
  let high=rows.length;
  while(low<high){
    const mid=(low+high)>>1;
    if(rows[mid].offset<viewportBottom){
      low=mid+1;
    }else{
      high=mid;
    }
  }
  return low;
}

function ensureParamVirtualScrollBound(list){
  if(state.paramVirtualScrollBound) return;
  list.addEventListener("scroll",scheduleParamVirtualRender,{passive:true});
  window.addEventListener("resize",scheduleParamVirtualRender);
  state.paramVirtualScrollBound=true;
}

function scheduleParamVirtualRender(){
  if(state.paramVirtualRenderFrame) return;
  state.paramVirtualRenderFrame=requestAnimationFrame(()=>{
    state.paramVirtualRenderFrame=null;
    renderParamVirtualWindow();
  });
}

function createParamVirtualGroupRow(row){
  const group=document.createElement("div");
  group.className=row.type==="module" ? "param-group param-virtual-group" : "param-subgroup param-virtual-group";
  group.dataset.groupKey=row.key;
  const head=document.createElement("button");
  head.type="button";
  head.className=row.type==="module" ? "param-group-head" : "param-subgroup-head";
  const titleEl=document.createElement("span");
  titleEl.className="param-group-title";
  titleEl.textContent=`${row.collapsed ? "▶" : "▼"} ${row.title}`;
  const countEl=document.createElement("span");
  countEl.className="param-group-count";
  countEl.textContent=`${row.count} 条`;
  head.appendChild(titleEl);
  head.appendChild(countEl);
  head.addEventListener("click",()=>{
    setParamGroupCollapsed(row.key,!row.collapsed);
    renderParamList({preserveScroll:true});
  });
  group.appendChild(head);
  return group;
}

function getParamItemRenderSignature(param){
  const displayContent=Object.prototype.hasOwnProperty.call(state.editedContentByParamId,param.id)
    ? state.editedContentByParamId[param.id]
    : param.content;
  return [
    param.id,
    param.title,
    param.is_star || param.type,
    displayContent,
    param.image_proof,
    param.qualification_proof
  ].map(item=>toText(item)).join("\u001f");
}

function setParamItemSelectionState(item,isSelected){
  if(!item) return;
  item.classList.toggle("selected",isSelected);
  const checkbox=item.querySelector("input[type='checkbox']");
  if(checkbox) checkbox.checked=isSelected;
}

function getParamVirtualItem(row,isSelected){
  const param=row.param;
  const cache=state.paramVirtualNodeCache;
  const cacheKey=String(param.id);
  const signature=getParamItemRenderSignature(param);
  let item=cache && cache.get(cacheKey);
  if(!item || item.dataset.renderSignature!==signature){
    item=createParamItem(param,isSelected);
    item.dataset.renderSignature=signature;
    if(cache) cache.set(cacheKey,item);
  }
  item.classList.add("param-virtual-row");
  setParamItemSelectionState(item,isSelected);
  return item;
}

function renderParamVirtualWindow(){
  const list=document.getElementById("paramList");
  if(!list) return;
  const rows=state.paramVirtualRows || [];
  if(!rows.length && normalizeMatchText(state.paramSearchQuery)){
    const rangeKey="empty-search:"+state.paramSearchQuery;
    if(rangeKey===state.paramVirtualRangeKey) return;
    const empty=document.createElement("div");
    empty.className="empty-hint param-empty-search";
    empty.textContent="暂无匹配参数";
    list.replaceChildren(empty);
    state.paramVirtualRangeKey=rangeKey;
    return;
  }
  const viewportTop=Math.max(0,list.scrollTop-PARAM_VIRTUAL_OVERSCAN);
  const viewportBottom=list.scrollTop+list.clientHeight+PARAM_VIRTUAL_OVERSCAN;
  const startIndex=findParamVirtualStartIndex(rows,viewportTop);
  const endIndex=findParamVirtualEndIndex(rows,viewportBottom);
  const selectedIds=new Set(state.selected.map(item=>item.id));
  const topHeight=startIndex<rows.length ? rows[startIndex].offset : 0;
  const renderedRows=rows.slice(startIndex,endIndex);
  const bottomStart=renderedRows.length
    ? renderedRows[renderedRows.length-1].offset+renderedRows[renderedRows.length-1].estimatedHeight
    : topHeight;
  const bottomHeight=Math.max(0,(state.paramVirtualTotalHeight || 0)-bottomStart);
  const rangeKey=[startIndex,endIndex,topHeight,bottomHeight].join(":");
  if(rangeKey===state.paramVirtualRangeKey) return;
  const desiredScrollTop=list.scrollTop;
  const fragment=document.createDocumentFragment();
  const topSpacer=document.createElement("div");
  topSpacer.className="param-virtual-spacer";
  topSpacer.style.height=`${topHeight}px`;
  fragment.appendChild(topSpacer);
  renderedRows.forEach(row=>{
    if(row.type==="param"){
      fragment.appendChild(getParamVirtualItem(row,selectedIds.has(row.param.id)));
    }else{
      fragment.appendChild(createParamVirtualGroupRow(row));
    }
  });
  const bottomSpacer=document.createElement("div");
  bottomSpacer.className="param-virtual-spacer";
  bottomSpacer.style.height=`${bottomHeight}px`;
  fragment.appendChild(bottomSpacer);
  list.replaceChildren(fragment);
  state.paramVirtualRangeKey=rangeKey;
  if(Math.abs(list.scrollTop-desiredScrollTop)>1){
    const maxScrollTop=Math.max(0,list.scrollHeight-list.clientHeight);
    list.scrollTop=Math.min(desiredScrollTop,maxScrollTop);
  }
}

function renderParamList(){
  const list=document.getElementById("paramList");
  const stats=getCurrentProductStats();
  const filteredCount=getFilteredCurrentParams().length;
  const hasSearch=Boolean(normalizeMatchText(state.paramSearchQuery));
  document.getElementById("paramCount").innerText=hasSearch ? `${filteredCount}/${stats.totalCount} 个` : stats.totalCount+" 个";
  const scrollTop=list.scrollTop;
  buildParamVirtualRows();
  ensureParamVirtualScrollBound(list);
  list.scrollTop=hasSearch ? 0 : scrollTop;
  renderParamVirtualWindow();
}

function getCurrentCatalogParamById(paramId){
  const targetId=String(paramId);
  return state.currentParams.find(item=>String(item.id)===targetId) || null;
}

function expandParamGroupsForParam(param){
  const moduleName=toText(param.module).trim() || "未分项目";
  const functionName=toText(param.function_item).trim() || "未分功能项";
  const moduleKey=getParamGroupKey("module",moduleName);
  const functionKey=getParamGroupKey("function",moduleName,functionName);
  let changed=false;
  if(isParamGroupCollapsed(moduleKey)){
    setParamGroupCollapsed(moduleKey,false);
    changed=true;
  }
  if(isParamGroupCollapsed(functionKey)){
    setParamGroupCollapsed(functionKey,false);
    changed=true;
  }
  return changed;
}

function findParamVirtualRowByParamId(paramId){
  const targetId=String(paramId);
  return (state.paramVirtualRows || []).find(row=>row.type==="param" && String(row.param && row.param.id)===targetId) || null;
}

function highlightLocatedParam(paramId){
  const list=document.getElementById("paramList");
  if(!list) return;
  list.querySelectorAll(".param-locate-highlight").forEach(item=>item.classList.remove("param-locate-highlight"));
  if(state.paramLocateHighlightTimer){
    clearTimeout(state.paramLocateHighlightTimer);
    state.paramLocateHighlightTimer=null;
  }
  const item=list.querySelector(`.param-item[data-param-id="${paramId}"]`);
  if(!item) return;
  item.setAttribute("tabindex","-1");
  item.classList.add("param-locate-highlight");
  item.focus({preventScroll:true});
  state.paramLocateHighlightTimer=setTimeout(()=>{
    item.classList.remove("param-locate-highlight");
    state.paramLocateHighlightTimer=null;
  },1800);
}

function getParamLocateTopPadding(){
  return isMobileViewport() ? PARAM_LOCATE_TOP_PADDING_MOBILE : PARAM_LOCATE_TOP_PADDING_DESKTOP;
}

function keepLocatedParamClearOfTop(paramId){
  const list=document.getElementById("paramList");
  if(!list) return;
  const item=list.querySelector(`.param-item[data-param-id="${paramId}"]`);
  if(!item) return;
  const safeTop=getParamLocateTopPadding();
  const listRect=list.getBoundingClientRect();
  const itemRect=item.getBoundingClientRect();
  const itemTop=itemRect.top-listRect.top;
  if(itemTop<safeTop){
    list.scrollTop=Math.max(0,list.scrollTop-(safeTop-itemTop));
    renderParamVirtualWindow();
  }
}

function scrollParamLibraryToParam(param,anchorEl){
  const list=document.getElementById("paramList");
  if(!list) return;
  const catalogParam=getCurrentCatalogParamById(param && param.id);
  if(!catalogParam){
    showToast("该参数不是来自左侧参数库，无法定位。","info",anchorEl);
    return;
  }
  if(normalizeMatchText(state.paramSearchQuery) && !getFilteredCurrentParams().some(item=>String(item.id)===String(catalogParam.id))){
    clearParamSearchControlsOnly();
  }
  const groupsChanged=expandParamGroupsForParam(catalogParam);
  if(groupsChanged || !(state.paramVirtualRows && state.paramVirtualRows.length)){
    renderParamList();
  }
  let row=findParamVirtualRowByParamId(catalogParam.id);
  if(!row){
    buildParamVirtualRows();
    row=findParamVirtualRowByParamId(catalogParam.id);
  }
  if(!row){
    showToast("未在当前参数库分类中找到该参数。","info",anchorEl);
    return;
  }
  const targetTop=Math.max(0,row.offset-getParamLocateTopPadding());
  list.scrollTop=targetTop;
  renderParamVirtualWindow();
  requestAnimationFrame(()=>{
    keepLocatedParamClearOfTop(catalogParam.id);
    requestAnimationFrame(()=>highlightLocatedParam(catalogParam.id));
  });
}

function locateSelectedParamInLibrary(param,anchorEl){
  if(!param || param.isCustom){
    showToast("自定义参数没有左侧参数库来源，无法定位。","info",anchorEl);
    return;
  }
  if(isMobileViewport() && state.mobileTab!=="select" && typeof setMobileTab==="function"){
    setMobileTab("select");
    requestAnimationFrame(()=>scrollParamLibraryToParam(param,anchorEl));
    return;
  }
  scrollParamLibraryToParam(param,anchorEl);
}

function updateParamItemSelection(paramId,isSelected){
  const item=document.querySelector(`.param-item[data-param-id="${paramId}"]`);
  if(!item) return;
  setParamItemSelectionState(item,isSelected);
}

function syncParamSelectionStates(){
  const selectedIds=new Set(state.selected.map(item=>String(item.id)));
  document.querySelectorAll("#paramList .param-item").forEach(item=>{
    const checked=selectedIds.has(item.dataset.paramId);
    setParamItemSelectionState(item,checked);
  });
}

function toggle(id,forceSelected){
  const param=state.currentParams.find(item=>item.id===id);
  if(!param) return;

  const index=state.selected.findIndex(item=>item.id===id);
  const shouldSelect=typeof forceSelected==="boolean" ? forceSelected : index===-1;
  if(shouldSelect){
    const instance=ensureActiveInstanceForCurrentProduct();
    if(!instance) return;
  }

  if(shouldSelect && index===-1){
    const content=Object.prototype.hasOwnProperty.call(state.editedContentByParamId,id)
      ? state.editedContentByParamId[id]
      : param.content;
    state.selected.push({
      ...param,
      content:normalizeParamContentValue(content),
      prefix_symbol:""
    });
  }
  if(!shouldSelect && index!==-1){
    state.selected.splice(index,1);
  }

  updateParamItemSelection(id,shouldSelect);
  renderEditArea();
  schedulePreviewUpdate();
  updateMobileContext();
}

function renderEditArea(){
  const area=document.getElementById("editArea");
  area.innerHTML="";
  document.getElementById("selectedCount").innerText=state.selected.length+" 条";
  pruneBatchSelection();
  renderInstancePanel();
  updateMobileContext();

  if(state.selected.length===0){
    updateBatchToolbarState();
    const empty=document.createElement("div");
    empty.className="empty-hint";
    empty.textContent="暂未选择参数";
    area.appendChild(empty);
    return;
  }

  const fragment=document.createDocumentFragment();

  state.selected.forEach((param,index)=>{
    const card=document.createElement("div");
    card.className="edit-card";
    const typeCategory=getTypeCategory(param.is_star || param.type);
    if(typeCategory==="control"){
      card.classList.add("control-card");
    }

    const toolbar=document.createElement("div");
    toolbar.className="edit-toolbar";

    const left=document.createElement("div");
    left.className="edit-toolbar-left";
    const title=document.createElement("button");
    title.type="button";
    title.className="edit-toolbar-title edit-locate-btn";
    title.textContent=`参数 ${index+1}`;
    title.title=param.isCustom ? "自定义参数没有左侧参数库来源" : "定位到左侧参数库";
    title.disabled=Boolean(param.isCustom);
    if(!param.isCustom){
      title.addEventListener("click",event=>locateSelectedParamInLibrary(param,event.currentTarget));
    }
    const typeBadge=document.createElement("span");
    typeBadge.className="edit-type-badge";
    if(typeCategory){
      typeBadge.classList.add(`type-${typeCategory}`);
    }
    typeBadge.textContent=getShortTypeLabel(param);
    typeBadge.title=toText(param.is_star || param.type).trim() || (param.isCustom ? "自定义" : "其他项");
    const prefixToggle=document.createElement("div");
    prefixToggle.className="prefix-toggle";
    [
      {label:"无",value:""},
      {label:"▲",value:"▲"},
      {label:"★",value:"★"}
    ].forEach(option=>{
      const button=document.createElement("button");
      button.type="button";
      button.className="prefix-toggle-btn"+(toText(param.prefix_symbol)===option.value ? " active" : "");
      button.textContent=option.label;
      button.title=option.value ? `使用 ${option.value} 作为前缀` : "不加前缀符号";
      button.addEventListener("click",()=>setParamPrefixSymbol(index,option.value));
      prefixToggle.appendChild(button);
    });
    const batchCheck=document.createElement("button");
    batchCheck.type="button";
    batchCheck.className="edit-batch-pick"+(state.batchSelectedParamIds instanceof Set && state.batchSelectedParamIds.has(String(param.id)) ? " active" : "");
    batchCheck.title="勾选";
    batchCheck.setAttribute("aria-label",`勾选参数 ${index+1}`);
    batchCheck.setAttribute("aria-pressed",state.batchSelectedParamIds instanceof Set && state.batchSelectedParamIds.has(String(param.id)) ? "true" : "false");
    batchCheck.addEventListener("click",event=>{
      const next=!batchCheck.classList.contains("active");
      batchCheck.classList.toggle("active",next);
      batchCheck.setAttribute("aria-pressed",next ? "true" : "false");
      toggleBatchParamSelection(param.id,next);
    });
    toolbar.appendChild(batchCheck);
    left.appendChild(title);
    left.appendChild(typeBadge);
    left.appendChild(prefixToggle);

    const right=document.createElement("div");
    right.className="edit-toolbar-right";

    const setIconButton=(button,label,icon)=>{
      button.classList.add("icon-only");
      button.title=label;
      button.setAttribute("aria-label",label);
      button.textContent=icon;
    };

    const topBtn=document.createElement("button");
    topBtn.className="icon-btn icon-top";
    setIconButton(topBtn,"置顶","⇈");
    topBtn.addEventListener("click",event=>moveTop(index,event.currentTarget));

    const upBtn=document.createElement("button");
    upBtn.className="icon-btn icon-up";
    setIconButton(upBtn,"上移","↑");
    upBtn.addEventListener("click",event=>moveUp(index,event.currentTarget));

    const downBtn=document.createElement("button");
    downBtn.className="icon-btn icon-down";
    setIconButton(downBtn,"下移","↓");
    downBtn.addEventListener("click",event=>moveDown(index,event.currentTarget));

    const bottomBtn=document.createElement("button");
    bottomBtn.className="icon-btn icon-bottom";
    setIconButton(bottomBtn,"置底","⇊");
    bottomBtn.addEventListener("click",event=>moveBottom(index,event.currentTarget));

    const delBtn=document.createElement("button");
    delBtn.className="icon-btn icon-danger";
    setIconButton(delBtn,"删除","×");
    delBtn.addEventListener("click",event=>confirmRemoveItem(index,event));

    const textarea=document.createElement("textarea");
    textarea.placeholder="编辑参数内容...";
    textarea.rows=1;
    textarea.value=getPrefixedParamContent(param);
    textarea.addEventListener("input",event=>{
      autoResizeEditTextarea(event.target);
      editContent(index,event.target.value);
    });

    const rewriteBtn=document.createElement("button");
    rewriteBtn.className="icon-btn icon-ai";
    rewriteBtn.title="AI改写";
    rewriteBtn.textContent="AI改写";
    rewriteBtn.addEventListener("click",event=>openRewriteModePopover(index,event.currentTarget));

    right.appendChild(rewriteBtn);
    right.appendChild(topBtn);
    right.appendChild(upBtn);
    right.appendChild(downBtn);
    right.appendChild(bottomBtn);
    right.appendChild(delBtn);
    toolbar.appendChild(left);
    toolbar.appendChild(right);
    card.appendChild(toolbar);

    if(!param.isCustom){
      const metaLines=[];
      const moduleText=toText(param.requires_module).trim();
      const remarkText=toText(param.remark).trim();
      const supportEntries=getVendorSupportEntries(param);
      const supportText=supportEntries
        .map(([vendor,value])=>`${vendor}: ${normalizeSupportValue(value)}`)
        .join("；");
      if(supportEntries.length){
        metaLines.push(`需要购买模块：${moduleText || "无"}`);
        metaLines.push(`备注：${remarkText || "无"}`);
        metaLines.push(`其他厂商支持情况：${supportText}`);
      }else{
        if(isMeaningfulMetaText(moduleText)){
          metaLines.push(`需要购买模块：${moduleText}`);
        }
        if(isMeaningfulMetaText(remarkText)){
          metaLines.push(`备注：${remarkText}`);
        }
      }
      if(metaLines.length){
        const remark=document.createElement("div");
        remark.className="edit-remark";
        remark.textContent=metaLines.join("\n");
        card.appendChild(remark);
      }
    }

    card.appendChild(textarea);
    fragment.appendChild(card);
  });

  area.appendChild(fragment);
  area.querySelectorAll(".edit-card textarea").forEach(autoResizeEditTextarea);
  updateBatchToolbarState();
}

function editContent(index,value){
  const selectedItem=state.selected[index];
  if(!selectedItem) return;
  const normalizedValue=normalizeParamContentValue(value);
  selectedItem.content=normalizedValue;
  state.editedContentByParamId[selectedItem.id]=normalizedValue;
  schedulePreviewUpdate();
}

function isMeaningfulMetaText(value){
  const text=toText(value).trim();
  if(!text) return false;
  return !["无","-","未知","待确认","不涉及"].includes(text);
}

function autoResizeEditTextarea(textarea){
  if(!textarea) return;
  if(!(state.pendingTextareaResizes instanceof Set)){
    state.pendingTextareaResizes=new Set();
  }
  state.pendingTextareaResizes.add(textarea);
  if(state.textareaResizeFrame) return;
  state.textareaResizeFrame=requestAnimationFrame(()=>{
    state.textareaResizeFrame=null;
    const pending=[...state.pendingTextareaResizes].filter(node=>node && node.isConnected);
    state.pendingTextareaResizes.clear();
    pending.forEach(node=>{
      node.style.height="0px";
      node.style.height=`${Math.max(38,node.scrollHeight)}px`;
    });
  });
}

function setParamPrefixSymbol(index,symbol){
  const selectedItem=state.selected[index];
  if(!selectedItem) return;
  selectedItem.prefix_symbol=symbol;
  renderEditArea();
  schedulePreviewUpdate();
}

function createCustomParamId(){
  const instance=getActiveInstance();
  if(!instance){
    return `custom_${Date.now()}_0`;
  }
  const id=`custom_${instance.id}_${Date.now()}_${instance.customParamSeed}`;
  instance.customParamSeed+=1;
  return id;
}

function addCustomParam(event){
  const anchor=getEventAnchor(event);
  if(!state.currentProductId){
    showToast("请先选择一个产品","error",anchor);
    return;
  }
  const instance=getActiveInstance() || ensureActiveInstanceForCurrentProduct();
  if(!instance) return;

  const customId=createCustomParamId();
  const customParam={
    id:customId,
    title:"自定义参数",
    content:"",
    prefix_symbol:"",
    type:"",
    is_star:"",
    image_proof:"",
    qualification_proof:"",
    remark:"",
    product_id:state.currentProductId,
    instance_id:instance ? instance.id : "",
    isCustom:true
  };

  state.selected.push(customParam);
  state.editedContentByParamId[customId]="";
  renderEditArea();
  schedulePreviewUpdate();
  showToast("已新增空白参数","success",anchor);
  if(isMobileViewport()){
    setMobileTab("edit");
  }
}

function moveTop(index,anchorEl=null){
  if(index===0){
    showToast("已在最上方","error",anchorEl);
    return;
  }
  const [item]=state.selected.splice(index,1);
  state.selected.unshift(item);
  renderEditArea();
  schedulePreviewUpdate();
}

function moveUp(index,anchorEl=null){
  if(index===0){
    showToast("已是第一个参数","error",anchorEl);
    return;
  }
  [state.selected[index-1],state.selected[index]]=[state.selected[index],state.selected[index-1]];
  renderEditArea();
  schedulePreviewUpdate();
}

function moveDown(index,anchorEl=null){
  if(index===state.selected.length-1){
    showToast("已是最后一个参数","error",anchorEl);
    return;
  }
  [state.selected[index+1],state.selected[index]]=[state.selected[index],state.selected[index+1]];
  renderEditArea();
  schedulePreviewUpdate();
}

function moveBottom(index,anchorEl=null){
  if(index===state.selected.length-1){
    showToast("已在最下方","error",anchorEl);
    return;
  }
  const [item]=state.selected.splice(index,1);
  state.selected.push(item);
  renderEditArea();
  schedulePreviewUpdate();
}

function removeItem(index){
  state.selected.splice(index,1);
  syncParamSelectionStates();
  renderEditArea();
  schedulePreviewUpdate();
}

function schedulePreviewUpdate(){
  state.previewUpdatePending=true;
  if(state.previewUpdateTimer){
    clearTimeout(state.previewUpdateTimer);
  }
  state.previewUpdateTimer=setTimeout(()=>{
    state.previewUpdateTimer=null;
    flushPreviewUpdate();
  },PREVIEW_UPDATE_DELAY_MS);
}

function flushPreviewUpdate(){
  if(state.previewUpdateTimer){
    clearTimeout(state.previewUpdateTimer);
    state.previewUpdateTimer=null;
  }
  if(!state.previewUpdatePending) return;
  state.previewUpdatePending=false;
  updatePreview();
}

function updatePreview(){
  const lines=[];
  let totalCount=0;
  let controlCount=0;
  let starCount=0;
  let triangleCount=0;
  const vendorCounts=new Map();

  state.instances.forEach(instance=>{
    if(!instance.selected || instance.selected.length===0) return;
    const product=getProductById(instance.productId);
    const headerName=toText(instance.name).trim() || toText(product && product.name, "未命名产品");
    lines.push(`【${headerName}】`);

    instance.selected.forEach((param,index)=>{
      lines.push(`${index+1}. ${getPrefixedParamContent(param)}`);
      totalCount++;
      if(toText(param.prefix_symbol).trim()==="★"){
        starCount++;
      }else if(toText(param.prefix_symbol).trim()==="▲"){
        triangleCount++;
      }
      getVendorSupportEntries(param).forEach(([vendor,value])=>{
        const normalizedVendor=toText(vendor).trim();
        if(!normalizedVendor || normalizedVendor==="-") return;
        if(!vendorCounts.has(normalizedVendor)){
          vendorCounts.set(normalizedVendor,0);
        }
        if(normalizeSupportValue(value)==="满足"){
          vendorCounts.set(normalizedVendor,(vendorCounts.get(normalizedVendor) || 0)+1);
        }
      });
      if(getTypeCategory(param.is_star || param.type)==="control"){
        controlCount++;
      }
    });
    lines.push("");
  });

  const text=lines.join("\n").trim();
  setPreviewTextAndCounts(text,totalCount,controlCount);
  updatePreviewScore({
    totalCount,
    vendorSatisfiedCounts:vendorCounts,
    starCount,
    triangleCount
  });
  scheduleDraftSave();
}

function setPreviewTextAndCounts(text,totalCount,controlCount){
  document.getElementById("preview").innerText=text || "（暂无内容）";
  const previewTotalCount=document.getElementById("previewTotalCount");
  const previewControlCount=document.getElementById("previewControlCount");
  if(previewTotalCount) previewTotalCount.innerText=String(totalCount);
  if(previewControlCount) previewControlCount.innerText=String(controlCount);
}

function updatePreviewScore(stats){
  const totalEl=document.getElementById("scoreTotalCount");
  const vendorListEl=document.getElementById("scoreVendorSatisfiedList");
  const starEl=document.getElementById("scoreStarCount");
  const triangleEl=document.getElementById("scoreTriangleCount");
  if(totalEl) totalEl.innerText=String(stats.totalCount || 0);
  if(vendorListEl){
    vendorListEl.innerHTML="";
    const entries=stats.vendorSatisfiedCounts instanceof Map
      ? [...stats.vendorSatisfiedCounts.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],"zh-CN"))
      : [];
    if(entries.length===0){
      const empty=document.createElement("span");
      empty.className="preview-score-vendor-chip";
      empty.textContent="无";
      vendorListEl.appendChild(empty);
    }else{
      entries.forEach(([vendor,count])=>{
        const chip=document.createElement("span");
        chip.className="preview-score-vendor-chip";
        chip.innerHTML=`${escapeHtml(vendor)} <strong>${count}</strong>`;
        vendorListEl.appendChild(chip);
      });
    }
  }
  if(starEl) starEl.innerText=String(stats.starCount || 0);
  if(triangleEl) triangleEl.innerText=String(stats.triangleCount || 0);
}

function escapeHtml(text){
  return toText(text)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function textToWordHtml(text){
  return escapeHtml(text).replace(/\n/g,"<br>");
}

function getWordExportText(){
  flushPreviewUpdate();
  const preview=document.getElementById("preview");
  return toText(preview && preview.innerText).trim();
}

function buildWordFileName(){
  const now=new Date();
  const yyyy=String(now.getFullYear());
  const mm=String(now.getMonth()+1).padStart(2,"0");
  const dd=String(now.getDate()).padStart(2,"0");
  const hh=String(now.getHours()).padStart(2,"0");
  const min=String(now.getMinutes()).padStart(2,"0");
  return `招标参数_多产品_${yyyy}${mm}${dd}_${hh}${min}.doc`;
}

function buildWordDocumentHtml(text){
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="AI参数系统">
<style>
body{font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;font-size:12pt;line-height:1.7;color:#1f2937;padding:16px;}
</style>
</head>
<body>
${textToWordHtml(text)}
</body>
</html>`;
}

function repairWordExportText(text){
  const repairs=[];
  let output=toText(text);
  const rules=[
    [/10\/100\/1000Base-T自适应电口|10\/100\/1000Base-T|1000Base-T|RJ45千兆口/g,"千兆电口","标准化千兆电口"],
    [/10\/100Base-T/g,"百兆电口","标准化百兆电口"],
    [/SFP\+|10GE|10G光口/g,"万兆光口","标准化万兆光口"],
    [/SFP(?![A-Za-z+])/g,"千兆光口","标准化千兆光口"],
    [/千兆千兆/g,"千兆","修复重复网口词"],
    [/万兆万兆/g,"万兆","修复重复网口词"],
    [/光口光口/g,"光口","修复重复网口词"],
    [/电口电口/g,"电口","修复重复网口词"],
    [/网口网口/g,"网口","修复重复网口词"],
    [/自适应电口/g,"电口","删除自适应冗余词"],
    [/TBTB/g,"TB","修复重复容量单位"],
    [/GBGB/g,"GB","修复重复容量单位"],
    [/(\d+(?:\.\d+)?)TB\s*TB/g,"$1TB","修复重复容量单位"],
	    [/(\d+(?:\.\d+)?)GB\s*GB/g,"$1GB","修复重复容量单位"],
	    [/千兆光口≥0个[、，,；;]?|万兆光口≥0个[、，,；;]?|百兆电口≥0个[、，,；;]?/g,"","删除 0 值端口"],
	    [/[（(](?:单电源的话不写电源|没有选配不加这一项|普通和尊享取最大的|内部外部取最大|没有配备去掉这一项目)[)）]/g,"","删除模板维护说明"],
	    [/HTTP新建连接数/g,"每秒新建连接数","修复新建连接数字段名"],
	    [/DDR代际/g,"","删除未识别 DDR 代际占位"],
	    [/如发生部件变动以实际装配为准/g,"","删除维护说明"],
	    [/标准网口[：:]?\s*(\d+)\s*[*xX]\s*(百兆电口|千兆电口|千兆光口|万兆光口|25G光口|40G光口|100G光口)/g,"标准网口$2≥$1个","修复星号网口格式"],
	    [/(^|[，,；;\s])单电源($|[，,；;\s])/g,"，","删除单电源表述"]
	  ];
  rules.forEach(([regex,replacement,label])=>{
    const before=output;
    output=output.replace(regex,replacement);
    if(output!==before){
      repairs.push(label);
    }
  });
  return {
    text:output,
    repairs
  };
}

function validateWordExportQuality(text){
  const issues=[];
  const raw=toText(text);
  let currentProduct="";
  raw.split(/\n+/).forEach(line=>{
    const trimmed=line.trim();
    if(!trimmed) return;
    const productMatch=trimmed.match(/^【(.+)】$/);
    if(productMatch){
      currentProduct=productMatch[1];
      return;
    }
    const paramMatch=trimmed.match(/^(\d+)[.、．]\s*(.+)$/);
    const label=currentProduct
      ? `【${currentProduct}】${paramMatch ? `第${paramMatch[1]}条` : ""}`
      : "全文";
    const content=paramMatch ? paramMatch[2] : trimmed;
    const checks=[
      [/【\s*】|【[^】]*(?:标准网口列表|设备高度|CPU|内存|硬盘|数量|容量|年限|主频|架构|授权|x|XX)[^】]*】/,"存在未填充的模板占位符"],
      [/(?:^|[^\w])(?:xx|XX)(?:[^\w]|$)|x口|XX业务|根据项目实际需求|【注意：|注意：/,"存在占位或维护说明"],
      [/千兆光口≥0个|万兆光口≥0个|百兆电口≥0个|电口≥0个|光口≥0个/,"存在 0 值网口片段"],
      [/10\/100\/1000Base-T|10\/100Base-T|1000Base-T|自适应电口|SFP\+?|Base-T|千兆（万兆）网口/,"存在未标准化的网口表述"],
      [/千兆千兆|万兆万兆|光口光口|电口电口|网口网口/,"存在重复拼接的网口词"],
	      [/TBTB|GBGB|TB\s*TB|GB\s*GB/,"存在重复容量单位"],
	      [/单电源的话不写电源|没有选配不加这一项|普通和尊享取最大的|内部外部取最大/,"存在模板维护说明"],
	      [/(^|[，,；;\s])单电源($|[，,；;\s])/,"基础参数中仍包含单电源"],
	      [/DDR代际/,"存在未识别 DDR 代际占位"],
	      [/HTTP新建连接数/,"新建连接数字段名未标准化"],
	      [/\d+\s*[*xX]\s*(百兆电口|千兆电口|千兆光口|万兆光口|25G光口|40G光口|100G光口)/,"网口未使用 ≥x个 格式"],
	      [/如发生部件变动以实际装配为准/,"存在维护免责声明"]
	    ];
    checks.forEach(([regex,message])=>{
      if(regex.test(content)){
        issues.push(`${label}：${message}：${content.slice(0,120)}`);
      }
    });
  });
	  state.instances.forEach(instance=>{
	    const product=getProductById(instance.productId);
	    const selectedList=Array.isArray(instance.selected) ? instance.selected : [];
	    const firstParam=selectedList[0] || null;
	    if(!firstParam || !/基础参数/.test(toText(firstParam.title))){
	      issues.push(`【${toText(instance.name || product && product.name).trim() || "未命名产品"}】：缺少第一条基础参数`);
	    }
	    const hardwareLike=selectedList.filter(param=>{
	      const text=[param && param.title,param && param.content].map(toText).join(" ");
      return /(基础参数|基础要求|基础规格|硬件规格|产品规格|单台配置|数量要求)/.test(text)
        && /(CPU|处理器|内存|硬盘|系统盘|缓存盘|数据盘|电源|电口|光口|网口|接口|机架式|ARM架构|USB|HDMI)/i.test(text);
    });
    if(hardwareLike.length>1){
      issues.push(`【${toText(instance.name || product && product.name).trim() || "未命名产品"}】：疑似存在重复硬件/基础参数`);
    }
  });
  return [...new Set(issues)];
}

function exportWord(event){
  const anchor=getEventAnchor(event);
  const text=getWordExportText();
  if(!text || text==="（暂无内容）"){
    showToast("请先添加参数内容","error",anchor);
    return;
  }
  const repaired=repairWordExportText(text);
  const qualityIssues=validateWordExportQuality(repaired.text);
  if(qualityIssues.length){
    const message=`导出已阻止，请先处理：\n${qualityIssues.slice(0,8).map((item,index)=>`${index+1}. ${item}`).join("\n")}`;
    console.warn("Word 导出质量校验未通过",qualityIssues);
    alert(message);
    showToast("导出前质量校验未通过","error",anchor);
    return;
  }

  if(repaired.repairs.length){
    showToast(`已自动修复 ${repaired.repairs.length} 类格式问题后导出`,"info",anchor);
  }
  const docHtml=buildWordDocumentHtml(repaired.text);
  const blob=new Blob(["\ufeff",docHtml],{type:"application/msword;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=buildWordFileName();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("Word 已导出","success",anchor);
}

function copyText(event){
  const anchor=getEventAnchor(event);
  flushPreviewUpdate();
  const text=document.getElementById("preview").innerText;
  if(!text || text==="（暂无内容）"){
    showToast("请先添加参数内容","error",anchor);
    return;
  }

  // 兼容性处理：现代浏览器使用 clipboard API，旧版或非 HTTPS 环境使用 execCommand
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text)
      .then(()=>showToast("✅ 已复制到剪贴板","success",anchor))
      .catch(err=>{
        console.error("复制失败:",err);
        fallbackCopy(text,anchor);
      });
  }else{
    fallbackCopy(text,anchor);
  }
}

// 降级复制方案（兼容非 HTTPS 环境）
function fallbackCopy(text,anchor){
  const textarea=document.createElement("textarea");
  textarea.value=text;
  textarea.style.position="fixed";
  textarea.style.opacity="0";
  document.body.appendChild(textarea);
  textarea.select();

  try{
    document.execCommand("copy");
    showToast("✅ 已复制到剪贴板","success",anchor);
  }catch(err){
    console.error("复制失败:",err);
    showToast("复制失败，请手动复制","error",anchor);
  }

  document.body.removeChild(textarea);
}

async function clearAll(event){
  const anchor=getEventAnchor(event);
  const confirmed=await confirmAtAnchor("确定要清空全部参数和多产品清单吗？",anchor);
  if(!confirmed){
    return;
  }

  state.instances=[];
  state.activeInstanceId=null;
  state.lastActiveInstanceByProduct={};
  state.instanceSeed=1;
  state.currentProductId=null;
  state.currentParams=[];
  state.selected=[];
  state.editedContentByParamId={};
  state.mobileSelectScrollByProduct={};

  syncParamSelectionStates();
  document.querySelectorAll(".product").forEach(item=>item.classList.remove("active"));
  renderProductMeta(null);
  renderParamList();
  renderEditArea();
  schedulePreviewUpdate();
  clearSavedDraft();
  showGuidePanel();
  updateMobileContext();
  if(isMobileViewport()){
    setMobileTab("home",true);
  }
  showToast("✨ 已清空参数与多产品清单","success",anchor);
}

const USAGE_CLIENT_STORAGE_KEY="csxt_usage_client_id";
const USAGE_SESSION_ID=`session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
const USAGE_HEARTBEAT_DELAY_MS=3500;
const USAGE_HEARTBEAT_INTERVAL_MS=60000;
let usageHeartbeatTimer=null;
let usageHeartbeatStarted=false;

function updateOnlineUserCount(count){
  const badge=document.getElementById("guideOnlineBadge");
  if(!badge) return;
  const value=Math.max(0,Number(count) || 0);
  badge.textContent=`当前在线 ${value} 人`;
  badge.hidden=false;
}

function createUsageId(prefix){
  if(window.crypto && crypto.randomUUID){
    return `${prefix}_${crypto.randomUUID().replace(/-/g,"")}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,12)}`;
}

function getUsageClientId(){
  try{
    let clientId=localStorage.getItem(USAGE_CLIENT_STORAGE_KEY);
    if(!clientId){
      clientId=createUsageId("client");
      localStorage.setItem(USAGE_CLIENT_STORAGE_KEY,clientId);
    }
    return clientId;
  }catch(err){
    return createUsageId("client");
  }
}

function getAnalyticsDeviceType(){
  if(isMobileViewport()) return "mobile";
  if(/ipad|tablet/i.test(navigator.userAgent || "")) return "tablet";
  return "desktop";
}

function sendAnalyticsEvent(payload){
  try{
    const body=JSON.stringify({
      clientId:getUsageClientId(),
      sessionId:USAGE_SESSION_ID,
      deviceType:getAnalyticsDeviceType(),
      ...payload,
      durationMs:Math.max(0,Math.round(Number(payload && payload.durationMs) || 0))
    });
    fetch("/api/analytics/event",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      cache:"no-store",
      keepalive:true,
      body
    }).catch(()=>{});
  }catch(err){
    // Statistics must never block the user's workflow.
  }
}

function sendUsageHeartbeat(){
  if(document.visibilityState==="hidden") return;
  const body=JSON.stringify({
    clientId:getUsageClientId(),
    sessionId:USAGE_SESSION_ID
  });
  fetch("/api/usage/heartbeat",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    cache:"no-store",
    keepalive:true,
    body
  })
    .then(res=>res.ok ? res.json() : null)
    .then(data=>{
      if(data && data.activeUsers!==undefined) updateOnlineUserCount(data.activeUsers);
    })
    .catch(()=>{});
}

function isUsageHeartbeatEnabled(){
  try{
    const params=new URLSearchParams(window.location.search);
    return params.get("usage") !== "0" && localStorage.getItem("csxt_usage_tracking_disabled") !== "1";
  }catch(err){
    return true;
  }
}

function startUsageHeartbeat(){
  if(usageHeartbeatStarted) return;
  if(!isUsageHeartbeatEnabled()) return;
  usageHeartbeatStarted=true;
  sendUsageHeartbeat();
  usageHeartbeatTimer=setInterval(sendUsageHeartbeat,USAGE_HEARTBEAT_INTERVAL_MS);
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible") sendUsageHeartbeat();
  });
}

function scheduleUsageHeartbeat(){
  const start=()=>setTimeout(startUsageHeartbeat,USAGE_HEARTBEAT_DELAY_MS);
  if("requestIdleCallback" in window){
    window.requestIdleCallback(start,{timeout:5000});
  }else if(document.readyState==="complete"){
    start();
  }else{
    window.addEventListener("load",start,{once:true});
  }
}

scheduleUsageHeartbeat();
