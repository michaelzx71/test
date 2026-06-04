const MOBILE_SCREENS=["source","manual","cart","work","format"];
const MOBILE_WORK_MODES=["select","sort","rewrite"];
const MOBILE_RECENT_PRODUCTS_KEY="csxt_mobile_recent_products";
const MOBILE_SCROLLABLE_SELECTOR=".mpw-scroll,.quote-confirm-list,.quote-confirm-panel,.ai-modal-panel,.mpw-preview-card pre,.mobile-menu";

let mobileRenderFrame=null;
let mobileSortDrag=null;
let mobileInstanceDrag=null;
let mobileSuppressNextClick=false;

function initMobileShell(){
  ensureMobileState();
  loadMobileRecentProducts();
  bindMobileWorkbenchEvents();
  bindMobileViewportLock();
  window.addEventListener("hashchange",()=>{
    if(!isMobileViewport()) return;
    const screen=getMobileScreenFromHash();
    if(screen) setMobileScreen(screen,{skipHash:true});
  });
  document.addEventListener("pointerdown",event=>{
    const menu=document.getElementById("mobileMoreMenu");
    const button=document.getElementById("mobileMoreBtn");
    if(document.body.classList.contains("mobile-menu-open")){
      if((menu && menu.contains(event.target)) || (button && button.contains(event.target))) return;
      closeMobileMoreMenu();
    }
  });
  updateMobileMode();
}

function bindMobileViewportLock(){
  if(document.documentElement.dataset.mobileViewportLocked==="true") return;
  document.documentElement.dataset.mobileViewportLocked="true";
  ["gesturestart","gesturechange","gestureend"].forEach(eventName=>{
    document.addEventListener(eventName,event=>{
      if(isMobileViewport()) event.preventDefault();
    },{passive:false});
  });
  // Mobile scrolling is intentionally left to the browser. Only pinch gestures
  // and explicit drag-handle sorting block defaults, so cards can scroll,
  // tap, and horizontally pan without fighting global touch handlers.
  document.addEventListener("touchmove",event=>{
    if(!isMobileViewport()) return;
    if(event.touches && event.touches.length>1) event.preventDefault();
  },{passive:false});
  document.addEventListener("wheel",event=>{
    if(!isMobileViewport()) return;
    if(event.ctrlKey || event.metaKey){
      event.preventDefault();
    }
  },{passive:false});
}

function bindMobileWorkbenchEvents(){
  const root=document.getElementById("mobileWorkbench");
  if(!root || root.dataset.bound==="true") return;
  root.dataset.bound="true";
  root.addEventListener("click",handleMobileWorkbenchClick);
  root.addEventListener("input",handleMobileWorkbenchInput);
  root.addEventListener("change",handleMobileWorkbenchChange);
  root.addEventListener("scroll",handleMobileWorkbenchScroll,true);
  root.addEventListener("keydown",handleMobileWorkbenchKeydown);
  root.addEventListener("pointerdown",handleMobileWorkbenchPointerDown);
  root.addEventListener("pointermove",handleMobileWorkbenchPointerMove);
  root.addEventListener("pointerup",handleMobileWorkbenchPointerEnd);
  root.addEventListener("pointercancel",handleMobileWorkbenchPointerEnd);
}

function ensureMobileState(){
  if(!state) return;
  state.mobileScreen=normalizeMobileScreen(state.mobileScreen) || "source";
  state.mobileWorkMode=normalizeMobileWorkMode(state.mobileWorkMode) || "select";
  state.mobileManualSelectedProductIds=Array.isArray(state.mobileManualSelectedProductIds) ? state.mobileManualSelectedProductIds : [];
  state.mobileProductSearchQuery=toText(state.mobileProductSearchQuery).trim();
  state.mobileProductCategory=toText(state.mobileProductCategory).trim();
  state.mobileParamSearchQuery=toText(state.mobileParamSearchQuery).trim();
  state.mobileCompletedInstanceIds=Array.isArray(state.mobileCompletedInstanceIds) ? state.mobileCompletedInstanceIds : [];
  state.mobileRecentProductIds=Array.isArray(state.mobileRecentProductIds) ? state.mobileRecentProductIds : [];
  state.mobileScrollPositions=state.mobileScrollPositions && typeof state.mobileScrollPositions==="object" ? state.mobileScrollPositions : {};
}

function updateMobileMode(){
  const mobile=isMobileViewport();
  document.body.classList.toggle("is-mobile",mobile);
  if(syncMobileInterfaceGate(mobile)){
    closeMobileMoreMenu();
    document.body.removeAttribute("data-mobile-tab");
    document.body.removeAttribute("data-mobile-screen");
    return;
  }
  if(mobile){
    ensureMobileState();
    const hashScreen=getMobileScreenFromHash();
    if(hashScreen && hashScreen!==state.mobileScreen){
      if(hashScreen==="manual"){
        resetMobileManualSelection();
      }
      state.mobileScreen=hashScreen;
    }
    if(state.instances.length===0 && ["cart","work","format"].includes(state.mobileScreen)){
      state.mobileScreen="source";
    }
    syncMobileBodyState();
    renderMobileWorkbench();
  }else{
    closeMobileMoreMenu();
    document.body.removeAttribute("data-mobile-tab");
    document.body.removeAttribute("data-mobile-screen");
  }
}

function isMobileInterfaceEnabled(){
  return !(state && state.appSettings && state.appSettings.mobileEnabled === false);
}

function syncMobileInterfaceGate(isMobile){
  const blocked=Boolean(isMobile && !isMobileInterfaceEnabled());
  document.body.classList.toggle("mobile-interface-disabled",blocked);
  let panel=document.getElementById("mobileDisabledPanel");
  if(blocked){
    if(!panel){
      panel=document.createElement("div");
      panel.id="mobileDisabledPanel";
      panel.className="mobile-disabled-panel";
      panel.setAttribute("role","alertdialog");
      panel.setAttribute("aria-modal","true");
      panel.innerHTML=[
        '<div class="mobile-disabled-card">',
        '<div class="mobile-disabled-mark">AI</div>',
        '<h1 id="mobileDisabledTitle"></h1>',
        '<p id="mobileDisabledMessage"></p>',
        '<small>当前移动端工作台已由后台关闭</small>',
        '</div>'
      ].join("");
      document.body.appendChild(panel);
    }
    const title=document.getElementById("mobileDisabledTitle");
    const message=document.getElementById("mobileDisabledMessage");
    const settings=state && state.appSettings || {};
    if(title) title.textContent=settings.mobileDisabledTitle || "手机端暂未开放";
    if(message) message.textContent=settings.mobileDisabledMessage || "请在电脑工作台操作。";
  }else if(panel){
    panel.remove();
  }
  return blocked;
}

