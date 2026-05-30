/* ============================ Rendering: LKW-Grafik ============================ */
let hoverLayout = null;                       // aktuelles Layout für Hover-Maße
const HOVER_PAD = 120;
function renderTruck(layout){
  hoverLayout = layout;
  const {truck, placements, usedLength} = layout;
  const L = truck.l, W = truck.w;
  const pad = HOVER_PAD;                     // mm Rand im viewBox
  const svg = document.getElementById("truckSvg");
  const vbW = L + pad*2, vbH = W + pad*2 + 320; // Platz unten für Maßband
  svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  let s = "";

  // LKW-Umriss
  s += `<rect x="${pad}" y="${pad}" width="${L}" height="${W}" rx="40" fill="#0e151d" stroke="#3a4756" stroke-width="14"/>`;
  // Front-Markierung (vorne = links)
  s += `<rect x="${pad}" y="${pad}" width="60" height="${W}" fill="#5b6b7d" opacity=".25"/>`;
  s += `<text x="${pad+90}" y="${pad+W/2}" font-size="190" fill="#7b8a9c" dominant-baseline="middle" transform="rotate(-90 ${pad+90} ${pad+W/2})" text-anchor="middle">${t('vorne')}</text>`;

  // Paletten (jede in <g data-oid> -> Klick hebt Auftragszeile hervor)
  for(const p of placements){
    const x = pad + p.x, y = pad + p.y;
    const stroke = p.overflow ? "#f04444" : "rgba(0,0,0,.45)";
    const dash = p.overflow ? `stroke-dasharray="80 60"` : "";
    const cx = x + p.w/2, cy = y + p.h/2;
    const label = (p.order.auftragsnummer || "#"+p.order.id);
    s += `<g class="pal" data-oid="${p.order.id}" style="cursor:pointer">`;
    s += `<rect x="${x+12}" y="${y+12}" width="${p.w-24}" height="${p.h-24}" rx="22" fill="${p.color}" fill-opacity="${p.overflow?.5:.92}" stroke="${stroke}" stroke-width="12" ${dash}/>`;
    s += `<text class="pal-label" x="${cx}" y="${cy}" font-size="170" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`;
    if(p.stack===2){
      s += `<text x="${x+p.w-70}" y="${y+150}" font-size="150" text-anchor="end" fill="#11203a" font-weight="800">2×</text>`;
    }
    s += `</g>`;
  }

  // genutzte Länge Markierung
  if(usedLength>0 && usedLength<=L){
    const ux = pad + usedLength;
    s += `<line x1="${ux}" y1="${pad-30}" x2="${ux}" y2="${pad+W+30}" stroke="#34d399" stroke-width="14" stroke-dasharray="50 40"/>`;
  }

  // Maßband (Meter) unten
  const by = pad + W + 120;
  s += `<line x1="${pad}" y1="${by}" x2="${pad+L}" y2="${by}" stroke="#3a4756" stroke-width="8"/>`;
  for(let m=0; m<=Math.floor(L/1000); m++){
    const mx = pad + m*1000;
    s += `<line x1="${mx}" y1="${by-20}" x2="${mx}" y2="${by+20}" stroke="#5b6b7d" stroke-width="8"/>`;
    s += `<text x="${mx}" y="${by+160}" font-size="150" fill="#7b8a9c" text-anchor="middle">${m}m</text>`;
  }
  s += `<g id="hoverGuide" style="pointer-events:none"></g>`;   // Hover-Maße (Lücken)
  svg.innerHTML = s;
}

