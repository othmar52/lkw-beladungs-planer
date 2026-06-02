/* ============================ Rendering: truck graphic ============================ */
let hoverLayout = null;                       // current layout for hover measurements
const HOVER_PAD = 120;
function renderTruck(layout){
  hoverLayout = layout;
  const {truck, placements, usedLength} = layout;
  const L = truck.l, W = truck.w;
  const pad = HOVER_PAD;                     // mm margin in the viewBox
  const svg = document.getElementById("truckSvg");
  const vbW = L + pad*2, vbH = W + pad*2 + 320; // space below for the ruler
  svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  let s = "";

  // truck outline
  s += `<rect x="${pad}" y="${pad}" width="${L}" height="${W}" rx="40" fill="#0e151d" stroke="#3a4756" stroke-width="14"/>`;
  // front marker (front = left)
  s += `<rect x="${pad}" y="${pad}" width="60" height="${W}" fill="#5b6b7d" opacity=".25"/>`;
  s += `<text x="${pad+90}" y="${pad+W/2}" font-size="190" fill="#7b8a9c" dominant-baseline="middle" transform="rotate(-90 ${pad+90} ${pad+W/2})" text-anchor="middle">${t('vorne')}</text>`;

  // pallets (each in <g data-oid> -> click highlights the order row)
  for(const p of placements){
    const x = pad + p.x, y = pad + p.y;
    const stroke = p.overflow ? "#f04444" : "rgba(0,0,0,.45)";
    const dash = p.overflow ? `stroke-dasharray="80 60"` : "";
    const cx = x + p.w/2, cy = y + p.h/2;
    const label = (p.order.orderNo || "#"+p.order.id);
    const pidAttr = (p.pid!=null) ? ` data-pid="${p.pid}"` : "";
    s += `<g class="pal" data-oid="${p.order.id}"${pidAttr} style="cursor:pointer">`;
    s += `<rect x="${x+12}" y="${y+12}" width="${p.w-24}" height="${p.h-24}" rx="22" fill="${p.color}" fill-opacity="${p.overflow?.5:.92}" stroke="${stroke}" stroke-width="12" ${dash}/>`;
    s += `<text class="pal-label" x="${cx}" y="${cy}" font-size="170" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`;
    if(p.stack===2){
      s += `<text x="${x+p.w-70}" y="${y+150}" font-size="150" text-anchor="end" fill="#11203a" font-weight="800">2×</text>`;
    }
    s += `</g>`;
  }

  // used-length marker
  if(usedLength>0 && usedLength<=L){
    const ux = pad + usedLength;
    s += `<line x1="${ux}" y1="${pad-30}" x2="${ux}" y2="${pad+W+30}" stroke="#34d399" stroke-width="14" stroke-dasharray="50 40"/>`;
  }

  // ruler (metres) at the bottom
  const by = pad + W + 120;
  s += `<line x1="${pad}" y1="${by}" x2="${pad+L}" y2="${by}" stroke="#3a4756" stroke-width="8"/>`;
  for(let m=0; m<=Math.floor(L/1000); m++){
    const mx = pad + m*1000;
    s += `<line x1="${mx}" y1="${by-20}" x2="${mx}" y2="${by+20}" stroke="#5b6b7d" stroke-width="8"/>`;
    s += `<text x="${mx}" y="${by+160}" font-size="150" fill="#7b8a9c" text-anchor="middle">${m}m</text>`;
  }
  s += `<g id="hoverGuide" style="pointer-events:none"></g>`;   // hover measurements (gaps)
  s += `<g id="dropGuide" style="pointer-events:none"></g>`;    // manual-mode drop preview (not cleared by hover)
  svg.innerHTML = s;
}