function normalizeMobileScreen(screen){
  return MOBILE_SCREENS.includes(screen) ? screen : "";
}

function normalizeMobileWorkMode(mode){
  return MOBILE_WORK_MODES.includes(mode) ? mode : "";
}

function getMobileScreenFromHash(){
  const value=String(window.location.hash || "").replace(/^#/,"");
  const legacyMap={
    home:"source",
    product:"manual",
    select:"work",
    edit:"work",
    deliver:"format",
    preview:"format"
  };
  return normalizeMobileScreen(value) || legacyMap[value] || "";
}

function syncMobileHash(){
  if(!isMobileViewport()) return;
  const screen=normalizeMobileScreen(state.mobileScreen) || "source";
  const targetHash=`#${screen}`;
  if(window.location.hash!==targetHash){
    history.replaceState(null,"",`${window.location.pathname}${window.location.search}${targetHash}`);
  }
}

function syncMobileBodyState(){
  const screen=normalizeMobileScreen(state.mobileScreen) || "source";
  state.mobileTab=getLegacyTabForMobileScreen(screen);
  document.body.dataset.mobileScreen=screen;
  document.body.removeAttribute("data-mobile-tab");
}

function mapLegacyTabToScreen(tab){
  const map={
    home:"source",
    product:"manual",
    select:"work",
    edit:"work",
    deliver:"format"
  };
  return normalizeMobileScreen(tab) || map[tab] || "source";
}

function setMobileScreen(screen,options={}){
  ensureMobileState();
  let next=normalizeMobileScreen(screen) || "source";
  const previous=normalizeMobileScreen(state.mobileScreen) || "source";
  if(state.instances.length===0 && ["cart","work","format"].includes(next)){
    next="source";
  }
  if(next==="manual" && previous!=="manual"){
    resetMobileManualSelection();
  }
  state.mobileScreen=next;
  if(next==="work" && !getActiveInstance() && state.instances[0]){
    activateInstance(state.instances[0].id);
  }
  if(!options.skipHash) syncMobileHash();
  syncMobileBodyState();
  closeMobileMoreMenu();
  renderMobileWorkbench();
}

function setMobileTab(tab,skipMenuClose=false,skipHashSync=false){
  const next=mapLegacyTabToScreen(tab);
  if(tab==="select") state.mobileWorkMode="select";
  if(tab==="edit") state.mobileWorkMode="rewrite";
  if(tab==="deliver") state.mobileWorkMode="rewrite";
  setMobileScreen(next,{skipHash:skipHashSync});
  if(skipMenuClose) return;
  closeMobileMoreMenu();
}

function getLegacyTabForMobileScreen(screen){
  if(screen==="source") return "home";
  if(screen==="manual") return "product";
  if(screen==="format") return "deliver";
  if(screen==="work") return state.mobileWorkMode==="select" ? "select" : "edit";
  return "home";
}

function scheduleMobileWorkbenchRender(){
  if(!isMobileViewport()) return;
  if(mobileRenderFrame) return;
  mobileRenderFrame=requestAnimationFrame(()=>{
    mobileRenderFrame=null;
    renderMobileWorkbench();
  });
}

function getMobileScrollKey(element){
  if(!element) return "";
  const explicit=toText(element.dataset && element.dataset.mobileScrollKey).trim();
  if(explicit) return explicit;
  const screen=normalizeMobileScreen(state.mobileScreen) || "source";
  const mode=normalizeMobileWorkMode(state.mobileWorkMode) || "select";
  return `${screen}:${mode}:${element.className || element.tagName}`;
}

function captureMobileScrollPositions(root=document.getElementById("mobileWorkbench")){
  if(!root || !state) return;
  ensureMobileState();
  root.querySelectorAll(".mpw-scroll").forEach(element=>{
    const key=getMobileScrollKey(element);
    if(!key) return;
    const top=Math.max(0,Math.round(element.scrollTop || 0));
    const left=Math.max(0,Math.round(element.scrollLeft || 0));
    const existing=state.mobileScrollPositions[key];
    if(top===0 && existing && Number(existing.top)>0 && element.scrollHeight>element.clientHeight){
      return;
    }
    state.mobileScrollPositions[key]={
      top,
      left
    };
  });
}

function restoreMobileScrollPositions(root=document.getElementById("mobileWorkbench")){
  if(!root || !state || !state.mobileScrollPositions) return;
  root.querySelectorAll(".mpw-scroll").forEach(element=>{
    const key=getMobileScrollKey(element);
    const stored=key && state.mobileScrollPositions[key];
    if(!stored) return;
    element.scrollTop=Math.min(Number(stored.top) || 0,Math.max(0,element.scrollHeight-element.clientHeight));
    element.scrollLeft=Math.min(Number(stored.left) || 0,Math.max(0,element.scrollWidth-element.clientWidth));
  });
}

function handleMobileWorkbenchScroll(event){
  const element=event.target && event.target.closest ? event.target.closest(".mpw-scroll") : null;
  if(!element || !state) return;
  ensureMobileState();
  const key=getMobileScrollKey(element);
  if(!key) return;
  state.mobileScrollPositions[key]={
    top:Math.max(0,Math.round(element.scrollTop || 0)),
    left:Math.max(0,Math.round(element.scrollLeft || 0))
  };
}

function renderMobileWorkbench(){
  if(!isMobileViewport()) return;
  ensureMobileState();
  const root=document.getElementById("mobileWorkbench");
  if(!root) return;
  captureMobileScrollPositions(root);
  syncMobileBodyState();
  const screen=normalizeMobileScreen(state.mobileScreen) || "source";
  root.innerHTML=[
    screen==="source" ? renderMobileSourceScreen() : "",
    screen==="manual" ? renderMobileManualScreen() : "",
    screen==="cart" ? renderMobileCartScreen() : "",
    screen==="work" ? renderMobileWorkScreen() : "",
    screen==="format" ? renderMobileFormatScreen() : ""
  ].join("");
  requestAnimationFrame(()=>{
    autoResizeMobileTextareas();
    restoreMobileScrollPositions(root);
    requestAnimationFrame(()=>{
      restoreMobileScrollPositions(root);
    });
  });
}

function renderMobileSourceScreen(){
  const products=Array.isArray(state.products) ? state.products.length : 0;
  const params=Array.isArray(state.parameters) ? state.parameters.length : 0;
  const instanceCount=Array.isArray(state.instances) ? state.instances.length : 0;
  const current=getActiveInstance();
  return `
    <section class="mpw-screen mobile-page page-container mpw-source mpw-home-redesign">
      <div class="mpw-status-grid">
        <article class="ui-card mpw-stat mpw-stat-catalog">
          <i aria-hidden="true"></i>
          <span>参数库</span>
          <strong>${products ? `${products} 个产品` : "加载中"}</strong>
          <em>${params} 条参数</em>
        </article>
        <article class="ui-card mpw-stat mpw-stat-online">
          <i aria-hidden="true"></i>
          <span>在线</span>
          <strong>${getMobileOnlineText().replace(/^当前在线\s*/,"")}</strong>
          <em>实时统计</em>
        </article>
      </div>
      <div class="mpw-home-actions mpw-scroll" data-mobile-scroll-key="source-actions">
        <button type="button" class="ui-card ui-button mpw-home-card primary mpw-action-card" data-mobile-action="quote">
          <span class="mpw-card-kicker">AI 解析报价单</span>
          <strong>上传报价单，自动生成参数</strong>
          <em>报价单快速成稿</em>
          <b class="mpw-action-btn"><i aria-hidden="true">⇧</i>立即上传</b>
          <span class="mpw-card-visual quote" aria-hidden="true">
            <span class="mpw-visual-doc"></span>
            <span class="mpw-visual-cloud"></span>
          </span>
        </button>
        <button type="button" class="ui-card ui-button mpw-home-card mpw-action-card" data-mobile-action="manual">
          <span class="mpw-card-kicker">手动选择</span>
          <strong>手动添加产品，自定义生成参数</strong>
          <em>按产品逐项生成</em>
          <b class="mpw-action-btn"><i aria-hidden="true">＋</i>立即添加</b>
          <span class="mpw-card-visual manual" aria-hidden="true">
            <span class="mpw-visual-doc"></span>
            <span class="mpw-visual-plus"></span>
          </span>
        </button>
        <article class="ui-card ui-notice mpw-home-card muted notice">
          <i aria-hidden="true">!</i><span>通知</span>
          <strong>当前为华北区专属测试版本</strong>
          <em>功能仍在测试阶段，如发现问题请及时反馈</em>
        </article>
      </div>
      ${current ? `
        <article class="ui-card mpw-current-draft">
          <div><span>当前草稿</span><strong>${escapeHtml(getInstanceDisplayName(current))}</strong><em>${current.selected.length} 条参数</em></div>
          <button type="button" class="ui-button ui-button--primary" data-mobile-action="continue">继续编辑</button>
        </article>
      ` : ""}
    </section>
  `;
}

function renderMobileManualScreen(){
  const products=getMobileFilteredProducts();
  const selectedIds=new Set(state.mobileManualSelectedProductIds.map(Number));
  const categories=getMobileCategories();
  return `
    <section class="mpw-screen mobile-page page-container mpw-manual">
      <div class="mpw-search">
        <span>⌕</span>
        <input type="search" value="${escapeHtml(state.mobileProductSearchQuery)}" placeholder="搜索产品名称 / 产品线 / 版本" data-mobile-input="product-search" autocomplete="off" aria-label="搜索产品">
        ${state.mobileProductSearchQuery ? '<button type="button" data-mobile-action="clear-product-search" aria-label="清空">×</button>' : ""}
      </div>
      <div class="mpw-chip-row">
        <button type="button" class="ui-tag mpw-chip ${state.mobileProductCategory ? "" : "active"}" data-mobile-action="category" data-category="">全部</button>
        ${categories.slice(0,8).map(category=>`<button type="button" class="ui-tag mpw-chip ${state.mobileProductCategory===category ? "active" : ""}" data-mobile-action="category" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}
      </div>
      <div class="mpw-product-list mpw-scroll" data-mobile-scroll-key="manual-products">
        ${products.length ? products.map(product=>renderMobileProductChoice(product,selectedIds.has(product.id))).join("") : '<div class="ui-empty mpw-empty">暂无匹配产品</div>'}
      </div>
      <div class="mpw-bottom-bar">
        <div>已选择 ${selectedIds.size} 个产品</div>
        <button type="button" class="ui-button ui-button--secondary secondary" data-mobile-action="source">返回</button>
        <button type="button" class="ui-button ui-button--primary" data-mobile-action="manual-finish" ${selectedIds.size ? "" : "disabled"}>加入产品清单</button>
      </div>
    </section>
  `;
}

function renderMobileProductChoice(product,selected){
  return `
    <button type="button" class="ui-card product-card mpw-product-choice ${selected ? "selected" : ""}" data-mobile-action="toggle-product" data-product-id="${product.id}">
      <b>${selected ? "✓" : ""}</b>
      <span>
        <strong>${escapeHtml(getProductDisplayName(product))}</strong>
        <em>${escapeHtml(getProductMetaLine(product))}</em>
      </span>
    </button>
  `;
}

function renderMobileCartScreen(){
  const totalSelected=state.instances.reduce((sum,item)=>sum+(Array.isArray(item.selected) ? item.selected.length : 0),0);
  return `
    <section class="mpw-screen mobile-page page-container mpw-cart">
      <div class="ui-card mpw-cart-summary">
        <span>共 ${state.instances.length} 个产品</span>
        <strong>已选参数 ${totalSelected} 条</strong>
      </div>
      <div class="mpw-cart-list mpw-scroll" data-mobile-scroll-key="cart-list" data-mobile-reorder="instances">
        ${state.instances.length ? state.instances.map((instance,index)=>renderMobileCartItem(instance,index)).join("") : '<div class="ui-empty mpw-empty">暂无产品，请返回选择产品来源。</div>'}
      </div>
      <div class="mpw-bottom-bar">
        <div>确认处理顺序</div>
        <button type="button" class="ui-button ui-button--secondary secondary" data-mobile-action="manual">继续添加</button>
        <button type="button" class="ui-button ui-button--primary" data-mobile-action="start-work" ${state.instances.length ? "" : "disabled"}>开始处理参数</button>
      </div>
    </section>
  `;
}

function renderMobileCartItem(instance,index){
  const active=instance.id===state.activeInstanceId;
  const done=state.mobileCompletedInstanceIds.includes(instance.id);
  const status=active ? "处理中" : done ? "已完成" : "未处理";
  return `
    <article class="ui-card product-card mpw-cart-item ${active ? "active" : ""}" role="button" tabindex="0" data-mobile-action="activate-instance" data-instance-id="${escapeHtml(instance.id)}" data-instance-index="${index}" aria-label="处理 ${escapeHtml(getInstanceDisplayName(instance))}">
      <button type="button" class="drag-handle mpw-drag-handle" aria-label="拖拽调整产品顺序">${index+1}</button>
      <div class="mpw-cart-main">
        <strong>${escapeHtml(getInstanceDisplayName(instance))}</strong>
        <em>${escapeHtml(getProductMetaLine(getProductById(instance.productId)))} · 已选参数 ${instance.selected.length} 条</em>
      </div>
      <div class="mpw-cart-actions">
        <span class="ui-badge ${done ? "ui-badge--done" : "ui-badge--pending"}">${status}</span>
        <button type="button" class="ui-button ui-button--danger mpw-icon-delete" data-mobile-action="remove-instance" data-instance-id="${escapeHtml(instance.id)}" aria-label="删除产品" title="删除产品">×</button>
      </div>
    </article>
  `;
}

function renderMobileWorkScreen(){
  const instance=getActiveInstance() || state.instances[0] || null;
  if(!instance){
    return '<section class="mpw-screen mobile-page page-container"><div class="ui-empty mpw-empty">请先选择产品。</div></section>';
  }
  const product=getProductById(instance.productId);
  const currentIndex=Math.max(0,state.instances.findIndex(item=>item.id===instance.id));
  const mode=normalizeMobileWorkMode(state.mobileWorkMode) || "select";
  return `
    <section class="mpw-screen mobile-page page-container mpw-work">
      <div class="mpw-product-strip">
        <button type="button" class="ui-button ui-button--ghost" data-mobile-action="prev-instance" ${currentIndex===0 ? "disabled" : ""}>‹</button>
        <div><span>产品 ${currentIndex+1}/${state.instances.length}</span><strong>${escapeHtml(getProductDisplayName(product))}</strong></div>
        <button type="button" class="ui-button ui-button--ghost" data-mobile-action="next-instance" ${currentIndex>=state.instances.length-1 ? "disabled" : ""}>›</button>
      </div>
      <div class="mpw-mode-tabs">
        ${MOBILE_WORK_MODES.map(item=>`<button type="button" class="ui-button ui-button--ghost ${mode===item ? "active" : ""}" data-mobile-action="work-mode" data-mode="${item}">${getMobileWorkModeLabel(item)}</button>`).join("")}
      </div>
      ${mode==="select" ? renderMobileParamSelect(instance) : ""}
      ${mode==="sort" ? renderMobileParamSort(instance) : ""}
      ${mode==="rewrite" ? renderMobileParamRewrite(instance) : ""}
      <div class="mpw-bottom-bar">
        <div>已选 ${instance.selected.length} 条</div>
        <button type="button" class="ui-button ui-button--secondary secondary" data-mobile-action="cart">返回清单</button>
        <button type="button" class="ui-button ui-button--primary" data-mobile-action="work-primary">${getMobileWorkPrimaryText(mode,currentIndex)}</button>
      </div>
    </section>
  `;
}

function renderMobileParamSelect(instance){
  const query=normalizeMatchText(state.mobileParamSearchQuery);
  const params=getParamsByProductId(instance.productId).filter(param=>{
    if(!query) return true;
    return getParamSearchHaystack(param).includes(query);
  });
  const selectedIds=new Set(instance.selected.map(item=>String(item.id)));
  return `
    <div class="mpw-search">
      <span>⌕</span>
      <input type="search" value="${escapeHtml(state.mobileParamSearchQuery)}" placeholder="搜索参数、模块、备注" data-mobile-input="param-search" autocomplete="off" aria-label="搜索参数">
      ${state.mobileParamSearchQuery ? '<button type="button" data-mobile-action="clear-param-search" aria-label="清空">×</button>' : ""}
    </div>
    <div class="mpw-work-scroll mpw-scroll" data-mobile-scroll-key="work-select-${escapeHtml(instance.id)}">
      <div class="mpw-param-list">
        ${params.length ? params.map(param=>renderMobileParamChoice(param,selectedIds.has(String(param.id)))).join("") : '<div class="ui-empty mpw-empty">暂无匹配参数</div>'}
      </div>
    </div>
  `;
}

function renderMobileParamChoice(param,selected){
  const typeText=getShortTypeLabel(param);
  const remark=toText(param.remark).trim();
  return `
    <button type="button" class="ui-card param-card mpw-param-choice ${selected ? "selected" : ""}" data-mobile-action="toggle-param" data-param-id="${param.id}">
      <b>${selected ? "✓" : ""}</b>
      <span>
        <strong>${escapeHtml(toText(param.title,"无标题"))}</strong>
        <em>${escapeHtml([param.module,param.function_item,typeText].map(toText).filter(Boolean).join(" · "))}</em>
        ${renderMobileParamBadges(param,typeText)}
        <small>${escapeHtml(toText(param.content))}</small>
        ${remark ? `<i>${escapeHtml(remark)}</i>` : ""}
      </span>
    </button>
  `;
}

function renderMobileParamBadges(param,typeText){
  const badges=[];
  const imageProof=typeof normalizeProofMark==="function" ? normalizeProofMark(param && param.image_proof) : {mark:toText(param && param.image_proof).trim(),status:"missing"};
  const qualificationProof=typeof normalizeProofMark==="function" ? normalizeProofMark(param && param.qualification_proof) : {mark:toText(param && param.qualification_proof).trim(),status:"missing"};
  badges.push(`<mark class="mpw-proof proof-${escapeHtml(imageProof.status || "missing")}">图像 ${escapeHtml(imageProof.mark || "-")}</mark>`);
  badges.push(`<mark class="mpw-proof proof-${escapeHtml(qualificationProof.status || "missing")}">资质 ${escapeHtml(qualificationProof.mark || "-")}</mark>`);
  if(typeText) badges.push(`<mark class="mpw-type">${escapeHtml(typeText)}</mark>`);
  if(typeof getVendorSupportEntries==="function"){
    getVendorSupportEntries(param).slice(0,8).forEach(([vendor,value])=>{
      const status=typeof normalizeSupportValue==="function" ? normalizeSupportValue(value) : toText(value).trim();
      const statusClass=getMobileSupportClass(status);
      badges.push(`<mark class="mpw-vendor ${statusClass}" title="${escapeHtml([vendor,status].filter(Boolean).join(" "))}">${escapeHtml(getMobileVendorLabel(vendor))} ${escapeHtml(getMobileSupportShort(status))}</mark>`);
    });
  }
  return `<div class="mpw-param-badges">${badges.join("")}</div>`;
}

function getMobileVendorLabel(vendor){
  const text=toText(vendor).trim();
  if(!text) return "-";
  const normalized=text.replace(/\s+/g,"");
  const map={
    奇安信:"奇安",
    华为:"华为",
    华三:"华三",
    深信服:"深信",
    腾讯:"腾讯",
    联软:"联软",
    亿格云:"亿格",
    数篷:"数篷",
    指掌易:"指掌",
    飞连:"飞连",
    锦盟云:"锦盟"
  };
  const matched=Object.keys(map).find(name=>normalized.includes(name));
  if(matched) return map[matched];
  return [...normalized].slice(0,Math.min(2,[...normalized].length)).join("");
}

function getMobileSupportShort(status){
  const text=toText(status).trim();
  if(!text) return "-";
  if(text.includes("不支持")) return "否";
  if(text.includes("部分")) return "部";
  if(text.includes("支持") || text.includes("满足")) return "支";
  if(text.includes("未知")) return "?";
  return [...text][0] || "-";
}

function getMobileSupportClass(status){
  const text=toText(status).trim();
  if(text.includes("不支持")) return "support-fail";
  if(text.includes("部分")) return "support-partial";
  if(text.includes("支持") || text.includes("满足")) return "support-ok";
  return "support-missing";
}

function renderMobileParamSort(instance){
  if(!instance.selected.length) return '<div class="ui-empty mpw-empty">请先选择参数。</div>';
  return `
    <div class="mpw-sort-hint">拖动左侧手柄调整顺序，卡片正文可正常滚动和点击。</div>
    <div class="mpw-work-scroll mpw-scroll" data-mobile-scroll-key="work-sort-${escapeHtml(instance.id)}">
    <div class="mpw-sort-list" data-mobile-reorder="params">
      ${instance.selected.map((param,index)=>`
        <article class="ui-card param-card mpw-sort-item" data-sort-index="${index}" role="button" tabindex="0" aria-label="排序 ${escapeHtml(toText(param.title,"参数"))}">
          <button type="button" class="drag-handle mpw-sort-handle" data-sort-index="${index}" aria-label="拖拽排序">${index+1}</button>
          <span>
            <strong>${escapeHtml(toText(param.title,"参数"))}</strong>
            <em>${escapeHtml([param.module,param.function_item].map(toText).filter(Boolean).join(" · ") || "未分项目")}</em>
            <small>${escapeHtml(getPrefixedParamContent(param).slice(0,120))}</small>
          </span>
        </article>
      `).join("")}
    </div>
    </div>
  `;
}

function renderMobileParamRewrite(instance){
  if(!instance.selected.length) return '<div class="ui-empty mpw-empty">请先选择参数。</div>';
  return `
    <div class="mpw-rewrite-actions">
      <button type="button" class="ui-button ui-button--primary" data-mobile-action="batch-rewrite">AI 改写全部</button>
      <button type="button" class="ui-button ui-button--secondary secondary" data-mobile-action="add-custom">新增空白</button>
    </div>
    <div class="mpw-work-scroll mpw-scroll" data-mobile-scroll-key="work-rewrite-${escapeHtml(instance.id)}">
    <div class="mpw-rewrite-list">
      ${instance.selected.map((param,index)=>`
        <article class="ui-card param-card mpw-rewrite-card">
          <div class="mpw-rewrite-head">
            <b>${index+1}</b>
            <span>
              <strong>${escapeHtml(toText(param.title,"参数"))}</strong>
              <em>
                <span>${escapeHtml(getShortTypeLabel(param))}</span>
                <span class="mpw-prefix-row">
                  ${["","▲","★"].map(symbol=>`<button type="button" class="ui-button ui-button--ghost ${toText(param.prefix_symbol)===symbol ? "active" : ""}" data-mobile-action="prefix" data-index="${index}" data-symbol="${symbol}">${symbol || "无"}</button>`).join("")}
                  <button type="button" class="ui-button ui-button--secondary" data-mobile-action="rewrite-param" data-index="${index}">AI改写</button>
                  <button type="button" class="ui-button ui-button--danger danger" data-mobile-action="remove-param" data-index="${index}" aria-label="删除">×</button>
                </span>
              </em>
            </span>
          </div>
          <textarea data-mobile-input="edit-param" data-index="${index}" rows="1">${escapeHtml(getPrefixedParamContent(param))}</textarea>
        </article>
      `).join("")}
    </div>
    </div>
  `;
}

function renderMobileFormatScreen(){
  flushPreviewUpdate();
  const text=getWordExportText();
  const total=state.instances.reduce((sum,instance)=>sum+(instance.selected ? instance.selected.length : 0),0);
  const score=getMobileDeliveryScoreStats();
  return `
    <section class="mpw-screen mobile-page page-container mpw-format">
      <div class="ui-card mpw-finish-card">
        <strong>参数已汇总</strong>
        <span>共 ${state.instances.length} 个产品、${total} 条参数。</span>
      </div>
      <div class="ui-card mpw-score-card">
        <div class="mpw-score-head">
          <strong>参数评分</strong>
          <span>${score.totalCount} 条</span>
        </div>
        <div class="mpw-score-grid">
          <div><span>总条数</span><strong>${score.totalCount}</strong></div>
          <div><span>加星</span><strong>${score.starCount}</strong></div>
          <div><span>加三角</span><strong>${score.triangleCount}</strong></div>
        </div>
        <div class="mpw-score-vendors">
          <span>厂商满足</span>
          <p>${score.vendorEntries.length ? score.vendorEntries.map(([vendor,count])=>`<b>${escapeHtml(vendor)} ${count}</b>`).join("") : "<b>无</b>"}</p>
        </div>
      </div>
      <div class="ui-card mpw-preview-card">
        <div><strong>预览结果</strong><button type="button" class="ui-button ui-button--secondary" data-mobile-action="format-ai">AI整理格式</button></div>
        <pre class="mpw-scroll" data-mobile-scroll-key="format-preview">${escapeHtml(text || "暂无可预览参数")}</pre>
      </div>
      <div class="mpw-bottom-bar mpw-format-bottom">
        <button type="button" class="ui-button ui-button--secondary secondary" data-mobile-action="format-back">继续编辑</button>
        <button type="button" class="ui-button ui-button--secondary secondary" data-mobile-action="copy">复制参数</button>
        <button type="button" class="ui-button ui-button--primary" data-mobile-action="export-word" ${text ? "" : "disabled"}>导出Word</button>
      </div>
    </section>
  `;
}

function getMobileDeliveryScoreStats(){
  const params=state.instances.flatMap(instance=>Array.isArray(instance.selected) ? instance.selected : []);
  const vendorCounts=new Map();
  let starCount=0;
  let triangleCount=0;
  params.forEach(param=>{
    const symbol=toText(param && param.prefix_symbol).trim();
    if(symbol==="★") starCount++;
    if(symbol==="▲") triangleCount++;
    if(typeof getVendorSupportEntries!=="function" || typeof normalizeSupportValue!=="function") return;
    getVendorSupportEntries(param).forEach(([vendor,value])=>{
      const normalizedVendor=toText(vendor).trim();
      if(!normalizedVendor || normalizedVendor==="-") return;
      if(normalizeSupportValue(value)!=="满足") return;
      vendorCounts.set(normalizedVendor,(vendorCounts.get(normalizedVendor) || 0)+1);
    });
  });
  return {
    totalCount:params.length,
    starCount,
    triangleCount,
    vendorEntries:[...vendorCounts.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],"zh-CN"))
  };
}

function handleMobileWorkbenchClick(event){
  if(mobileSuppressNextClick){
    event.preventDefault();
    event.stopPropagation();
    mobileSuppressNextClick=false;
    return;
  }
  if(event.target.closest(".drag-handle")){
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const target=event.target.closest("[data-mobile-action]");
  if(!target) return;
  const action=target.dataset.mobileAction;
  if(action==="menu"){ toggleMobileMoreMenu(event); return; }
  if(action==="back"){ handleMobileBack(); return; }
  if(action==="source"){ setMobileScreen("source"); return; }
  if(action==="manual"){ resetMobileManualSelection(); setMobileScreen("manual"); return; }
  if(action==="cart"){ setMobileScreen("cart"); return; }
  if(action==="quote"){ startMobileQuoteFlow(event); return; }
  if(action==="continue"){ setMobileScreen(state.selected.length ? "work" : "cart"); return; }
  if(action==="clear-product-search"){ state.mobileProductSearchQuery=""; renderMobileWorkbench(); return; }
  if(action==="clear-param-search"){ state.mobileParamSearchQuery=""; renderMobileWorkbench(); return; }
  if(action==="category"){ state.mobileProductCategory=toText(target.dataset.category).trim(); renderMobileWorkbench(); return; }
  if(action==="toggle-product"){ toggleMobileManualProduct(Number(target.dataset.productId)); return; }
  if(action==="manual-finish"){ finishMobileManualSelection(); return; }
  if(action==="start-work"){ startMobileWork(); return; }
  if(action==="activate-instance"){ activateMobileInstance(target.dataset.instanceId); return; }
  if(action==="remove-instance"){ removeInstance(target.dataset.instanceId,target); scheduleMobileWorkbenchRender(); return; }
  if(action==="prev-instance"){ stepMobileInstance(-1); return; }
  if(action==="next-instance"){ stepMobileInstance(1); return; }
  if(action==="work-mode"){ state.mobileWorkMode=normalizeMobileWorkMode(target.dataset.mode) || "select"; renderMobileWorkbench(); return; }
  if(action==="toggle-param"){ toggle(Number(target.dataset.paramId)); scheduleMobileWorkbenchRender(); return; }
  if(action==="remove-param"){ removeItem(Number(target.dataset.index)); renderMobileWorkbench(); return; }
  if(action==="prefix"){ setParamPrefixSymbol(Number(target.dataset.index),target.dataset.symbol || ""); renderMobileWorkbench(); return; }
  if(action==="rewrite-param"){ openRewriteModePopover(Number(target.dataset.index),target); return; }
  if(action==="batch-rewrite"){ openBatchRewriteModal(target,"regular"); return; }
  if(action==="add-custom"){ addCustomParam(event); scheduleMobileWorkbenchRender(); return; }
  if(action==="work-primary"){ handleMobileWorkPrimary(); return; }
  if(action==="format-back"){ state.mobileWorkMode="rewrite"; setMobileScreen("work"); return; }
  if(action==="format-ai"){ openFormatOptionsModal(); return; }
  if(action==="copy"){ copyText(event); return; }
  if(action==="export-word"){ exportWord(event); return; }
}

function handleMobileWorkbenchInput(event){
  const input=event.target.closest("[data-mobile-input]");
  if(!input) return;
  const kind=input.dataset.mobileInput;
  if(kind==="product-search"){
    state.mobileProductSearchQuery=input.value;
    restoreMobileInputAfterRender("product-search",input);
    renderMobileWorkbench();
    return;
  }
  if(kind==="param-search"){
    state.mobileParamSearchQuery=input.value;
    restoreMobileInputAfterRender("param-search",input);
    renderMobileWorkbench();
    return;
  }
  if(kind==="edit-param"){
    autoResizeMobileTextarea(input);
    editContent(Number(input.dataset.index),input.value);
  }
}

function handleMobileWorkbenchChange(_event){}

function handleMobileWorkbenchKeydown(event){
  if(event.key!=="ArrowUp" && event.key!=="ArrowDown") return;
  const delta=event.key==="ArrowUp" ? -1 : 1;
  const sortItem=event.target.closest(".mpw-sort-item");
  if(sortItem){
    const index=Number(sortItem.dataset.sortIndex);
    const next=index+delta;
    if(next<0 || next>=state.selected.length) return;
    event.preventDefault();
    reorderCurrentSelectedParam(index,next);
    renderMobileWorkbench();
    requestAnimationFrame(()=>{
      const nextItem=document.querySelector(`.mpw-sort-item[data-sort-index="${next}"]`);
      nextItem?.focus?.({preventScroll:true});
      restoreMobileScrollPositions();
    });
    return;
  }
  const cartItem=event.target.closest(".mpw-cart-item");
  if(cartItem){
    const index=Number(cartItem.dataset.instanceIndex);
    const next=index+delta;
    if(next<0 || next>=state.instances.length) return;
    event.preventDefault();
    reorderMobileInstance(index,next);
    renderMobileWorkbench();
    requestAnimationFrame(()=>{
      const nextItem=document.querySelector(`.mpw-cart-item[data-instance-index="${next}"]`);
      nextItem?.focus?.({preventScroll:true});
      restoreMobileScrollPositions();
    });
  }
}

function autoResizeMobileTextareas(){
  document.querySelectorAll('#mobileWorkbench textarea[data-mobile-input="edit-param"]').forEach(autoResizeMobileTextarea);
}

function autoResizeMobileTextarea(textarea){
  if(!textarea) return;
  textarea.style.height="0px";
  textarea.style.height=`${Math.max(44,textarea.scrollHeight)}px`;
}

function handleMobileWorkbenchPointerDown(event){
  if(!isMobileViewport()) return;
  const handle=event.target.closest(".drag-handle");
  if(!handle) return;
  const cartItem=handle.closest(".mpw-cart-item");
  if(cartItem){
    const list=cartItem.closest(".mpw-cart-list");
    const index=Number(cartItem.dataset.instanceIndex);
    if(!list || !Number.isFinite(index)) return;
    event.preventDefault();
    mobileInstanceDrag=createMobileDragState("instances",cartItem,list,index,event);
    handle.setPointerCapture?.(event.pointerId);
    return;
  }
  const item=handle.closest(".mpw-sort-item");
  if(!item) return;
  const list=item.closest(".mpw-sort-list");
  const index=Number(item.dataset.sortIndex);
  if(!list || !Number.isFinite(index)) return;
  event.preventDefault();
  mobileSortDrag=createMobileDragState("params",item,list,index,event);
  handle.setPointerCapture?.(event.pointerId);
}

function handleMobileWorkbenchPointerMove(event){
  if(mobileInstanceDrag && mobileInstanceDrag.pointerId===event.pointerId){
    event.preventDefault();
    updateMobileDragPosition(mobileInstanceDrag,event);
    return;
  }
  if(!mobileSortDrag || mobileSortDrag.pointerId!==event.pointerId) return;
  event.preventDefault();
  updateMobileDragPosition(mobileSortDrag,event);
}

function handleMobileWorkbenchPointerEnd(event){
  if(mobileInstanceDrag && mobileInstanceDrag.pointerId===event.pointerId){
    finishMobileDrag(mobileInstanceDrag);
    mobileInstanceDrag=null;
    return;
  }
  if(mobileSortDrag && mobileSortDrag.pointerId===event.pointerId){
    finishMobileDrag(mobileSortDrag);
    mobileSortDrag=null;
  }
}

function createMobileDragState(type,item,list,index,event){
  const itemSelector=type==="instances" ? ".mpw-cart-item" : ".mpw-sort-item";
  return {
    type,
    item,
    list,
    itemSelector,
    startIndex:index,
    currentIndex:index,
    pointerId:event.pointerId,
    startX:event.clientX,
    startY:event.clientY,
    hasMoved:false
  };
}

function updateMobileDragPosition(drag,event){
  if(!drag || !drag.item || !drag.list) return;
  if(!drag.hasMoved){
    const distance=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);
    if(distance<8) return;
    drag.hasMoved=true;
    drag.item.classList.add("dragging");
    drag.list.classList.add("dragging");
  }
  const items=[...drag.list.querySelectorAll(drag.itemSelector)].filter(item=>item!==drag.item);
  let insertBefore=null;
  for(const item of items){
    const rect=item.getBoundingClientRect();
    if(event.clientY<rect.top + rect.height/2){
      insertBefore=item;
      break;
    }
  }
  if(insertBefore){
    drag.list.insertBefore(drag.item,insertBefore);
  }else{
    drag.list.appendChild(drag.item);
  }
  drag.currentIndex=[...drag.list.querySelectorAll(drag.itemSelector)].indexOf(drag.item);
}

function finishMobileDrag(drag){
  if(!drag) return;
  if(!drag.hasMoved) return;
  mobileSuppressNextClick=true;
  setTimeout(()=>{ mobileSuppressNextClick=false; },0);
  drag.item?.classList.remove("dragging");
  drag.list?.classList.remove("dragging");
  const from=drag.startIndex;
  const to=drag.currentIndex;
  if(drag.type==="instances"){
    reorderMobileInstance(from,to);
  }else{
    reorderCurrentSelectedParam(from,to);
  }
  renderMobileWorkbench();
}

function reorderCurrentSelectedParam(fromIndex,toIndex){
  const from=Number(fromIndex);
  const to=Number(toIndex);
  if(!Number.isFinite(from) || !Number.isFinite(to)) return;
  if(from<0 || to<0 || from>=state.selected.length || to>=state.selected.length || from===to) return;
  const [item]=state.selected.splice(from,1);
  state.selected.splice(to,0,item);
  renderEditArea();
  schedulePreviewUpdate();
}

function reorderMobileInstance(fromIndex,toIndex){
  const from=Number(fromIndex);
  const to=Number(toIndex);
  if(!Number.isFinite(from) || !Number.isFinite(to)) return;
  if(from<0 || to<0 || from>=state.instances.length || to>=state.instances.length || from===to) return;
  const [item]=state.instances.splice(from,1);
  state.instances.splice(to,0,item);
  renderInstancePanel();
  schedulePreviewUpdate();
}

function restoreMobileInputAfterRender(kind,input){
  const selectionStart=input.selectionStart;
  const selectionEnd=input.selectionEnd;
  requestAnimationFrame(()=>{
    const next=document.querySelector(`[data-mobile-input="${kind}"]`);
    if(!next) return;
    next.focus({preventScroll:true});
    if(typeof selectionStart==="number" && typeof selectionEnd==="number"){
      next.setSelectionRange(selectionStart,selectionEnd);
    }
  });
}

function handleMobileBack(){
  const screen=normalizeMobileScreen(state.mobileScreen);
  if(screen==="manual") setMobileScreen("source");
  else if(screen==="cart") setMobileScreen("source");
  else if(screen==="work") setMobileScreen("cart");
  else if(screen==="format") setMobileScreen("work");
}

function startMobileQuoteFlow(event){
  triggerQuoteFileSelection(event);
}

function continueMobileDraft(){
  setMobileScreen(state.instances.length ? "work" : "manual");
}

function openMobileProductDrawer(event,options={}){
  if(event && event.stopPropagation) event.stopPropagation();
  if(!isMobileViewport()) return;
  if(!options.silent && event && event.currentTarget){
    state.mobileDrawerRestoreFocus=event.currentTarget;
  }
  resetMobileManualSelection();
  setMobileScreen("manual");
}

function closeMobileProductDrawer(_event){
  setMobileScreen(state.instances.length ? "cart" : "source");
}

function toggleMobileManualProduct(productId){
  const id=Number(productId);
  if(!id) return;
  const selected=new Set(state.mobileManualSelectedProductIds.map(Number));
  if(selected.has(id)){
    selected.delete(id);
  }else{
    selected.add(id);
  }
  state.mobileManualSelectedProductIds=[...selected];
  rememberMobileRecentProduct(id);
  renderMobileWorkbench();
}

function finishMobileManualSelection(){
  const ids=state.mobileManualSelectedProductIds.map(Number).filter(id=>getProductById(id));
  if(!ids.length) return;
  const existingProductIds=new Set(state.instances.map(instance=>String(instance.productId)));
  let addedCount=0;
  ids.forEach(id=>{
    if(existingProductIds.has(String(id))) return;
    state.instances.push(createInstance(id));
    existingProductIds.add(String(id));
    addedCount++;
  });
  if(state.instances[0] && !getActiveInstance()){
    activateInstance(state.instances[0].id);
  }
  resetMobileManualSelection();
  setMobileScreen("cart");
  showToast(addedCount ? `已加入 ${addedCount} 个产品` : "产品清单已保持最新","success");
}

function resetMobileManualSelection(){
  state.mobileManualSelectedProductIds=[];
}

function startMobileWork(){
  if(!state.instances.length) return;
  if(!getActiveInstance()){
    activateInstance(state.instances[0].id);
  }
  state.mobileWorkMode="select";
  setMobileScreen("work");
}

function activateMobileInstance(instanceId){
  const instance=getInstanceById(instanceId);
  if(!instance) return;
  activateInstance(instance.id);
  setMobileScreen("work");
}

function moveMobileInstance(instanceId,delta){
  const index=state.instances.findIndex(item=>item.id===instanceId);
  const nextIndex=index+delta;
  if(index<0 || nextIndex<0 || nextIndex>=state.instances.length) return;
  [state.instances[index],state.instances[nextIndex]]=[state.instances[nextIndex],state.instances[index]];
  renderInstancePanel();
  schedulePreviewUpdate();
  renderMobileWorkbench();
}

function stepMobileInstance(delta){
  const current=getActiveInstance();
  const index=current ? state.instances.findIndex(item=>item.id===current.id) : 0;
  const next=state.instances[index+delta];
  if(next) activateInstance(next.id);
  renderMobileWorkbench();
}

function handleMobileWorkPrimary(){
  const mode=normalizeMobileWorkMode(state.mobileWorkMode) || "select";
  if(mode==="select"){
    state.mobileWorkMode="sort";
    renderMobileWorkbench();
    return;
  }
  if(mode==="sort"){
    state.mobileWorkMode="rewrite";
    renderMobileWorkbench();
    return;
  }
  const current=getActiveInstance();
  if(current && !state.mobileCompletedInstanceIds.includes(current.id)){
    state.mobileCompletedInstanceIds.push(current.id);
  }
  const index=current ? state.instances.findIndex(item=>item.id===current.id) : -1;
  const next=state.instances[index+1];
  if(next){
    activateInstance(next.id);
    state.mobileWorkMode="select";
    renderMobileWorkbench();
    return;
  }
  setMobileScreen("format");
}

function loadMobileRecentProducts(){
  try{
    const raw=JSON.parse(localStorage.getItem(MOBILE_RECENT_PRODUCTS_KEY) || "[]");
    state.mobileRecentProductIds=Array.isArray(raw) ? raw.map(Number).filter(Boolean).slice(0,6) : [];
  }catch(_err){
    state.mobileRecentProductIds=[];
  }
}

function rememberMobileRecentProduct(productId){
  const id=Number(productId);
  if(!id) return;
  state.mobileRecentProductIds=[id,...(state.mobileRecentProductIds || []).filter(item=>Number(item)!==id)].slice(0,6);
  try{
    localStorage.setItem(MOBILE_RECENT_PRODUCTS_KEY,JSON.stringify(state.mobileRecentProductIds));
  }catch(_err){}
}

function handleMobileProductSearch(value){
  state.mobileProductSearchQuery=toText(value).trim();
  renderMobileWorkbench();
}

function clearMobileProductSearch(){
  state.mobileProductSearchQuery="";
  renderMobileWorkbench();
}

function updateMobileProductPicker(){
  renderMobileWorkbench();
}

function updateMobileContext(){
  const productNameEl=document.getElementById("mobileContextProductName");
  const instanceNameEl=document.getElementById("mobileContextInstanceName");
  const ctaText=document.getElementById("mobileSelectCtaText");
  const product=state.currentProductId ? getProductById(state.currentProductId) : null;
  const instance=getActiveInstance();
  if(productNameEl) productNameEl.textContent=getProductDisplayName(product) || "未选择产品";
  if(instanceNameEl) instanceNameEl.textContent=instance ? getInstanceDisplayName(instance) : "点击选择产品";
  if(ctaText) ctaText.textContent=state.selected.length ? `已选 ${state.selected.length} 条` : "尚未选择参数";
  scheduleMobileWorkbenchRender();
}

function updateMobileHome(){
  scheduleMobileWorkbenchRender();
}

function syncMobileSelectCta(){}
function syncMobileProductA11y(){}

function toggleMobileMoreMenu(event){
  if(event) event.stopPropagation();
  const nextOpen=!document.body.classList.contains("mobile-menu-open");
  document.body.classList.toggle("mobile-menu-open",nextOpen);
  const button=document.getElementById("mobileMoreBtn");
  if(button) button.setAttribute("aria-expanded",nextOpen ? "true" : "false");
}

function closeMobileMoreMenu(){
  document.body.classList.remove("mobile-menu-open");
  const button=document.getElementById("mobileMoreBtn");
  if(button) button.setAttribute("aria-expanded","false");
}

function getMobileFilteredProducts(){
  const query=normalizeMatchText(state.mobileProductSearchQuery);
  const category=toText(state.mobileProductCategory).trim();
  return state.products.filter(product=>{
    if(category && toText(product.category).trim()!==category) return false;
    if(!query) return true;
    return normalizeMatchText([
      product.category,
      product.productLine,
      product.sheetName,
      product.name,
      product.version,
      product.refDocName
    ].map(toText).join(" ")).includes(query);
  });
}

function getMobileCategories(){
  return [...new Set(state.products.map(product=>toText(product.category).trim()).filter(Boolean))];
}

function getProductDisplayName(product){
  if(!product) return "";
  return toText(product.productLine || product.name || product.sheetName || `产品 #${product.id}`).trim();
}

