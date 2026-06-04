/* ============================ Customer list (Excel .xlsx) ============================ */
// Reads an .xlsx directly in the browser (ZIP + DecompressionStream + XML — no external library)
// and maps each row by its customer number ("Kunde-Adr.") to a delivery address. Orders carry a
// customer number (o.customerNo); the matching row fills o.address (shown via tooltip + info icon).

// columns we pull from the sheet "Rohdaten Lieferadressen" (matched by header text, case/space-insensitive).
// the customer number = "Company number" + "-" + "Address number" (e.g. 170829-001) -> that is the map key.
const CUST_COLS = { companyNo:"Company number", addressNo:"Address number", reName:"RE Name", adr1:"Adr.Name1", strasse:"Straße", zip:"Zipcode", stadt:"Stadt", country:"Country" };
let CUSTOMERS = {};                       // "<company>-<address>" -> {reName, adr1, strasse, zip, stadt, country}
let CUSTOMER_KEYS = [];                    // sorted keys for autocomplete
let customerMeta = { file:"", count:0 };  // loaded file name + row count

function rebuildCustomerKeys(){ CUSTOMER_KEYS = Object.keys(CUSTOMERS).sort(); }
function saveCustomers(){ try{ localStorage.setItem("lkwPlaner.customers", JSON.stringify({meta:customerMeta, map:CUSTOMERS})); }catch(_){} }
function loadCustomers(){
  try{ const s = localStorage.getItem("lkwPlaner.customers");
    if(s){ const d = JSON.parse(s); CUSTOMERS = d.map || {}; customerMeta = d.meta || {file:"",count:0}; } }catch(_){}
  rebuildCustomerKeys();
}

