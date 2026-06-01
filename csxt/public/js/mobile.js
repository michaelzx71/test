function initMobileShell(){
  document.querySelectorAll("[data-mobile-tab-target]").forEach(button=>{
    button.addEventListener("click",()=>{
      setMobileTab(button.dataset.mobileTabTarget);
      button.blur();
    });
  });
  window.addEventListener("hashchange",()=>{
    if(!isMobileViewport()) return;
    const hashTab=getMobileTabFromHash();
    if(hashTab){
      setMobileTab(hashTab,true,true);
    }
  });
  document.addEventListener("pointerdown",event=>{
    const menu=document.getElementById("mobileMoreMenu");
    const button=document.getElementById("mobileMoreBtn");
    if(document.body.classList.contains("mobile-menu-open")){
      if((menu && menu.contains(event.target)) || (button && button.contains(event.target))) return;
      closeMobileMoreMenu();
    }
    if(document.body.classList.contains("mobile-product-drawer-open")){
      const drawer=document.querySelector(".sidebar");
      const drawerButton=event.target && event.target.closest && event.target.closest(".mobile-current-product,.mobile-context-btn.primary");
      if((drawer && drawer.contains(event.target)) || drawerButton) return;
      closeMobileProductDrawer();
    }
  });
  document.addEventListener("keydown",handleMobileDrawerKeydown,true);
  const appShell=document.getElementById("appShell");
  if(appShell){
    appShell.addEventListener("click",event=>{
      if(!document.body.classList.contains("mobile-product-drawer-open")) return;
      const drawer=document.querySelector(".sidebar");
      if(drawer && drawer.contains(event.target)) return;
      if(event.target.closest(".mobile-current-product,.mobile-context-btn.primary")) return;
      closeMobileProductDrawer();
    });
  }
  updateMobileMode();
}