/* ============================ Rendering: totals + info ============================ */
function renderTotals(layout){
  const L = layout.truck.l/1000;
  const used = Math.ceil(layout.usedLength/100)/10;
  const free = Math.max(0, Math.round((L-used)*10)/10);
  const hidden = (hideInactive && !filterText) ? orders.filter(o=>!onActive(o)).length : 0;
  const hiddenSpan = hidden>0
    ? `<span class="hiddeninfo"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>${esc(t('hiddenInfo', hidden))}</span>`
    : "";
  const el = document.getElementById("totals");
  el.innerHTML =
    `<span>${t('used')} <b class="${layout.fits?'':'bad'}">${used.toFixed(1)} m</b></span>` +
    `<span>${t('free')} <b>${free.toFixed(1)} m</b></span>` +
    `<span>${t('truckLen')} <b>${L.toFixed(2)} m</b></span>` +
    hiddenSpan;
}
// the Verlauf (history) view: last few undo/redo steps, click to jump
function historyHtml(){
  const h = historyView();
  if(!h.u.length && !h.r.length) return `<div class="empty" style="grid-column:auto">${t('histEmpty')}</div>`;
  let s = `<div class="histlist">`;
  for(let i=h.u.length-1; i>=0; i--){   // past: oldest at top, most recent just above "now"
    const e = h.u[i];
    s += `<div class="histitem undo" data-hk="undo" data-hs="${e.steps}" title="${esc(t('histJump'))}">`+
         `<span class="hdot"></span><span class="hlbl">${esc(e.label||t('hist_change'))}</span></div>`;
  }
  s += `<div class="histitem now"><span class="hdot nowdot"></span><span class="hlbl">${esc(t('histNow'))}</span></div>`;
  if(h.r.length){
    s += `<div class="histdiv">${esc(t('histRedo'))}</div>`;
    for(const e of h.r)   // future: next redo first
      s += `<div class="histitem redo" data-hk="redo" data-hs="${e.steps}" title="${esc(t('histJump'))}">`+
           `<span class="hdot"></span><span class="hlbl">${esc(e.label||t('hist_change'))}</span></div>`;
  }
  return s + `</div>`;
}
function renderInfo(layout){
  const truck = layout.truck;
  const active = loadOrders(activeLoad());   // virtual orders on the active load (qty = assigned)
  const totalPal = active.reduce((s,o)=> s + o.qty, 0);
  const over = layout.placements.filter(p=>p.overflow).reduce((s,p)=> s + (p.stack||1), 0);
  const loaded = totalPal - over;
  const countTxt = over>0 ? t('palLoaded', loaded, totalPal) : t('palCount', totalPal);
  const histMode = settings.rightView==="history";
  document.getElementById("infoHead").innerHTML =
    `<span class="rvtog"><button type="button" class="rvbtn ${!histMode?"on":""}" data-rv="info">${esc(t('tabInfo'))}</button>`+
    `<button type="button" class="rvbtn ${histMode?"on":""}" data-rv="history">${esc(t('histTitle'))}</button></span>`+
    (active.length ? `<span class="infocount ${over>0?"bad":""}">${esc(countTxt)}</span>` : "");
  const body = document.getElementById("infoBody");
  const fmsg = document.getElementById("fitMsg");
  if(histMode){
    fmsg.style.display = "none";
    body.innerHTML = historyHtml();
    // keep the newest step ("jetzt") in view so the latest entry is always visible
    const now = body.querySelector(".histitem.now");
    if(now){
      const rN = now.getBoundingClientRect(), rB = body.getBoundingClientRect();
      body.scrollTop += (rN.top - rB.top) - body.clientHeight/2 + rN.height/2;
    }
    return;
  }
  fmsg.style.display = "";
  if(active.length===0){ body.innerHTML = `<div class="empty" style="grid-column:auto">${t('noActive')}</div>`; }
  else{
    body.innerHTML = active.map(o=>{
      const lm = orderLoadMeters(o,truck).toFixed(1);
      return `<div class="inforow"><span class="infodot" style="background:${o.color}"></span>`+
        `<span class="infotxt"><b>${esc(o.orderNo||"#"+o.id)}</b> · ${esc(o.customer||"—")}<br>`+
        `<small>${esc(t('infoRow', o.qty, lm))}</small></span></div>`;
    }).join("");
  }
  const msg = document.getElementById("fitMsg");
  if(active.length===0){ msg.className="fit-ok"; msg.textContent="–"; }
  else if(layout.fits){ msg.className="fit-ok"; msg.textContent=t('fitOk'); }
  else{ msg.className="fit-bad"; msg.innerHTML = `<span>${esc(t('fitBad', over))}</span>`+
    `<button id="resolveOverflow" class="ofbtn" type="button">${esc(t('overflowResolve'))}</button>`; }
}

