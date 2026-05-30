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
    s += `<g class="pal" data-oid="${p.order.id}" style="cursor:pointer">`;
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
  svg.innerHTML = s;
}

/* ============================ Rendering: totals + info ============================ */
function renderTotals(layout){
  const L = layout.truck.l/1000;
  const used = Math.ceil(layout.usedLength/100)/10;
  const free = Math.max(0, Math.round((L-used)*10)/10);
  const hidden = hideInactive ? orders.filter(o=>!o.active).length : 0;
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
function renderInfo(layout){
  const truck = layout.truck;
  const active = orders.filter(o=>o.active && o.qty>0);
  const totalPal = active.reduce((s,o)=> s + o.qty, 0);
  const over = layout.placements.filter(p=>p.overflow).reduce((s,p)=> s + (p.stack||1), 0);
  const loaded = totalPal - over;
  const countTxt = over>0 ? t('palLoaded', loaded, totalPal) : t('palCount', totalPal);
  document.getElementById("infoHead").innerHTML =
    `<span>${t('ladeinfo')}</span>` + (active.length ? `<span class="infocount ${over>0?"bad":""}">${esc(countTxt)}</span>` : "");
  const body = document.getElementById("infoBody");
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
  else{ msg.className="fit-bad"; msg.textContent=t('fitBad', over); }
}

/* ============================ Rendering: order list ============================ */
const SORT_COLS = [
  {key:"orderNo", label:"Auftragsnr.", cls:"w-num"},
  {key:"customer",          label:"Kunde",       cls:"w-customer"},
  {key:"deliveryDate",    label:"Lieferdatum", cls:"w-date", date:true},
  {key:"destCode",       label:"Dest",        cls:"w-dest"},
  {key:"qty",         label:"Pal.",        cls:"w-pal", num:true},
  {key:"length",         label:"Länge",       cls:"w-mm",  num:true},
  {key:"width",         label:"Breite",      cls:"w-mm",  num:true},
  {key:"height",          label:"Höhe",        cls:"w-mm",  num:true},
  {key:"loadMode",        label:"Ladeart",     cls:"w-art"},
  {key:"sequence",    label:"Reihenfolge", cls:"w-seq"},
  {key:"stackable",      label:"Stapelbar",   cls:"w-stack", bool:true},
  {key:"active",          label:"Aktiv",       cls:"w-active", bool:true},
  {key:"remark",      label:"Bemerkung",   cls:"w-remark"},
];
let sortState = {key:null, dir:1};
function dateVal(s){ const m=/^(\d{2})\.(\d{2})\.(\d{2})$/.exec(String(s||"").trim()); return m ? (+m[3])*10000+(+m[2])*100+(+m[1]) : -1; }
function sortOrders(key){
  const col = SORT_COLS.find(c=>c.key===key); if(!col) return;
  if(sortState.key===key) sortState.dir *= -1; else { sortState.key=key; sortState.dir=1; }
  const dir = sortState.dir;
  orders.sort((a,b)=>{
    if(col.bool) return ((a[key]?1:0)-(b[key]?1:0))*dir;
    if(col.num)  return ((+a[key]||0)-(+b[key]||0))*dir;
    if(col.date) return (dateVal(a[key])-dateVal(b[key]))*dir;
    return String(a[key]??"").localeCompare(String(b[key]??""), "de", {numeric:true})*dir;
  });
  renderList(); recalc();   // recalc re-applies the per-row position band
}

// inline header controls (set all inactive / hide inactive) — placed between Aktiv and Bemerkung
function headCtlHtml(){
  const inact = orders.filter(o=>!o.active).length;
  return `<span class="headctl">`+
    `<button class="hbtn" data-listact="allInactive" title="${esc(t('titleDeselect'))}">`+
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M16 9l-6 6-3-3"/></svg></button>`+
    `<button class="hbtn ${hideInactive?'on':''}" data-listact="hideInactive" title="${esc(hideInactive?t('hideShow'):t('hideHide'))}">`+
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>`+
      (hideInactive && inact>0?`<span class="cnt">${inact}</span>`:``)+`</button>`+
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
      const span = `<span class="${c.cls}" data-sort="${c.key}">${t("col_"+c.key)}${arrow}</span>`;
      return c.key==="active" ? span + headCtlHtml() : span;
    }).join("");
  const body = document.getElementById("listBody");
  body.classList.toggle("empty-state", orders.length===0);
  if(orders.length===0){
    document.getElementById("listHead").style.display = "none";
    body.innerHTML = listFooterHtml();
    return;
  }
  document.getElementById("listHead").style.display = "";
  const matches = o => !filterText ||
    (`${o.orderNo} ${o.customer} ${o.destCode} ${o.deliveryDate} ${o.remark}`).toLowerCase().includes(filterText);
  const visible = orders.filter(o => (hideInactive ? o.active : true) && matches(o));
  const note = (visible.length===0) ? `<div class="empty">${t('noMatch')}</div>` : "";
  body.innerHTML = note + visible.map(o=>{
    const stackPossible = 2*o.height <= truck.h;
    const lm = orderLoadMeters(o,truck).toFixed(1);
    return `<div class="order ${o.active?'':'inactive'}" style="--c:${o.color}" data-id="${o.id}">
      <button class="copybtn" title="${t('titleCopyNr')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
      <div class="fld w-num"><label>${t('col_orderNo')}</label><input class="txt" data-f="orderNo" value="${esc(o.orderNo)}"></div>
      <div class="fld w-customer"><label>${t('col_customer')}</label><input class="txt" data-f="customer" value="${esc(o.customer)}"></div>
      <div class="fld w-date"><label>${t('col_deliveryDate')}</label><input class="txt" data-f="deliveryDate" value="${esc(o.deliveryDate)}"></div>
      <div class="fld w-dest"><label>${t('col_destCode')}</label><input class="txt" data-f="destCode" value="${esc(o.destCode)}"></div>
      <div class="fld w-pal"><label>${t('col_qty')}</label><input class="txt num" data-f="qty" value="${o.qty}"></div>
      <div class="fld w-mm"><label>${t('fld_length')}</label><input class="txt num" data-f="length" value="${o.length}"></div>
      <div class="fld w-mm"><label>${t('fld_width')}</label><input class="txt num" data-f="width" value="${o.width}"></div>
      <div class="fld w-mm"><label>${t('fld_height')}</label><input class="txt num" data-f="height" value="${o.height}"></div>
      <div class="fld w-art"><label>${t('col_loadMode')}</label>
        <select data-f="loadMode">
          <option value="optimized" ${o.loadMode==="optimized"?"selected":""}>${t('opt_optimized')}</option>
          <option value="long" ${o.loadMode==="long"?"selected":""}>${t('opt_long')}</option>
          <option value="wide" ${o.loadMode==="wide"?"selected":""}>${t('opt_wide')}</option>
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
      <div class="fld w-active"><label>${t('col_active')}</label>
        <div class="togglewrap"><input type="checkbox" class="toggle" data-f="active" ${o.active?"checked":""}></div></div>
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
  const layout = computeLayout();
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
    if(lm) lm.textContent = t('loadMeters', orderLoadMeters(o,truck).toFixed(1));
    const chk = card.querySelector('input[data-f="stackable"]');
    if(chk){
      const possible = 2*o.height <= truck.h;
      chk.disabled = !possible; chk.checked = o.stackable;
      chk.closest(".fld").classList.toggle("disabled", !possible);
    }
    // pixel-accurate band: highlight the row exactly under the cargo's X range in the truck plan
    const e = ext[o.id];
    if(o.active && e && ctm){
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
}
function renderAll(){ renderList(); recalc(); }
