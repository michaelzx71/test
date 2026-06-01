// Quote upload and local quote-file normalization helpers.
function bindQuoteFileInput(){
  const input=document.getElementById("quoteFileInput");
  if(!input || input.dataset.bound==="true") return;
  input.dataset.bound="true";
  input.addEventListener("change",event=>{
    const file=event.target.files && event.target.files[0];
    if(!file){
      setQuoteUploadState("没有选择文件，可以重新选择。",{busy:false});
      return;
    }
    setQuoteUploadState("正在识别产品，马上进入匹配确认...",{busy:true});
    parseQuoteFile(file,state.quoteUploadAnchor);
  });
}

function triggerQuoteFileSelection(event){
  state.quoteUploadAnchor=getEventAnchor(event);
  const input=document.getElementById("quoteFileInput");
  if(!input){
    showToast("当前页面无法打开报价单选择器","error",state.quoteUploadAnchor);
    return;
  }
  openQuoteUploadModal(state.quoteUploadAnchor);
}

function getFileExtension(fileName){
  const text=toText(fileName).trim().toLowerCase();
  const index=text.lastIndexOf(".");
  return index===-1 ? "" : text.slice(index+1);
}

function readFileAsText(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(toText(reader.result));
    reader.onerror=()=>reject(new Error("FILE_READ"));
    reader.readAsText(file,"utf-8");
  });
}

function loadXlsxLibrary(){
  if(window.XLSX){
    return Promise.resolve(window.XLSX);
  }
  if(xlsxLibraryPromise){
    return xlsxLibraryPromise;
  }
  xlsxLibraryPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="vendor/xlsx.full.min.js";
    script.async=true;
    script.onload=()=>window.XLSX ? resolve(window.XLSX) : reject(new Error("XLSX_LOAD"));
    script.onerror=()=>reject(new Error("XLSX_LOAD"));
    document.head.appendChild(script);
  });
  return xlsxLibraryPromise;
}

function normalizeQuoteCellValue(value){
  return toText(value)
    .replace(/\r\n/g,"\n")
    .replace(/\r/g,"\n")
    .replace(/[ \t]+/g," ")
    .trim();
}

function normalizeQuoteRows(rows,maxRows=220,maxCols=40){
  const normalizedRows=[];
  let truncatedRows=false;
  let truncatedCols=false;

  rows.slice(0,maxRows).forEach((row,rowIndex)=>{
    const cells=Array.isArray(row) ? row : [];
    const normalizedCells=cells.map(normalizeQuoteCellValue);
    const lastValueIndex=normalizedCells.reduce((lastIndex,cell,index)=>cell ? index : lastIndex,-1);
    if(lastValueIndex===-1) return;

    const visibleCells=normalizedCells.slice(0,Math.min(lastValueIndex+1,maxCols));
    if(lastValueIndex+1>maxCols){
      truncatedCols=true;
    }

    normalizedRows.push({
      row_number:rowIndex+1,
      cells:visibleCells
    });
  });

  if(rows.length>maxRows){
    truncatedRows=true;
  }

  return {rows:normalizedRows,truncatedRows,truncatedCols};
}

function extractQuoteLineItems(standardQuote){
  const items=[];
  (standardQuote && Array.isArray(standardQuote.sheets) ? standardQuote.sheets : []).forEach(sheet=>{
    let headerRowIndex=-1;
    let headerMap=null;
    (sheet.rows || []).forEach((row,index)=>{
      const cells=Array.isArray(row.cells) ? row.cells.map(cell=>toText(cell).trim()) : [];
      if(headerRowIndex!==-1) return;
      const productLineIndex=cells.findIndex(cell=>cell==="产品线");
      const productModelIndex=cells.findIndex(cell=>cell==="产品型号");
      const productDescIndex=cells.findIndex(cell=>cell==="产品说明");
      if(productLineIndex!==-1 && productModelIndex!==-1 && productDescIndex!==-1){
        headerRowIndex=index;
        headerMap={
          serial:cells.findIndex(cell=>cell==="序号"),
          productLine:productLineIndex,
          productModel:productModelIndex,
          productDesc:productDescIndex,
          quantity:cells.findIndex(cell=>cell==="数量"),
          unit:cells.findIndex(cell=>cell==="单位")
        };
      }
    });
    if(headerRowIndex===-1 || !headerMap) return;
    (sheet.rows || []).slice(headerRowIndex+1).forEach(row=>{
      const cells=Array.isArray(row.cells) ? row.cells.map(cell=>toText(cell).trim()) : [];
      const productLine=toText(cells[headerMap.productLine]).trim();
      const productModel=toText(cells[headerMap.productModel]).trim();
      const description=toText(cells[headerMap.productDesc]).trim();
      if(!productLine && !productModel && !description) return;
      items.push({
        source_sheet_name:toText(sheet.name).trim(),
        source_row_number:Number(row.row_number) || 0,
        serial_no:toText(cells[headerMap.serial]).trim(),
        product_line:productLine,
        product_model:productModel,
        description,
        quantity:toText(cells[headerMap.quantity]).trim(),
        unit:toText(cells[headerMap.unit]).trim()
      });
    });
  });
  return items;
}