/* ============================ Rendering: order list ============================ */
const SORT_COLS = [
  {key:"orderNo", label:"Auftragsnr.", cls:"w-num"},
  {key:"customer",          label:"Kunde",       cls:"w-customer"},
  {key:"deliveryDate",    label:"Lieferdatum", cls:"w-date", date:true},
  {key:"destCode",       label:"Dest",        cls:"w-dest"},
  {key:"qty",         label:"Pal.",        cls:"w-pal", num:true},
  {key:"lbh",             label:"L×B×H mm",    cls:"w-lbh", num:true, sortKey:"length"},
  {key:"loadMode",        label:"Ladeart",     cls:"w-art"},
  {key:"sequence",    label:"Reihenfolge", cls:"w-seq"},
  {key:"stackable",      label:"Stapelbar",   cls:"w-stack", bool:true},
  {key:"assign",          label:"Auf Ladung",  cls:"w-assign", assign:true},
  {key:"status",          label:"Verteilung",  cls:"w-status", nosort:true},
  {key:"remark",      label:"Bemerkung",   cls:"w-remark"},
];
let sortState = {key:null, dir:1};
function dateVal(s){ const m=/^(\d{2})\.(\d{2})\.(\d{2})$/.exec(String(s||"").trim()); return m ? (+m[3])*10000+(+m[2])*100+(+m[1]) : -1; }
function sortOrders(key){
  const col = SORT_COLS.find(c=>c.key===key); if(!col) return;
  record(t('hist_sort'));   // reordering the list is an undoable action
  if(sortState.key===key) sortState.dir *= -1; else { sortState.key=key; sortState.dir=1; }
  const dir = sortState.dir, f = col.sortKey || key;
  orders.sort((a,b)=>{
    if(col.assign){ const L=activeLoad(); return (assignedOn(L,a)-assignedOn(L,b))*dir; }
    if(col.bool) return ((a[f]?1:0)-(b[f]?1:0))*dir;
    if(col.num)  return ((+a[f]||0)-(+b[f]||0))*dir;
    if(col.date) return (dateVal(a[f])-dateVal(b[f]))*dir;
    return String(a[f]??"").localeCompare(String(b[f]??""), "de", {numeric:true})*dir;
  });
  renderList(); recalc();   // recalc re-applies the per-row position band
}