function getProductMetaLine(product){
  if(!product) return "";
  return [product.category,product.version || product.sheetName].map(toText).map(item=>item.trim()).filter(Boolean).join(" · ");
}

function getInstanceDisplayName(instance){
  if(!instance) return "";
  const product=getProductById(instance.productId);
  return toText(instance.name).trim() || getProductDisplayName(product) || "未命名产品";
}

function getMobileActiveProductLabel(){
  const instance=getActiveInstance();
  if(!instance) return "请选择产品";
  return `${getInstanceDisplayName(instance)} · ${instance.selected.length} 条`;
}

function getMobileWorkModeLabel(mode){
  return {
    select:"参数选择",
    sort:"参数排序",
    rewrite:"参数改写"
  }[mode] || "参数选择";
}

function getMobileWorkPrimaryText(mode,currentIndex){
  if(mode==="select") return "去参数排序";
  if(mode==="sort") return "去参数改写";
  return currentIndex>=state.instances.length-1 ? "完成并整理格式" : "完成本产品";
}

function getMobileOnlineText(){
  const badge=document.getElementById("guideOnlineBadge");
  return toText(badge && badge.textContent).trim() || "实时使用人数";
}

function getMobileNoticeTitle(){
  const title=document.getElementById("guideNoticeTitle");
  return toText(title && title.textContent).trim() || "暂无通知";
}

function getMobileNoticeMessage(){
  const message=document.getElementById("guideNoticeMessage");
  return toText(message && message.textContent).trim() || "后台暂未发布通知。";
}