function updateMobileMode(){
  const mobile=isMobileViewport();
  document.body.classList.toggle("is-mobile",mobile);
  if(syncMobileInterfaceGate(mobile)){
    closeMobileMoreMenu();
    closeMobileProductDrawer();
    document.body.removeAttribute("data-mobile-tab");
    return;
  }
  if(mobile){
    const preferredTab=getMobileTabFromHash() || normalizeMobileTab(state.mobileTab);
    setMobileTab(preferredTab || "select",true,true);
    updateMobileContext();
    if(!state.currentProductId){
      openMobileProductDrawer(null,{silent:true});
    }
  }else{
    closeMobileMoreMenu();
    closeMobileProductDrawer();
    document.body.removeAttribute("data-mobile-tab");
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

function getMobileTabFromHash(){
  const value=String(window.location.hash || "").replace(/^#/,"");
  return ["select","edit","preview"].includes(value) ? value : "";
}

function normalizeMobileTab(tab){
  return ["select","edit","preview"].includes(tab) ? tab : "";
}

function getMobileSelectScrollKey(){
  return String(state.currentProductId || "none");
}

function saveMobileSelectScroll(){
  if(!state || state.mobileTab!=="select") return;
  const list=document.getElementById("paramList");
  if(!list) return;
  state.mobileSelectScrollByProduct=state.mobileSelectScrollByProduct || {};
  state.mobileSelectScrollByProduct[getMobileSelectScrollKey()]=list.scrollTop;
}

function restoreMobileSelectScroll(){
  const list=document.getElementById("paramList");
  if(!list) return;
  const saved=state.mobileSelectScrollByProduct && state.mobileSelectScrollByProduct[getMobileSelectScrollKey()];
  requestAnimationFrame(()=>{
    list.scrollTop=Number.isFinite(saved) ? saved : list.scrollTop;
  });
}

function setMobileTab(tab,skipMenuClose=false,skipHashSync=false){
  if(tab==="products"){
    openMobileProductDrawer();
    return;
  }
  saveMobileSelectScroll();
  const nextTab=normalizeMobileTab(tab) || "select";
  state.mobileTab=nextTab;
  if(isMobileViewport()){
    document.body.dataset.mobileTab=nextTab;
    if(!skipHashSync && window.location.hash!==`#${nextTab}`){
      history.replaceState(null,"",`${window.location.pathname}${window.location.search}#${nextTab}`);
    }
  }
  document.querySelectorAll("[data-mobile-tab-target]").forEach(button=>{
    const isActive=button.dataset.mobileTabTarget===nextTab;
    button.classList.toggle("active",isActive);
    button.setAttribute("aria-current",isActive ? "page" : "false");
  });
  if(nextTab==="edit"){
    requestAnimationFrame(()=>{
      document.querySelectorAll(".edit-card textarea").forEach(autoResizeEditTextarea);
    });
  }
  if(nextTab==="select"){
    restoreMobileSelectScroll();
  }
  syncMobileSelectCta();
  if(state.currentProductId){
    closeMobileProductDrawer();
  }else if(isMobileViewport()){
    openMobileProductDrawer(null,{silent:true});
  }
  updateMobileContext();
  if(!skipMenuClose){
    closeMobileMoreMenu();
  }
}

function openMobileProductDrawer(event,options={}){
  if(event && event.stopPropagation){
    event.stopPropagation();
  }
  if(!isMobileViewport()) return;
  closeMobileMoreMenu();
  if(!options.silent && event && event.currentTarget){
    state.mobileDrawerRestoreFocus=event.currentTarget;
  }
  document.body.classList.add("mobile-product-drawer-open");
  syncMobileDrawerA11y(true);
  if(!options.silent){
    requestAnimationFrame(()=>focusMobileProductDrawer());
  }
}

function closeMobileProductDrawer(event){
  if(event && event.stopPropagation){
    event.stopPropagation();
  }
  const wasOpen=document.body.classList.contains("mobile-product-drawer-open");
  document.body.classList.remove("mobile-product-drawer-open");
  syncMobileDrawerA11y(false);
  if(wasOpen && state.mobileDrawerRestoreFocus && state.mobileDrawerRestoreFocus.isConnected){
    const target=state.mobileDrawerRestoreFocus;
    state.mobileDrawerRestoreFocus=null;
    requestAnimationFrame(()=>target.focus({preventScroll:true}));
  }else{
    state.mobileDrawerRestoreFocus=null;
  }
}

function syncMobileDrawerA11y(open){
  const drawer=document.querySelector(".sidebar");
  if(drawer){
    if(open){
      drawer.setAttribute("role","dialog");
      drawer.setAttribute("aria-modal","true");
      drawer.setAttribute("aria-label","产品库");
      drawer.setAttribute("tabindex","-1");
    }else{
      drawer.removeAttribute("role");
      drawer.removeAttribute("aria-modal");
      drawer.removeAttribute("tabindex");
      drawer.setAttribute("aria-label","产品导航");
    }
  }
  document.querySelectorAll(".mobile-current-product,.mobile-context-btn.primary").forEach(button=>{
    button.setAttribute("aria-expanded",open ? "true" : "false");
  });
}

function getMobileDrawerFocusable(){
  const drawer=document.querySelector(".sidebar");
  if(!drawer) return [];
  const selector=[
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");
  return [...drawer.querySelectorAll(selector)].filter(element=>{
    if(element.offsetParent===null && element!==document.activeElement) return false;
    return !element.getAttribute("aria-hidden");
  });
}

function focusMobileProductDrawer(retry=0){
  const drawer=document.querySelector(".sidebar");
  if(!drawer) return;
  const candidates=[
    drawer.querySelector(".mobile-product-drawer-head button"),
    drawer,
    document.getElementById("sidebar"),
    ...getMobileDrawerFocusable()
  ].filter(Boolean);
  for(const candidate of candidates){
    if(typeof candidate.focus!=="function") continue;
    candidate.focus({preventScroll:true});
    if(drawer.contains(document.activeElement)) return;
  }
  if(retry<3){
    setTimeout(()=>focusMobileProductDrawer(retry+1),40);
  }
}

function handleMobileDrawerKeydown(event){
  if(!isMobileViewport() || !document.body.classList.contains("mobile-product-drawer-open")) return;
  if(event.key==="Escape"){
    event.preventDefault();
    closeMobileProductDrawer();
    return;
  }
  if(event.key!=="Tab") return;
  const focusable=getMobileDrawerFocusable();
  if(!focusable.length){
    event.preventDefault();
    const sidebar=document.getElementById("sidebar");
    if(sidebar) sidebar.focus({preventScroll:true});
    return;
  }
  const first=focusable[0];
  const last=focusable[focusable.length-1];
  const drawer=document.querySelector(".sidebar");
  if(drawer && !drawer.contains(document.activeElement)){
    event.preventDefault();
    (event.shiftKey ? last : first).focus({preventScroll:true});
  }else if(event.shiftKey && document.activeElement===first){
    event.preventDefault();
    last.focus({preventScroll:true});
  }else if(!event.shiftKey && document.activeElement===last){
    event.preventDefault();
    first.focus({preventScroll:true});
  }
}

function updateMobileContext(){
  const productNameEl=document.getElementById("mobileContextProductName");
  const instanceNameEl=document.getElementById("mobileContextInstanceName");
  const ctaText=document.getElementById("mobileSelectCtaText");
  const workContext=document.querySelector(".mobile-work-context");
  if(productNameEl || instanceNameEl){
    const product=state.currentProductId ? getProductById(state.currentProductId) : null;
    const instance=getActiveInstance();
    const productLine=toText(product && (product.productLine || product.name || product.sheetName)).trim();
    const version=toText(product && product.version).trim();
    const instanceName=toText(instance && instance.name).trim();
    if(productNameEl){
      productNameEl.textContent=productLine || "未选择产品";
    }
    if(instanceNameEl){
      const detail=[instanceName,version].filter(Boolean).join(" · ");
      instanceNameEl.textContent=detail || (product ? "当前参数库产品" : "点击选择产品");
    }
  }
  if(workContext){
    workContext.classList.toggle("has-product",Boolean(state.currentProductId));
    workContext.classList.toggle("no-product",!state.currentProductId);
  }
  if(ctaText){
    const count=state && Array.isArray(state.selected) ? state.selected.length : 0;
    ctaText.textContent=count ? `已选 ${count} 条` : "尚未选择参数";
  }
  syncMobileSelectCta();
}

function syncMobileSelectCta(){
  const cta=document.querySelector(".mobile-select-cta");
  const button=cta && cta.querySelector("button");
  const count=state && Array.isArray(state.selected) ? state.selected.length : 0;
  const show=isMobileViewport() && state.mobileTab==="select" && count>0;
  if(cta){
    cta.hidden=!show;
    cta.classList.toggle("is-empty",count===0);
    cta.classList.toggle("has-selection",count>0);
  }
  if(button){
    button.disabled=count===0;
    button.setAttribute("aria-disabled",count===0 ? "true" : "false");
  }
}

function toggleMobileMoreMenu(event){
  if(event){
    event.stopPropagation();
  }
  const nextOpen=!document.body.classList.contains("mobile-menu-open");
  document.body.classList.toggle("mobile-menu-open",nextOpen);
  const button=document.getElementById("mobileMoreBtn");
  if(button){
    button.setAttribute("aria-expanded",nextOpen ? "true" : "false");
  }
}

function closeMobileMoreMenu(){
  document.body.classList.remove("mobile-menu-open");
  const button=document.getElementById("mobileMoreBtn");
  if(button){
    button.setAttribute("aria-expanded","false");
  }
}