/* ============================ Rendering: Totals + Info ============================ */
function renderTotals(layout){
  const L = layout.truck.l/1000;
  const used = Math.ceil(layout.usedLength/100)/10;
  const free = Math.max(0, Math.round((L-used)*10)/10);
  const hidden = hideInactive ? orders.filter(o=>!o.aktiv).length : 0;
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
  const active = orders.filter(o=>o.aktiv && o.anzahl>0);
  const totalPal = active.reduce((s,o)=> s + o.anzahl, 0);
  const over = layout.placements.filter(p=>p.overflow).reduce((s,p)=> s + (p.stack||1), 0);
  const loaded = totalPal - over;
  const countTxt = over>0 ? t('palLoaded', loaded, totalPal) : t('palCount', totalPal);
  document.getElementById("infoHead").innerHTML =
    `<span>${t('ladeinfo')}</span>` + (active.length ? `<span class="infocount ${over>0?"bad":""}">${esc(countTxt)}</span>` : "");
  const body = document.getElementById("infoBody");
  if(active.length===0){ body.innerHTML = `<div class="empty" style="grid-column:auto">${t('noActive')}</div>`; }
  else{
    body.innerHTML = active.map(o=>{
      const lm = orderLademeter(o,truck).toFixed(1);
      return `<div class="inforow"><span class="infodot" style="background:${o.color}"></span>`+
        `<span class="infotxt"><b>${esc(o.auftragsnummer||"#"+o.id)}</b> · ${esc(o.kunde||"—")}<br>`+
        `<small>${esc(t('infoRow', o.anzahl, lm))}</small></span></div>`;
    }).join("");
  }
  const msg = document.getElementById("fitMsg");
  if(active.length===0){ msg.className="fit-ok"; msg.textContent="–"; }
  else if(layout.fits){ msg.className="fit-ok"; msg.textContent=t('fitOk'); }
  else{ msg.className="fit-bad"; msg.textContent=t('fitBad', over); }
}

/* ============================ Rendering: Auftragsliste ============================ */
const SORT_COLS = [
  {key:"auftragsnummer", label:"Auftragsnr.", cls:"w-num"},
  {key:"kunde",          label:"Kunde",       cls:"w-kunde"},
  {key:"lieferdatum",    label:"Lieferdatum", cls:"w-datum", date:true},
  {key:"destCode",       label:"Dest",        cls:"w-dest"},
  {key:"anzahl",         label:"Pal.",        cls:"w-pal", num:true},
  {key:"laenge",         label:"Länge",       cls:"w-mm",  num:true},
  {key:"breite",         label:"Breite",      cls:"w-mm",  num:true},
  {key:"hoehe",          label:"Höhe",        cls:"w-mm",  num:true},
  {key:"ladeart",        label:"Ladeart",     cls:"w-art"},
  {key:"reihenfolge",    label:"Reihenfolge", cls:"w-reihen"},
  {key:"stapelbar",      label:"Stapelbar",   cls:"w-stack", bool:true},
  {key:"aktiv",          label:"Aktiv",       cls:"w-akt", bool:true},
  {key:"bemerkung",      label:"Bemerkung",   cls:"bem"},
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
  renderList();
}