/* ---------- loads (tabs + per-order assignment status) ---------- */
function loadIndex(l){ return loads.indexOf(l); }
function loadLabel(l){ return (l.name && l.name.trim()) ? l.name.trim() : t('loadTab', loadIndex(l)+1); }
function loadShort(l){ const n = loadLabel(l); return n.length>9 ? n.slice(0,8)+"…" : n; }
// per-order status chips: how many pallets are still open + which OTHER loads hold some
function assignStatHtml(o){
  if((o.qty|0)<=0) return "";
  const open = openQty(o);
  let h = "";
  if(open>0) h += `<span class="chip open">${esc(t('openN', open))}</span>`;
  for(const l of loads){
    if(l.id===activeLoadId) continue;
    const n = l.assign[o.id]|0; if(n<=0) continue;
    h += `<span class="chip other" data-loadjump="${l.id}" title="${esc(loadLabel(l))}: ${n} — ${esc(t('jumpLoad'))}">${esc(loadShort(l))}: ${n}</span>`;
  }
  return h;
}
// tab bar above the truck graphic: one tab per load (name + pallet count) + add button
function renderTabs(){
  const bar = document.getElementById("loadTabs"); if(!bar) return;
  let h = "";
  loads.forEach(l=>{
    const cnt = orders.reduce((s,o)=> s + (l.assign[o.id]|0), 0);
    const act = l.id===activeLoadId;
    h += `<button class="ltab ${act?'active':''}" data-loadid="${l.id}" title="${esc(loadLabel(l))} — ${esc(l.truck)}">`+
      `<span class="ltabname">${esc(loadLabel(l))}</span>`+
      `<span class="ltabcount" title="${esc(t('palCount', cnt))}">${cnt}</span>`+
      (loads.length>1?`<span class="ltabx" data-loaddel="${l.id}" title="${esc(t('loadDel'))}">×</span>`:``)+
      `</button>`;
  });
  h += `<button class="ltabadd" data-loadadd="1" title="${esc(t('loadAdd'))}">`+
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg></button>`;
  bar.innerHTML = h;
}

// inline header controls (clear active load / hide off-load) — placed between Auf-Ladung and Bemerkung
// does an order match the current search text?
function searchMatch(o){
  return !filterText || (`${o.orderNo} ${o.customer} ${o.destCode} ${o.deliveryDate} ${o.remark}`).toLowerCase().includes(filterText);
}
// how many orders are currently hidden (by the search, else by hide-inactive) — shown as a badge
function hiddenCount(){
  if(filterText)    return orders.filter(o=>!searchMatch(o)).length;
  if(hideInactive)  return orders.filter(o=>!onActive(o)).length;
  return 0;
}
// the "Ladeart" column header is a dropdown that sets ALL orders' load type at once
function setAllModeHtml(){
  return `<select class="w-art setallmode" title="${esc(t('setAllModeTitle'))}">`+
    `<option value="">${t('col_loadMode')}</option>`+
    `<option value="optimized">${t('opt_optimized')}</option>`+
    `<option value="long">${t('opt_long')}</option>`+
    `<option value="wide">${t('opt_wide')}</option>`+
    `<option value="longwide">${t('opt_longwide')}</option>`+
  `</select>`;
}
function headCtlHtml(){
  const filtering = !!filterText;   // a search is active -> highlight the hide/show toggle
  const hideTitle = filtering ? t('hideSearch') : (hideInactive?t('hideShow'):t('hideHide'));
  const hc = hiddenCount();
  return `<span class="headctl">`+
    `<button class="hbtn" data-listact="allInactive" title="${esc(t('titleDeselect'))}">`+
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M16 9l-6 6-3-3"/></svg></button>`+
    `<button class="hbtn ${hideInactive?'on':''} ${filtering?'filtering':''}" data-listact="hideInactive" title="${esc(hideTitle)}">`+
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>`+
      (hc>0?`<span class="cnt">${hc}</span>`:``)+`</button>`+
  `</span>`;
}
// always-present add / paste buttons at the end of the list
function listFooterHtml(){
  return `<div id="listFooter">`+
    `<button data-listact="add"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>${t('btnAdd')}</button>`+
    `<button data-listact="paste"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/></svg>${t('btnPaste')}</button>`+
  `</div>`;
}
function renderList(){
  const truck = TRUCKS[currentTruck];
  const list = document.getElementById("list");
  // persistent skeleton: sticky head (sortable columns + inline controls + search) and the row body
  if(!document.getElementById("listBody")){
    list.innerHTML =
      `<div id="listHead"><div id="headCols"></div>`+
      `<div class="headsearch"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>`+
      `<input id="search" type="search" placeholder="${esc(t('searchPh'))}" data-i18n-ph="searchPh" autocomplete="off"></div>`+
      `</div><div id="listBody"></div>`;
  }
  // column headers (sortable) + inline controls after the Aktiv column
  document.getElementById("headCols").innerHTML =
    `<span class="swatch" style="visibility:hidden"></span>` +
    SORT_COLS.map(c=>{
      const arrow = sortState.key===c.key ? `<span class="sortarrow">${sortState.dir>0?"▲":"▼"}</span>` : "";
      if(c.key==="loadMode") return setAllModeHtml();   // header doubles as "set all orders' load type"
      const span = c.nosort
        ? `<span class="${c.cls}">${t("col_"+c.key)}</span>`
        : `<span class="${c.cls}" data-sort="${c.key}">${t("col_"+c.key)}${arrow}</span>`;
      return c.key==="assign" ? span + headCtlHtml() : span;
    }).join("");
  const body = document.getElementById("listBody");
  body.classList.toggle("empty-state", orders.length===0);
  if(orders.length===0){
    document.getElementById("listHead").style.display = "none";
    body.innerHTML = listFooterHtml();
    return;
  }
  document.getElementById("listHead").style.display = "";
  // an active search overrides "hide inactive": every match shows (inactive orders are searched too)
  const visible = orders.filter(o => filterText ? searchMatch(o) : (hideInactive ? onActive(o) : true));
  const note = (visible.length===0) ? `<div class="empty">${t('noMatch')}</div>` : "";
  body.innerHTML = note + visible.map(o=>{
    const stackPossible = 2*o.height <= truck.h;
    const lmode = loadModeFor(activeLoad(), o);   // load type of this order ON the active load (per-load override)
    const lm = orderLoadMeters(Object.assign({}, o, {loadMode:lmode}),truck).toFixed(1);
    return `<div class="order ${onActive(o)?'':'inactive'}" style="--c:${o.color}" data-id="${o.id}">
      <button class="copybtn" title="${t('titleCopyNr')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
      <div class="fld w-num"><label>${t('col_orderNo')}</label><input class="txt" data-f="orderNo" value="${esc(o.orderNo)}"></div>
      <div class="fld w-customer"><label>${t('col_customer')}</label><input class="txt" data-f="customer" value="${esc(o.customer)}"></div>
      <div class="fld w-date"><label>${t('col_deliveryDate')}</label><input class="txt" data-f="deliveryDate" value="${esc(o.deliveryDate)}"></div>
      <div class="fld w-dest"><label>${t('col_destCode')}</label><input class="txt" data-f="destCode" value="${esc(o.destCode)}"></div>
      <div class="fld w-pal"><label>${t('col_qty')}</label><input class="txt num" data-f="qty" value="${o.qty}"></div>
      <div class="fld w-lbh"><label>${t('col_lbh')}</label>
        <div class="lbhbox">
          <input class="num" data-f="length" value="${o.length}" title="${t('fld_length')}"><span class="sep">×</span>
          <input class="num" data-f="width" value="${o.width}" title="${t('fld_width')}"><span class="sep">×</span>
          <input class="num" data-f="height" value="${o.height}" title="${t('fld_height')}">
        </div></div>
      <div class="fld w-art"><label>${t('col_loadMode')}</label>
        <select data-f="loadMode" class="${lmode!=="optimized"?"lm-forced":""}" title="${esc(t('loadModePerLoad'))}">
          <option value="optimized" ${lmode==="optimized"?"selected":""}>${t('opt_optimized')}</option>
          <option value="long" ${lmode==="long"?"selected":""}>${t('opt_long')}</option>
          <option value="wide" ${lmode==="wide"?"selected":""}>${t('opt_wide')}</option>
          <option value="longwide" ${lmode==="longwide"?"selected":""}>${t('opt_longwide')}</option>
        </select>
      </div>
      <div class="fld w-seq"><label>${t('col_sequence')}</label>
        <div class="numbox">
          <button data-act="dec">−</button><div class="sep"></div>
          <input data-f="sequence" value="${o.sequence}">
          <div class="sep"></div><button data-act="inc">+</button>
        </div>
      </div>
      <div class="fld w-stack ${stackPossible?'':'disabled'}"><label>${t('col_stackable')}</label>
        <div class="togglewrap"><input type="checkbox" class="toggle" data-f="stackable" ${o.stackable?"checked":""} ${stackPossible?"":"disabled"}></div></div>
      <div class="fld w-assign"><label>${t('col_assign')}</label>
        <div class="assignbox">
          <input class="txt num assign" data-f="assignQty" inputmode="numeric" value="${assignedOn(activeLoad(),o)||""}" placeholder="0" title="${esc(t('assignTitle'))}">
          <button class="miniact" data-act="fillFit" title="${esc(t('fillFit'))}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M13 5l7 7-7 7M4 5l7 7-7 7"/></svg></button>
          <button class="miniact ghostdanger" data-act="clearAssign" title="${esc(t('clearAssign'))}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div></div>
      <div class="fld w-status"><label>${t('col_status')}</label><span class="assignstat">${assignStatHtml(o)}</span></div>
      <div class="fld w-remark"><label>${t('col_remark')}</label><input class="txt" data-f="remark" value="${esc(o.remark)}" placeholder="…"></div>
      <span class="lmeter">${esc(t('loadMeters', lm))}</span>
      <button class="icon del ghostdanger" data-act="del" title="${t('titleDelete')}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M10 11v6M14 11v6"/></svg>
      </button>
    </div>`;
  }).join("") + listFooterHtml();
}

/* ============================ Recalc / render cycle ============================ */
function recalc(){
  // force stackable off when the truck is too low
  const truck = TRUCKS[currentTruck];
  orders.forEach(o=>{ if(2*o.height > truck.h) o.stackable = false; });
  // manual mode: render the hand-arranged pallets instead of the computed layout
  const layout = (typeof manualMode!=="undefined" && manualMode) ? manualLayout() : currentLayout();
  renderTruck(layout);
  renderTotals(layout);
  renderInfo(layout);
  // x-extent (along truck length) per order, for the row "where on the truck" band
  const ext = {};
  for(const p of layout.placements){
    const e = ext[p.order.id] || (ext[p.order.id] = {x0:Infinity, x1:-Infinity});
    e.x0 = Math.min(e.x0, p.x); e.x1 = Math.max(e.x1, p.x + p.w);
  }
  // map a truck-length mm coordinate to a screen X pixel (via the SVG's transform)
  const svgEl = document.getElementById("truckSvg");
  const ctm = svgEl && svgEl.getScreenCTM ? svgEl.getScreenCTM() : null;
  const toScreenX = ctm ? (xmm)=>{ const p = svgEl.createSVGPoint(); p.x = HOVER_PAD + xmm; p.y = 0; return p.matrixTransform(ctm).x; } : null;
  const FEATHER = 14;   // px soft transition at the band edges
  // update load metres + stackable state + position band per row (without re-rendering the list)
  document.querySelectorAll("#list .order").forEach(card=>{
    const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
    const lm = card.querySelector(".lmeter");
    if(lm) lm.textContent = t('loadMeters', orderLoadMeters(Object.assign({}, o, {loadMode:loadModeFor(activeLoad(),o)}),truck).toFixed(1));
    const chk = card.querySelector('input[data-f="stackable"]');
    if(chk){
      const possible = 2*o.height <= truck.h;
      chk.disabled = !possible; chk.checked = o.stackable;
      chk.closest(".fld").classList.toggle("disabled", !possible);
    }
    // per-load assignment: clamp to capacity, refresh the value (unless focused) + status chips
    const ai = card.querySelector('input[data-f="assignQty"]');
    if(ai){
      const al = activeLoad(), cap = assignCap(o);
      let n = assignedOn(al, o);
      if(n>cap){ n=cap; if(n>0) al.assign[o.id]=n; else delete al.assign[o.id]; }
      if(document.activeElement!==ai) ai.value = n===0 ? "" : n;
    }
    const st = card.querySelector(".assignstat");
    if(st) st.innerHTML = assignStatHtml(o);
    card.classList.toggle("inactive", !onActive(o));
    // pixel-accurate band: highlight the row exactly under the cargo's X range in the truck plan
    const e = ext[o.id];
    if(onActive(o) && e && ctm){
      const rect = card.getBoundingClientRect();
      const lx = Math.max(0, Math.min(rect.width, toScreenX(e.x0) - rect.left));
      const rx = Math.max(0, Math.min(rect.width, toScreenX(e.x1) - rect.left));
      const base = "color-mix(in srgb, var(--c) 12%, var(--panel))";
      const band = "color-mix(in srgb, var(--c) 52%, var(--panel))";
      card.style.background =
        `linear-gradient(90deg, ${base} ${Math.max(0,lx-FEATHER)}px, ${band} ${lx}px, ${band} ${rx}px, ${base} ${rx+FEATHER}px)`;
    } else {
      card.style.background = "";   // inactive / no placement -> CSS default
    }
  });
  updateHeadCtl();
  renderTabs();   // keep tab pallet counts live after assignment edits
}
function renderAll(){ renderList(); recalc(); }