// --- minimal ZIP reader (central directory) + raw inflate via DecompressionStream ---
async function inflateRaw(bytes){
  if(typeof DecompressionStream==="undefined") throw new Error("Browser unterstützt kein DecompressionStream");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf, want){
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for(let i=buf.length-22; i>=0 && i > buf.length-22-65557; i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) throw new Error("Keine gültige .xlsx-Datei (kein ZIP)");
  const nEntries = dv.getUint16(eocd+10, true);
  let p = dv.getUint32(eocd+16, true);   // central directory offset
  const dec = new TextDecoder();
  const out = {};
  for(let e=0; e<nEntries; e++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const method = dv.getUint16(p+10, true);
    const compSize = dv.getUint32(p+20, true);
    const nameLen = dv.getUint16(p+28, true);
    const extraLen = dv.getUint16(p+30, true);
    const commentLen = dv.getUint16(p+32, true);
    const localOff = dv.getUint32(p+42, true);
    const name = dec.decode(buf.subarray(p+46, p+46+nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if(!want(name)) continue;
    const lhNameLen = dv.getUint16(localOff+26, true);
    const lhExtraLen = dv.getUint16(localOff+28, true);
    const start = localOff + 30 + lhNameLen + lhExtraLen;
    const comp = buf.subarray(start, start+compSize);
    out[name] = (method===0) ? comp : await inflateRaw(comp);
  }
  return out;
}

// --- xlsx -> grid of strings ---
function colNum(ref){ let c=0; for(let i=0;i<ref.length;i++){ const ch=ref[i]; if(ch>="A"&&ch<="Z") c=c*26+(ch.charCodeAt(0)-64); else break; } return c-1; }
function sheetGrid(doc, shared){
  const rows = doc.getElementsByTagName("row"), grid = [];
  for(let i=0;i<rows.length;i++){
    const cells = rows[i].getElementsByTagName("c"), arr = [];
    for(let j=0;j<cells.length;j++){
      const c = cells[j], ci = colNum(c.getAttribute("r")||""), t = c.getAttribute("t");
      let val = "";
      const v = c.getElementsByTagName("v")[0], is = c.getElementsByTagName("is")[0];
      if(t==="s" && v) val = shared[+v.textContent] || "";
      else if(t==="inlineStr" && is){ const ts=is.getElementsByTagName("t"); for(let k=0;k<ts.length;k++) val += ts[k].textContent; }
      else if(v) val = v.textContent;
      if(ci>=0) arr[ci] = val;
    }
    grid.push(arr);
  }
  return grid;
}
const normHdr = s => String(s||"").trim().toLowerCase().replace(/\s+/g," ");
function gridToCustomers(grid){
  const want = {}; for(const [k,label] of Object.entries(CUST_COLS)) want[k] = normHdr(label);
  let colmap = null, hr = -1;
  for(let i=0;i<Math.min(grid.length,40);i++){          // locate the header row
    const row = grid[i]||[], m = {};
    row.forEach((cell,idx)=>{ const n = normHdr(cell); for(const k in want) if(n===want[k]) m[k]=idx; });
    if(m.companyNo!=null && m.addressNo!=null){ colmap = m; hr=i; break; }
  }
  if(!colmap) return null;
  const map = {};
  for(let i=hr+1;i<grid.length;i++){
    const row = grid[i]||[];
    const g = c => (colmap[c]!=null ? String(row[colmap[c]]||"").trim() : "");
    const comp = g("companyNo"), adr = g("addressNo");
    if(!comp && !adr) continue;
    const key = `${comp}-${adr}`;        // customer number = company-address
    map[key] = { reName:g("reName"), adr1:g("adr1"), strasse:g("strasse"), zip:g("zip"), stadt:g("stadt"), country:g("country") };
  }
  return map;
}
async function parseXlsx(file){
  const buf = new Uint8Array(await file.arrayBuffer());
  const isSheet = n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n);
  const entries = await unzip(buf, n => n==="xl/sharedStrings.xml" || isSheet(n));
  const dec = new TextDecoder(), parser = new DOMParser();
  const shared = [];
  if(entries["xl/sharedStrings.xml"]){
    const sd = parser.parseFromString(dec.decode(entries["xl/sharedStrings.xml"]), "application/xml");
    const sis = sd.getElementsByTagName("si");
    for(let i=0;i<sis.length;i++){ const ts=sis[i].getElementsByTagName("t"); let s=""; for(let j=0;j<ts.length;j++) s+=ts[j].textContent; shared.push(s); }
  }
  for(const key of Object.keys(entries).filter(isSheet).sort()){
    const map = gridToCustomers(sheetGrid(parser.parseFromString(dec.decode(entries[key]), "application/xml"), shared));
    if(map && Object.keys(map).length) return map;
  }
  throw new Error("Spalten („Kunde-Adr.“, „Straße“ …) nicht gefunden");
}

// --- lookup + address formatting ---
function lookupCustomer(no){ const k = String(no||"").trim(); return (k && CUSTOMERS[k]) ? CUSTOMERS[k] : null; }
function formatCustomerAddress(r){
  if(!r) return "";
  const lines = [];
  if(r.reName) lines.push(r.reName);
  if(r.adr1 && r.adr1!==r.reName) lines.push(r.adr1);
  if(r.strasse) lines.push(r.strasse);
  const city = [r.zip, r.stadt].filter(Boolean).join(" "); if(city) lines.push(city);
  if(r.country) lines.push(r.country);
  return lines.join("\n");
}
function resolveOrderAddress(o){
  if(!o) return;
  const rec = lookupCustomer(o.customerNo);
  if(rec) o.address = formatCustomerAddress(rec);
  else if(customerMeta.count>0) o.address = "";   // a list is loaded but the number isn't in it
}
function resolveAllAddresses(){ if(typeof orders!=="undefined") orders.forEach(resolveOrderAddress); }
// compact one-line address for the autocomplete list
function custShortAddr(r){
  if(!r) return "";
  const city = [r.zip, r.stadt].filter(Boolean).join(" ");
  return [r.adr1, r.strasse, city, r.country].filter(Boolean).join(", ");
}

// --- settings UI: load / clear the list, status text ---
function excelStatusText(){
  return customerMeta.count>0 ? t('excelStatus', customerMeta.count, customerMeta.file) : t('excelNone');
}
function updateExcelStatus(){ const el = document.getElementById("excelStatus"); if(el) el.textContent = excelStatusText(); }
function loadExcelFile(){
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx,.xlsm";
  inp.addEventListener("change", async ()=>{
    const f = inp.files && inp.files[0]; if(!f) return;
    try{
      const map = await parseXlsx(f);
      CUSTOMERS = map; customerMeta = { file:f.name, count:Object.keys(map).length };
      rebuildCustomerKeys(); saveCustomers(); resolveAllAddresses();
      if(typeof renderAll==="function") renderAll();
      updateExcelStatus();
      if(typeof notify==="function") notify("ok", t('excelLoaded', customerMeta.count), esc(customerMeta.file), 4000);
    }catch(err){
      if(typeof notify==="function") notify("warn", t('excelError'), esc(String(err && err.message || err)), 6000);
    }
  });
  inp.click();
}
// --- autocomplete: suggest matching customer numbers while typing into an order ---
function custMatches(q){
  q = String(q||"").trim().toLowerCase(); if(!q) return [];
  const pre = [], inc = [];
  for(const k of CUSTOMER_KEYS){
    const lk = k.toLowerCase();
    if(lk.startsWith(q)) pre.push(k);
    else if(lk.indexOf(q)>=0) inc.push(k);
    if(pre.length>=12) break;
  }
  return pre.concat(inc).slice(0,12);
}
// suggest numbers whose RE Name matches the order's customer name (used when the field is focused empty)
function custMatchesByName(name){
  name = String(name||"").trim().toLowerCase(); if(!name) return [];
  const out = [];
  for(const k of CUSTOMER_KEYS){
    const rn = ((CUSTOMERS[k]||{}).reName||"").toLowerCase();
    if(rn && (rn.indexOf(name)>=0 || name.indexOf(rn)>=0)) out.push(k);
    if(out.length>=12) break;
  }
  return out;
}
let custSugEl = null, custSugInput = null, custSugOrder = null, custSugMatches = [], custSugIdx = -1;
function hideCustSuggest(){ if(custSugEl) custSugEl.style.display = "none"; custSugInput = null; custSugOrder = null; custSugMatches = []; custSugIdx = -1; }
function highlightCustSug(){
  if(!custSugEl) return;
  const items = custSugEl.querySelectorAll(".cs-item");
  for(let i=0;i<items.length;i++) items[i].classList.toggle("active", i===custSugIdx);
  if(custSugIdx>=0 && items[custSugIdx]) items[custSugIdx].scrollIntoView({block:"nearest"});
}
function pickCustSuggest(key){
  const ord = custSugOrder, inp = custSugInput;
  if(inp) inp.value = key;                              // so a following blur/change reads the FULL number
  if(ord){ ord.customerNo = key; if(typeof resolveOrderAddress==="function") resolveOrderAddress(ord); }
  hideCustSuggest();
  if(typeof renderList==="function") renderList();
  if(typeof saveState==="function") saveState();
}
function custSuggest(inputEl, o){
  if(!CUSTOMER_KEYS.length){ hideCustSuggest(); return; }
  const v = String(inputEl.value||"").trim();
  const matches = v ? custMatches(v) : custMatchesByName(o && o.customer);   // focus empty -> match by customer name
  if(!custSugEl){
    custSugEl = document.createElement("div"); custSugEl.id = "custSuggest"; document.body.appendChild(custSugEl);
    custSugEl.addEventListener("mousedown", ev=>{        // mousedown fires before the input's blur
      const it = ev.target.closest("[data-cust]"); if(!it) return; ev.preventDefault();
      pickCustSuggest(it.dataset.cust);
    });
    document.addEventListener("click", ev=>{ if(custSugEl && custSugEl.style.display==="block" && !custSugEl.contains(ev.target) && ev.target!==custSugInput) hideCustSuggest(); });
    window.addEventListener("wheel", ev=>{ if(custSugEl && custSugEl.style.display==="block" && !custSugEl.contains(ev.target)) hideCustSuggest(); }, true);
  }
  custSugInput = inputEl; custSugOrder = o; custSugMatches = matches; custSugIdx = matches.length ? 0 : -1;
  if(!matches.length){ hideCustSuggest(); return; }
  custSugEl.innerHTML = matches.map(k=>{
    const r = CUSTOMERS[k] || {};
    const name = r.reName ? esc(r.reName) : "";
    const addr = esc(custShortAddr(r));
    return `<div class="cs-item" data-cust="${esc(k)}"><div class="cs-top"><b>${esc(k)}</b>${name?` <span>${name}</span>`:""}</div>${addr?`<div class="cs-addr">${addr}</div>`:""}</div>`;
  }).join("");
  const rc = inputEl.getBoundingClientRect();
  custSugEl.style.minWidth = Math.max(190, rc.width) + "px";
  custSugEl.style.left = "0px"; custSugEl.style.top = "0px";
  custSugEl.style.display = "block";
  const w = custSugEl.offsetWidth, h = custSugEl.offsetHeight;   // measured -> clamp into the viewport
  let left = rc.left; if(left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - w);
  let top = rc.bottom + 2; if(top + h > window.innerHeight - 8) top = Math.max(8, rc.top - 2 - h);   // flip above if needed
  custSugEl.style.left = left + "px";
  custSugEl.style.top = top + "px";
  highlightCustSug();
}
// keyboard navigation in the suggestion list; returns true if the key was handled
function custSuggestKey(e){
  if(!custSugEl || custSugEl.style.display!=="block" || !custSugMatches.length) return false;
  if(e.key==="ArrowDown"){ custSugIdx = Math.min(custSugIdx+1, custSugMatches.length-1); highlightCustSug(); return true; }
  if(e.key==="ArrowUp"){ custSugIdx = Math.max(custSugIdx-1, 0); highlightCustSug(); return true; }
  if(e.key==="Enter"){ if(custSugIdx>=0){ pickCustSuggest(custSugMatches[custSugIdx]); return true; } }
  if(e.key==="Escape"){ hideCustSuggest(); return true; }
  return false;
}
loadCustomers();   // the list is persistent (its own localStorage key) — only re-loading an Excel replaces it
// re-resolve addresses from the (persisted) list once everything has booted
if(customerMeta.count>0 && typeof orders!=="undefined" && typeof renderAll==="function"){ resolveAllAddresses(); renderAll(); }
const _btnLoadExcel = document.getElementById("btnLoadExcel"); if(_btnLoadExcel) _btnLoadExcel.addEventListener("click", loadExcelFile);