function renderList(){
  const truck = TRUCKS[currentTruck];
  const list = document.getElementById("list");
  if(orders.length===0){
    list.innerHTML = `<div class="empty">${t('emptyList')}</div>`;
    return;
  }
  const head = `<div id="listHead"><span class="swatch" style="visibility:hidden"></span>` +
    SORT_COLS.map(c=>{
      const arrow = sortState.key===c.key ? `<span class="sortarrow">${sortState.dir>0?"▲":"▼"}</span>` : "";
      return `<span class="${c.cls}" data-sort="${c.key}">${t("col_"+c.key)}${arrow}</span>`;
    }).join("") + `</div>`;
  const visible = hideInactive ? orders.filter(o=>o.aktiv) : orders;
  list.innerHTML = head + visible.map(o=>{
    const stackPossible = 2*o.hoehe <= truck.h;
    const lm = orderLademeter(o,truck).toFixed(1);
    return `<div class="order ${o.aktiv?'':'inactive'}" style="--c:${o.color}" data-id="${o.id}">
      <button class="copybtn" title="${t('titleCopyNr')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
      <div class="fld w-num"><label>${t('col_auftragsnummer')}</label><input class="txt" data-f="auftragsnummer" value="${esc(o.auftragsnummer)}"></div>
      <div class="fld w-kunde"><label>${t('col_kunde')}</label><input class="txt" data-f="kunde" value="${esc(o.kunde)}"></div>
      <div class="fld w-datum"><label>${t('col_lieferdatum')}</label><input class="txt" data-f="lieferdatum" value="${esc(o.lieferdatum)}"></div>
      <div class="fld w-dest"><label>${t('col_destCode')}</label><input class="txt" data-f="destCode" value="${esc(o.destCode)}"></div>
      <div class="fld w-pal"><label>${t('col_anzahl')}</label><input class="txt num" data-f="anzahl" value="${o.anzahl}"></div>
      <div class="fld w-mm"><label>${t('fld_laenge')}</label><input class="txt num" data-f="laenge" value="${o.laenge}"></div>
      <div class="fld w-mm"><label>${t('fld_breite')}</label><input class="txt num" data-f="breite" value="${o.breite}"></div>
      <div class="fld w-mm"><label>${t('fld_hoehe')}</label><input class="txt num" data-f="hoehe" value="${o.hoehe}"></div>
      <div class="fld w-art"><label>${t('col_ladeart')}</label>
        <select data-f="ladeart">
          <option value="optimiert" ${o.ladeart==="optimiert"?"selected":""}>${t('opt_optimiert')}</option>
          <option value="lang" ${o.ladeart==="lang"?"selected":""}>${t('opt_lang')}</option>
          <option value="breit" ${o.ladeart==="breit"?"selected":""}>${t('opt_breit')}</option>
        </select>
      </div>
      <div class="fld w-reihen"><label>${t('col_reihenfolge')}</label>
        <div class="numbox">
          <button data-act="dec">−</button><div class="sep"></div>
          <input data-f="reihenfolge" value="${o.reihenfolge}">
          <div class="sep"></div><button data-act="inc">+</button>
        </div>
      </div>
      <div class="fld w-stack ${stackPossible?'':'disabled'}"><label>${t('col_stapelbar')}</label>
        <div class="togglewrap"><input type="checkbox" class="toggle" data-f="stapelbar" ${o.stapelbar?"checked":""} ${stackPossible?"":"disabled"}></div></div>
      <div class="fld w-akt"><label>${t('col_aktiv')}</label>
        <div class="togglewrap"><input type="checkbox" class="toggle" data-f="aktiv" ${o.aktiv?"checked":""}></div></div>
      <div class="fld bem"><label>${t('col_bemerkung')}</label><input class="txt" data-f="bemerkung" value="${esc(o.bemerkung)}" placeholder="…"></div>
      <span class="lmeter">${esc(t('lademeter', lm))}</span>
      <button class="icon del ghostdanger" data-act="del" title="${t('titleDelete')}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M10 11v6M14 11v6"/></svg>
      </button>
    </div>`;
  }).join("");
}

/* ============================ Recalc / Render-Zyklus ============================ */
function recalc(){
  // Stapelbar erzwingen wenn LKW zu niedrig
  const truck = TRUCKS[currentTruck];
  orders.forEach(o=>{ if(2*o.hoehe > truck.h) o.stapelbar = false; });
  const layout = computeLayout();
  renderTruck(layout);
  renderTotals(layout);
  renderInfo(layout);
  // Lademeter + Stapelbar-Status je Zeile aktualisieren (ohne die Liste neu zu rendern)
  document.querySelectorAll("#list .order").forEach(card=>{
    const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
    const lm = card.querySelector(".lmeter");
    if(lm) lm.textContent = t('lademeter', orderLademeter(o,truck).toFixed(1));
    const chk = card.querySelector('input[data-f="stapelbar"]');
    if(chk){
      const possible = 2*o.hoehe <= truck.h;
      chk.disabled = !possible; chk.checked = o.stapelbar;
      chk.closest(".fld").classList.toggle("disabled", !possible);
    }
  });
  updateHideLabel();
}
function renderAll(){ renderList(); recalc(); }
