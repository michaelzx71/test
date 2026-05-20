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
      const drawerButton=event.target && event.target.closest && event.target.closest(".mobile-current-product,.mobile-context-btn");
      if((drawer && drawer.contains(event.target)) || drawerButton) return;
      closeMobileProductDrawer();
    }
  });
  updateMobileMode();
}

function updateMobileMode(){
  const mobile=isMobileViewport();
  document.body.classList.toggle("is-mobile",mobile);
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
  document.body.classList.add("mobile-product-drawer-open");
  if(!options.silent){
    const sidebar=document.getElementById("sidebar");
    if(sidebar){
      requestAnimationFrame(()=>sidebar.focus({preventScroll:true}));
    }
  }
}

function closeMobileProductDrawer(event){
  if(event && event.stopPropagation){
    event.stopPropagation();
  }
  document.body.classList.remove("mobile-product-drawer-open");
}

function updateMobileContext(){
  const productNameEl=document.getElementById("mobileContextProductName");
  const instanceNameEl=document.getElementById("mobileContextInstanceName");
  const ctaText=document.getElementById("mobileSelectCtaText");
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
  if(ctaText){
    ctaText.textContent=`已选 ${state.selected.length} 条`;
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