function buildStandardQuotePayload(file,sheets,notes=[]){
  return {
    format:"quote_standard_v1",
    source_file:{
      name:toText(file && file.name).trim(),
      extension:getFileExtension(file && file.name),
      mime_type:toText(file && file.type).trim(),
      size_kb:file ? Math.max(1,Math.round(file.size/1024)) : 0
    },
    sheets,
    notes
  };
}

function standardizeQuoteWorkbook(file){
  return loadXlsxLibrary().then(()=>readSelectedExcelFile(file)).then(data=>{
    let wb;
    try{
      wb=XLSX.read(data,{type:"array",cellDates:true});
    }catch(parseError){
      throw new Error("XLSX_PARSE:"+parseError.message);
    }

    const notes=[];
    const sheets=[];
    wb.SheetNames.forEach(sheetName=>{
      const sheet=wb.Sheets[sheetName];
      if(!sheet || !sheet["!ref"]) return;
      const rows=XLSX.utils.sheet_to_json(sheet,{
        header:1,
        defval:"",
        raw:false,
        blankrows:false
      });
      const normalized=normalizeQuoteRows(rows);
      if(normalized.rows.length===0) return;
      if(normalized.truncatedRows){
        notes.push(`工作表「${sheetName}」行数较多，仅保留前 220 行。`);
      }
      if(normalized.truncatedCols){
        notes.push(`工作表「${sheetName}」列数较多，每行仅保留前 40 列。`);
      }
      sheets.push({
        name:sheetName,
        row_count:rows.length,
        rows:normalized.rows
      });
    });

    if(sheets.length===0){
      throw new Error("QUOTE_EMPTY");
    }

    return buildStandardQuotePayload(file,sheets,notes);
  });
}

function standardizeDelimitedQuote(file,text,delimiter){
  const lines=toText(text).split(/\r\n|\n|\r/);
  const rows=lines.map(line=>line.split(delimiter));
  const normalized=normalizeQuoteRows(rows,260,50);
  const notes=[];
  if(normalized.truncatedRows){
    notes.push("文本行数较多，仅保留前 260 行。");
  }
  if(normalized.truncatedCols){
    notes.push("文本列数较多，每行仅保留前 50 列。");
  }
  if(normalized.rows.length===0){
    throw new Error("QUOTE_EMPTY");
  }
  return buildStandardQuotePayload(file,[{
    name:"报价单",
    row_count:rows.length,
    rows:normalized.rows
  }],notes);
}

function standardizePlainQuote(file,text){
  const normalizedText=toText(text).trim();
  if(!normalizedText){
    throw new Error("QUOTE_EMPTY");
  }
  return buildStandardQuotePayload(file,[{
    name:"报价单文本",
    row_count:normalizedText.split(/\r\n|\n|\r/).length,
    rows:[{
      row_number:1,
      cells:[normalizedText]
    }]
  }],[]);
}

function standardizeQuoteFile(file){
  const ext=getFileExtension(file.name);
  if(["xlsx","xls","xlsm","xlsb"].includes(ext)){
    return standardizeQuoteWorkbook(file);
  }
  if(["csv","tsv","txt","json"].includes(ext)){
    return readFileAsText(file).then(text=>{
      if(ext==="csv") return standardizeDelimitedQuote(file,text,",");
      if(ext==="tsv") return standardizeDelimitedQuote(file,text,"\t");
      return standardizePlainQuote(file,text);
    });
  }
  throw new Error("QUOTE_UNSUPPORTED");
}
