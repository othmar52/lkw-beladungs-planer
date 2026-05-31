/* ============================ Events ============================ */
function esc(s){ return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

// manual edit mode (hand-arranged pallets, used to author optimal target layouts for the test suite)
let manualMode = false;
let manualPallets = null;   // [{pid, order, color, w, h, x, y, stack, overflow}]

// truck selection
const truckSel = document.getElementById("truckSel");
function rebuildTruckSelect(){
  truckSel.innerHTML = "";
  for(const name of Object.keys(TRUCKS)){
    const o = document.createElement("option"); o.value = name; o.textContent = name; truckSel.appendChild(o);
  }
  if(!TRUCKS[currentTruck]) currentTruck = Object.keys(TRUCKS)[0] || "Plane";
  truckSel.value = currentTruck;
}
rebuildTruckSelect();
truckSel.addEventListener("change", e=>{ record(); currentTruck = e.target.value; renderAll(); });

/* ---------- settings (truck types + display) ---------- */
const settingsModal = document.getElementById("settingsModal");
const truckTable = document.getElementById("truckTable");
const mm2m = mm => (mm/1000).toString().replace(".", ",");
const m2mm = v => Math.round((parseFloat(String(v).replace(",","."))||0) * 1000);
function renderTruckTable(){
  truckTable.innerHTML = Object.keys(TRUCKS).map(name=>{
    const t = TRUCKS[name];
    return `<div class="trow" data-name="${esc(name)}">
      <input class="txt tname" data-k="name" value="${esc(name)}">
      <input class="txt tdim" data-k="l" value="${mm2m(t.l)}" inputmode="decimal">
      <input class="txt tdim" data-k="w" value="${mm2m(t.w)}" inputmode="decimal">
      <input class="txt tdim" data-k="h" value="${mm2m(t.h)}" inputmode="decimal">
      <button class="icon ghostdanger" data-deltruck="${esc(name)}" title="Typ löschen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>
      </button>
    </div>`;
  }).join("");
}
// reads all table rows, rebuilds TRUCKS (order preserved), saves & refreshes
function applyTruckTable(){
  const next = {};
  truckTable.querySelectorAll(".trow").forEach(row=>{
    const name = row.querySelector('[data-k="name"]').value.trim();
    if(!name) return;
    const l = m2mm(row.querySelector('[data-k="l"]').value);
    const w = m2mm(row.querySelector('[data-k="w"]').value);
    const h = m2mm(row.querySelector('[data-k="h"]').value);
    if(l>0 && w>0 && h>0 && !next[name]) next[name] = {l, w, h};
  });
  if(Object.keys(next).length===0) return;   // at least one valid type must remain
  TRUCKS = next;
  if(!TRUCKS[currentTruck]) currentTruck = Object.keys(TRUCKS)[0];
  saveTrucks(); rebuildTruckSelect(); recalc();
}
truckTable.addEventListener("change", applyTruckTable);
truckTable.addEventListener("click", e=>{
  const b = e.target.closest("[data-deltruck]"); if(!b) return;
  if(Object.keys(TRUCKS).length<=1){ notify("warn", t('tMinTruck')); return; }
  delete TRUCKS[b.dataset.deltruck];
  if(!TRUCKS[currentTruck]) currentTruck = Object.keys(TRUCKS)[0];
  saveTrucks(); rebuildTruckSelect(); renderTruckTable(); recalc();
});
document.getElementById("ntAdd").addEventListener("click", ()=>{
  const name = document.getElementById("ntName").value.trim();
  const l = m2mm(document.getElementById("ntL").value);
  const w = m2mm(document.getElementById("ntW").value);
  const h = m2mm(document.getElementById("ntH").value);
  if(!name){ notify("warn", t('tNameMissing')); return; }
  if(TRUCKS[name]){ notify("warn", t('tNameExists')); return; }
  if(!(l>0 && w>0 && h>0)){ notify("warn", t('tDimsNeeded')); return; }
  TRUCKS[name] = {l, w, h};
  saveTrucks(); rebuildTruckSelect(); renderTruckTable(); recalc();
  ["ntName","ntL","ntW","ntH"].forEach(id=> document.getElementById(id).value="");
  document.getElementById("ntName").focus();
});
document.getElementById("setResetTrucks").addEventListener("click", ()=>{
  TRUCKS = cloneDefaults();
  if(!TRUCKS[currentTruck]) currentTruck = Object.keys(TRUCKS)[0];
  saveTrucks(); rebuildTruckSelect(); renderTruckTable(); recalc();
});
const setCrosshair = document.getElementById("setCrosshair");
setCrosshair.addEventListener("change", ()=>{
  settings.showCrosshair = setCrosshair.checked; saveSettings();
  if(!settings.showCrosshair) clearHoverGuide();
});
document.getElementById("langSel").addEventListener("change", e=>{
  settings.lang = e.target.value; saveSettings();
  applyStatic();   // static texts
  renderAll();     // dynamic content (list/graphic/info/totals/labels)
});
function openSettings(){
  renderTruckTable();
  setCrosshair.checked = settings.showCrosshair;
  document.getElementById("langSel").value = settings.lang;
  settingsModal.classList.add("open");
}
document.getElementById("btnSettings").addEventListener("click", openSettings);
document.getElementById("settingsClose").addEventListener("click", ()=> settingsModal.classList.remove("open"));
settingsModal.addEventListener("click", e=>{ if(e.target===settingsModal) settingsModal.classList.remove("open"); });

// hover over a free gap -> show two measurement axes (length × width of the gap)
const truckSvgEl = document.getElementById("truckSvg");
const palTip = document.getElementById("palTip");
function clearHoverGuide(){ const g = document.getElementById("hoverGuide"); if(g) g.innerHTML = ""; }
function hidePalTip(){ palTip.style.display = "none"; }
function clearHover(){ clearHoverGuide(); hidePalTip(); }
truckSvgEl.addEventListener("mouseleave", clearHover);
truckSvgEl.addEventListener("mousemove", e=>{
  if(manualMode){ clearHover(); return; }   // no crosshair while hand-editing
  const g = document.getElementById("hoverGuide"); if(!g || !hoverLayout) return;
  const ctm = truckSvgEl.getScreenCTM(); if(!ctm) return;
  const pt = truckSvgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const loc = pt.matrixTransform(ctm.inverse());
  const pad = HOVER_PAD, { truck, placements } = hoverLayout, L = truck.l, W = truck.w;
  const tx = loc.x - pad, ty = loc.y - pad;
  if(tx < 0 || tx > L || ty < 0 || ty > W){ clearHover(); return; }
  // over a loaded pallet? -> show dimensions (L×W×H) as a tooltip
  for(const p of placements){
    if(tx >= p.x-0.01 && tx <= p.x+p.w+0.01 && ty >= p.y-0.01 && ty <= p.y+p.h+0.01){
      g.innerHTML = "";
      const o = p.order;
      palTip.innerHTML = `<b>${esc(o.orderNo || "#"+o.id)}</b>` + (o.customer ? ` · ${esc(o.customer)}` : "") + `<br>`+
        `${t('tipLBH')} ${o.length} × ${o.width} × ${o.height} mm` + (p.stack===2 ? " "+t('stacked') : "");
      palTip.style.display = "block";
      const tw = palTip.offsetWidth, th = palTip.offsetHeight;
      let lx = e.clientX + 14, ty2 = e.clientY + 14;
      if(lx + tw > window.innerWidth - 6)  lx = e.clientX - tw - 14;
      if(ty2 + th > window.innerHeight - 6) ty2 = e.clientY - th - 14;
      palTip.style.left = Math.max(6, lx) + "px";
      palTip.style.top  = Math.max(6, ty2) + "px";
      return;
    }
  }
  hidePalTip();
  if(!settings.showCrosshair){ g.innerHTML = ""; return; }
  // free span in X (at height ty) and in Y (at length tx)
  let x0 = 0, x1 = L, y0 = 0, y1 = W;
  for(const p of placements){
    if(ty > p.y-0.01 && ty < p.y+p.h+0.01){
      if(p.x+p.w <= tx+0.01) x0 = Math.max(x0, p.x+p.w);
      else if(p.x >= tx-0.01) x1 = Math.min(x1, p.x);
    }
    if(tx > p.x-0.01 && tx < p.x+p.w+0.01){
      if(p.y+p.h <= ty+0.01) y0 = Math.max(y0, p.y+p.h);
      else if(p.y >= ty-0.01) y1 = Math.min(y1, p.y);
    }
  }
  const fmt = mm => (mm/1000).toFixed(2) + " m";
  const C = "#fbbf24", DK = "#0e1318";
  const px0=pad+x0, px1=pad+x1, py0=pad+y0, py1=pad+y1, ptx=pad+tx, pty=pad+ty;
  let h = "";
  // X axis (length of the gap)
  h += `<line x1="${px0}" y1="${pty}" x2="${px1}" y2="${pty}" stroke="${C}" stroke-width="9"/>`;
  h += `<line x1="${px0}" y1="${pty-55}" x2="${px0}" y2="${pty+55}" stroke="${C}" stroke-width="9"/>`;
  h += `<line x1="${px1}" y1="${pty-55}" x2="${px1}" y2="${pty+55}" stroke="${C}" stroke-width="9"/>`;
  h += `<text x="${(px0+px1)/2}" y="${pty-75}" font-size="150" fill="${C}" text-anchor="middle" font-weight="800" paint-order="stroke" stroke="${DK}" stroke-width="45">${fmt(x1-x0)}</text>`;
  // Y axis (width of the gap)
  h += `<line x1="${ptx}" y1="${py0}" x2="${ptx}" y2="${py1}" stroke="${C}" stroke-width="9"/>`;
  h += `<line x1="${ptx-55}" y1="${py0}" x2="${ptx+55}" y2="${py0}" stroke="${C}" stroke-width="9"/>`;
  h += `<line x1="${ptx-55}" y1="${py1}" x2="${ptx+55}" y2="${py1}" stroke="${C}" stroke-width="9"/>`;
  h += `<text x="${ptx+75}" y="${(py0+py1)/2}" font-size="150" fill="${C}" text-anchor="start" dominant-baseline="central" font-weight="800" paint-order="stroke" stroke="${DK}" stroke-width="45">${fmt(y1-y0)}</text>`;
  g.innerHTML = h;
});

// click on a pallet -> scroll to the matching order row + flash it
document.getElementById("truckSvg").addEventListener("click", e=>{
  if(manualMode) return;   // in manual mode clicks are drags
  const g = e.target.closest("[data-oid]"); if(!g) return;
  const row = document.querySelector(`.order[data-id="${g.dataset.oid}"]`);
  if(!row) return;
  row.scrollIntoView({behavior:"smooth", block:"center"});
  row.classList.remove("flash");
  void row.offsetWidth;          // force reflow so the animation restarts
  row.classList.add("flash");
  setTimeout(()=> row.classList.remove("flash"), 1200);
});

/* ---------- manual mode: drag pallets + snap to nearest valid spot ---------- */
// build a layout object (like computeLayout) from the hand-arranged pallets
function manualLayout(){
  const truck = TRUCKS[currentTruck];
  const placements = (manualPallets||[]).map(p=>({
    x:p.x, y:p.y, w:p.w, h:p.h, color:p.color, order:p.order, stack:p.stack, pid:p.pid,
    overflow:(p.x+p.w) > truck.l+0.01 }));
  const usedLength = placements.reduce((m,p)=> Math.max(m, p.x+p.w), 0);
  return { placements, usedLength, fits: usedLength <= truck.l+0.01, truck };
}
// seed the manual pallets from the current automatic layout (starting point for editing)
function seedManualFromAuto(){
  const layout = computeLayout();
  manualPallets = layout.placements.map((p,i)=>({
    pid:i+1, order:p.order, color:p.color, w:p.w, h:p.h, x:p.x, y:p.y, stack:p.stack }));
}
function setManualMode(on){
  manualMode = on;
  document.getElementById("btnManual").classList.toggle("toggled", on);
  truckSvgEl.classList.toggle("manual", on);
  if(on){ seedManualFromAuto(); notify("ok", t('manualOn'), "", 3500); }
  else  { manualPallets = null;  notify("ok", t('manualOff'), "", 2500); }
  recalc();
}
document.getElementById("btnManual").addEventListener("click", ()=> setManualMode(!manualMode));

// snap a pallet to the nearest collision-free position; neighbour edges form the candidate grid
function snapPallet(pal){
  const W = TRUCKS[currentTruck].w;
  const others = manualPallets.filter(p=>p!==pal);
  const hit = (x,y)=> others.some(o=> x < o.x+o.w-0.5 && o.x < x+pal.w-0.5 && y < o.y+o.h-0.5 && o.y < y+pal.h-0.5);
  const cx = x=> Math.max(0, x);
  const cy = y=> Math.max(0, Math.min(W-pal.h, y));
  const xs = new Set([cx(pal.x), 0]); const ys = new Set([cy(pal.y), 0, W-pal.h]);
  for(const o of others){ xs.add(cx(o.x)); xs.add(cx(o.x+o.w)); xs.add(cx(o.x-pal.w));
                          ys.add(cy(o.y)); ys.add(cy(o.y+o.h)); ys.add(cy(o.y-pal.h)); }
  const dx = cx(pal.x), dy = cy(pal.y);
  let best = null;
  for(const x of xs) for(const y of ys){
    if(x<-0.01 || y<-0.01 || y+pal.h>W+0.01 || hit(x,y)) continue;
    const d = (x-dx)*(x-dx) + (y-dy)*(y-dy);
    if(!best || d < best.d) best = {x, y, d};
  }
  if(best){ pal.x = best.x; pal.y = best.y; return; }
  // fallback: slide to the front within its y-band until it touches something
  pal.y = cy(pal.y); let x = 0;
  for(const o of others) if(pal.y < o.y+o.h-0.5 && o.y < pal.y+pal.h-0.5) x = Math.max(x, o.x+o.w);
  pal.x = x;
}

// pointer drag of a pallet (truck mm via the SVG transform)
let drag = null;
function svgMM(e){
  const ctm = truckSvgEl.getScreenCTM(); if(!ctm) return null;
  const pt = truckSvgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: loc.x - HOVER_PAD, y: loc.y - HOVER_PAD };
}
truckSvgEl.addEventListener("pointerdown", e=>{
  if(!manualMode) return;
  const g = e.target.closest("[data-pid]"); if(!g) return;
  const pal = manualPallets.find(p=>p.pid==g.dataset.pid); if(!pal) return;
  const loc = svgMM(e); if(!loc) return;
  // do NOT preventDefault/capture here yet — that would swallow the click/dblclick (rotate)
  drag = { pal, dx: loc.x - pal.x, dy: loc.y - pal.y, moved:false, pointerId:e.pointerId };
});
truckSvgEl.addEventListener("pointermove", e=>{
  if(!drag) return;
  const loc = svgMM(e); if(!loc) return;
  const truck = TRUCKS[currentTruck];
  const nx = Math.max(0, loc.x - drag.dx), ny = Math.max(0, Math.min(truck.w - drag.pal.h, loc.y - drag.dy));
  if(!drag.moved){
    if(Math.abs(nx-drag.pal.x) < 8 && Math.abs(ny-drag.pal.y) < 8) return;  // ignore jitter -> stays a click
    drag.moved = true;
    try{ truckSvgEl.setPointerCapture(drag.pointerId); }catch(_){}
  }
  drag.pal.x = nx; drag.pal.y = ny;
  renderTruck(manualLayout());   // live preview (lightweight)
  e.preventDefault();
});
truckSvgEl.addEventListener("pointerup", e=>{
  if(!drag) return;
  const { pal, moved } = drag;
  try{ if(moved) truckSvgEl.releasePointerCapture(drag.pointerId); }catch(_){}
  drag = null;
  if(moved){ snapPallet(pal); recalc(); }   // a plain click (no move) leaves the DOM intact -> dblclick can fire
});
// double-click a pallet -> rotate (swap length/width) if it still fits the width
truckSvgEl.addEventListener("dblclick", e=>{
  if(!manualMode) return;
  const g = e.target.closest("[data-pid]"); if(!g) return;
  const pal = manualPallets.find(p=>p.pid==g.dataset.pid); if(!pal) return;
  if(pal.h > TRUCKS[currentTruck].w && pal.w > TRUCKS[currentTruck].w) return;
  if(pal.w > TRUCKS[currentTruck].w) return;   // rotated (new height = old width) would exceed width
  const nw = pal.h, nh = pal.w; pal.w = nw; pal.h = nh;
  snapPallet(pal); recalc(); e.preventDefault();
});

/* ---------- export current load as a test-suite fixture (tests/cases/*.json) ---------- */
function exportTestcase(){
  const truck = TRUCKS[currentTruck];
  const active = orders.filter(o=>o.active && o.qty>0);
  if(!active.length){ notify("warn", t('tNoExport')); return; }
  const auto = computeLayout();                          // what the algorithm currently produces
  const disp = manualMode ? manualLayout() : auto;       // displayed target (manual if hand-edited)
  const r = (mm,d=3)=> +(mm/1000).toFixed(d);
  const fixture = {
    name: `${active.length} Auftraege, ${active.reduce((s,o)=>s+o.qty,0)} Pal., ${r(disp.usedLength,2)}m`,
    truck: { l:truck.l, w:truck.w, h:truck.h },
    orders: active.map(o=>({ orderNo:o.orderNo, qty:o.qty, length:o.length, width:o.width, height:o.height,
      loadMode:o.loadMode, sequence:o.sequence, stackable:o.stackable })),
    expected: { usedLength_m: r(disp.usedLength,2), overflow: auto.placements.filter(p=>p.overflow).length, tolerance_m: 0.05 },
    baseline: { usedLength_m: r(auto.usedLength,3) },
  };
  const d = new Date();
  const ts = `${pad2(d.getDate())}${pad2(d.getMonth()+1)}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  const fname = `testcase-${active.length}o-${r(disp.usedLength,2)}m-${ts}.json`;
  const blob = new Blob([JSON.stringify(fixture, null, 2)+"\n"], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=fname;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  notify("ok", t('tcSaved'), "tests/cases/ ← "+fname, 4500);
}
document.getElementById("btnTestcase").addEventListener("click", exportTestcase);

// toolbar
// add a new order (used by the toolbar button and the footer button in the list)
function addOrder(){
  record();
  const o = makeOrder({length:1200, width:800, height:1200, qty:1, sequence:1});
  orders.push(o);
  if(hideInactive) hideInactive = false;   // new order is inactive -> turn filter off so it is visible
  renderAll();
  // scroll to the new order and focus the order number
  const row = document.querySelector(`.order[data-id="${o.id}"]`);
  if(row){
    row.scrollIntoView({behavior:"smooth", block:"nearest"});
    const inp = row.querySelector('input[data-f="orderNo"]');
    if(inp){ inp.focus(); inp.select(); }
    row.classList.remove("flash");
    void row.offsetWidth;            // force reflow so the animation restarts
    row.classList.add("flash");
    setTimeout(()=> row.classList.remove("flash"), 1200);
  }
}
document.getElementById("btnAdd").addEventListener("click", addOrder);
document.getElementById("btnRefresh").addEventListener("click", renderAll);
document.getElementById("btnUndo").addEventListener("click", undo);

// reflect the inline header controls' state (hide-inactive on/off + inactive count) without a full re-render
function updateHeadCtl(){
  const inact = orders.filter(o=>!o.active).length;
  const hb = document.querySelector('#listHead [data-listact="hideInactive"]');
  if(!hb) return;
  hb.classList.toggle("on", hideInactive);
  hb.title = hideInactive ? t('hideShow') : t('hideHide');
  let cnt = hb.querySelector(".cnt");
  if(hideInactive && inact>0){   // badge shows how many are currently hidden
    if(!cnt){ cnt = document.createElement("span"); cnt.className = "cnt"; hb.appendChild(cnt); }
    cnt.textContent = inact;
  } else if(cnt){ cnt.remove(); }
}

// load remarks note (view/edit)
const noteModal = document.getElementById("noteModal");
const noteArea = document.getElementById("noteArea");
function updateNoteBtn(){
  document.getElementById("btnNote").classList.toggle("hasnote", loadNote.trim().length>0);
}
document.getElementById("btnNote").addEventListener("click", ()=>{
  noteArea.value = loadNote; noteModal.classList.add("open"); noteArea.focus();
});
document.getElementById("noteCancel").addEventListener("click", ()=> noteModal.classList.remove("open"));
document.getElementById("noteOk").addEventListener("click", ()=>{
  loadNote = noteArea.value; updateNoteBtn(); noteModal.classList.remove("open");
});
noteModal.addEventListener("click", e=>{ if(e.target===noteModal) noteModal.classList.remove("open"); });

// export as JSON
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const expNote = document.getElementById("expNote");
const pad2 = n => String(n).padStart(2,"0");
function defaultExportName(){
  const d = new Date();
  return `LKW-Ladung ${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} ${pad2(d.getHours())}-${pad2(d.getMinutes())}`;
}
function doExport(name){
  loadNote = expNote.value; updateNoteBtn();
  const inclInactive = document.getElementById("expInclInactive").checked;
  const exportable = inclInactive ? orders : orders.filter(o=>o.active);
  const data = { app:"lkw-planer", version:1, truck:currentTruck, note:loadNote,
    orders: exportable.map(o=>({ orderNo:o.orderNo, customer:o.customer, deliveryDate:o.deliveryDate,
      destCode:o.destCode, qty:o.qty, length:o.length, width:o.width, height:o.height,
      loadMode:o.loadMode, sequence:o.sequence, stackable:o.stackable, active:o.active,
      remark:o.remark, color:o.color })) };
  let fname = (name||"").trim().replace(/[\\/:*?"<>|]/g,"-") || defaultExportName();
  if(!/\.json$/i.test(fname)) fname += ".json";
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  notify("ok", t('exported', exportable.length), fname, 4000);
}
document.getElementById("btnExport").addEventListener("click", ()=>{
  if(orders.length===0){ notify("warn", t('tNoExport')); return; }
  nameInput.value = defaultExportName();
  expNote.value = loadNote;
  document.getElementById("expInclInactive").checked = false;   // default: active orders only
  nameModal.classList.add("open");
  nameInput.focus(); nameInput.select();
});
document.getElementById("nameCancel").addEventListener("click", ()=> nameModal.classList.remove("open"));
document.getElementById("nameOk").addEventListener("click", ()=>{ doExport(nameInput.value); nameModal.classList.remove("open"); });
nameModal.addEventListener("click", e=>{ if(e.target===nameModal) nameModal.classList.remove("open"); });
nameInput.addEventListener("keydown", e=>{
  if(e.key==="Enter"){ e.preventDefault(); doExport(nameInput.value); nameModal.classList.remove("open"); }
  else if(e.key==="Escape"){ nameModal.classList.remove("open"); }
});

// print graphic: white truck area, pallets as hatching (per-order angle/colour)
function buildPrintSvg(layout){
  const {truck, placements, usedLength} = layout;
  const L = truck.l, W = truck.w, pad = HOVER_PAD;
  const vbW = L + pad*2, vbH = W + pad*2 + 320;
  const ids = [...new Set(placements.map(p=>p.order.id))];
  const patId = {};
  let defs = "";
  ids.forEach((id, idx)=>{
    const col = (placements.find(p=>p.order.id===id) || {}).color || "#333";
    const ang = (idx*30) % 180;
    patId[id] = "pat" + id;
    defs += `<pattern id="pat${id}" width="170" height="170" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})">`+
            `<rect width="170" height="170" fill="#fff"/><rect width="60" height="170" fill="${col}"/></pattern>`;
  });
  let s = `<defs>${defs}</defs>`;
  s += `<rect x="${pad}" y="${pad}" width="${L}" height="${W}" rx="40" fill="#fff" stroke="#555" stroke-width="9"/>`;
  s += `<text x="${pad+90}" y="${pad+W/2}" font-size="190" fill="#aaa" dominant-baseline="middle" transform="rotate(-90 ${pad+90} ${pad+W/2})" text-anchor="middle">${t('vorne')}</text>`;
  for(const p of placements){
    const x = pad + p.x, y = pad + p.y;
    const stroke = p.overflow ? "#dc2626" : "#333";
    const dash = p.overflow ? `stroke-dasharray="80 60"` : "";
    s += `<rect x="${x+12}" y="${y+12}" width="${p.w-24}" height="${p.h-24}" rx="16" fill="url(#${patId[p.order.id]})" stroke="${stroke}" stroke-width="9" ${dash}/>`;
    const cx = x + p.w/2, cy = y + p.h/2;
    s += `<text class="pal-label" x="${cx}" y="${cy}" font-size="170" text-anchor="middle" dominant-baseline="central">${esc(p.order.orderNo || "#"+p.order.id)}</text>`;
    if(p.stack===2) s += `<text x="${x+p.w-70}" y="${y+150}" font-size="150" text-anchor="end" fill="#000" font-weight="800">2×</text>`;
  }
  if(usedLength>0 && usedLength<=L){ const ux = pad+usedLength;
    s += `<line x1="${ux}" y1="${pad-30}" x2="${ux}" y2="${pad+W+30}" stroke="#16a34a" stroke-width="12" stroke-dasharray="50 40"/>`; }
  const by = pad + W + 120;
  s += `<line x1="${pad}" y1="${by}" x2="${pad+L}" y2="${by}" stroke="#999" stroke-width="6"/>`;
  for(let m=0; m<=Math.floor(L/1000); m++){ const mx = pad + m*1000;
    s += `<line x1="${mx}" y1="${by-20}" x2="${mx}" y2="${by+20}" stroke="#999" stroke-width="6"/>`+
         `<text x="${mx}" y="${by+160}" font-size="150" fill="#666" text-anchor="middle">${m}m</text>`; }
  return `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}
// print stylesheet — lives inside the print iframe (default landscape, wider remark column)
const PRINT_CSS = `
  *{box-sizing:border-box}
  /* @page margin:0 leaves no room for the browser's header/footer (URL/date) -> the body padding becomes the visual margin */
  body{margin:0;color:#000;background:#fff;padding:10mm 12mm;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}
  h1{font-size:18px;margin:0 0 4px;}
  h2{font-size:13px;margin:12px 0 5px;}
  .pmeta{font-size:11.5px;line-height:1.5;margin-bottom:8px;}
  .psvg{margin-bottom:8px;overflow:hidden;}
  .psvg svg{width:100%;height:auto;display:block;}
  .premarks{margin:8px 0;padding:6px 8px;border:1px solid #ccc;border-radius:6px;white-space:pre-wrap;font-size:11.5px;}
  table{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:fixed;}
  th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top;word-wrap:break-word;}
  th{background:#eee;}
  th:last-child,td:last-child{width:32%;}
  .pal-label{font-weight:700;fill:#11203a;paint-order:stroke;stroke:rgba(255,255,255,.75);stroke-width:60px;}
  @page{size:landscape;margin:0;}
`;
// print view / PDF: rendered in a hidden about:blank iframe so the PDF footer carries no file path
function buildPrintView(){
  const layout = manualMode ? manualLayout() : computeLayout();   // print the hand-arranged layout in manual mode
  const truck = layout.truck;
  const active = orders.filter(o=>o.active && o.qty>0);
  const usedM = (Math.ceil(layout.usedLength/100)/10).toFixed(1);
  const Lm = truck.l/1000;
  const freeM = Math.max(0, Math.round((Lm - usedM)*10)/10).toFixed(1);
  const totalPal = active.reduce((s,o)=>s+o.qty,0);
  const over = layout.placements.filter(p=>p.overflow).reduce((s,p)=>s+(p.stack||1),0);
  const d = new Date();
  const dateStr = `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fitTxt = active.length ? (layout.fits ? t('fitOk') : t('fitBad', over)) : "";
  const dims = `${Lm.toFixed(2)} × ${(truck.w/1000).toFixed(2)} × ${(truck.h/1000).toFixed(2)} m`;
  const th = [t('col_orderNo'),t('col_customer'),t('col_deliveryDate'),t('col_destCode'),t('col_qty'),
              t('printDims'),t('col_sequence'),t('printLmCol'),t('col_remark')]
              .map(x=>`<th>${esc(x)}</th>`).join("");
  const rows = active.map(o=>{
    return `<tr><td>${esc(o.orderNo)}</td><td>${esc(o.customer)}</td><td>${esc(o.deliveryDate)}</td>`+
      `<td>${esc(o.destCode)}</td><td>${o.qty}</td><td>${o.length} × ${o.width} × ${o.height}</td>`+
      `<td>${o.sequence}</td><td>${orderLoadMeters(o,truck).toFixed(1)}</td>`+
      `<td>${esc(o.remark||"")}</td></tr>`;
  }).join("");
  const remarks = loadNote.trim()
    ? `<div class="premarks"><b>${t('printRemarks')}:</b> ${esc(loadNote)}</div>` : "";
  return `<h1>${t('printTitle')}</h1>`+
    `<div class="pmeta"><b>${t('printDate')}:</b> ${dateStr} &nbsp;·&nbsp; <b>${t('truckLabel')}:</b> ${esc(currentTruck)} (${dims})<br>`+
    `<b>${t('used')}</b> ${usedM} m &nbsp;·&nbsp; <b>${t('free')}</b> ${freeM} m &nbsp;·&nbsp; ${esc(t('palCount',totalPal))}`+
    (fitTxt ? ` &nbsp;·&nbsp; ${esc(fitTxt)}` : "") + `</div>`+
    `<div class="psvg">${buildPrintSvg(layout)}</div>`+
    remarks +
    `<h2>${t('printOrders')}</h2>`+
    `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}
// print the load: render the HTML in a separate about:blank window so the PDF footer has no file path.
// (Printing a hidden iframe does NOT work — Chrome puts the parent document's file:// path in the footer.)
function printDoc(bodyHtml, title){
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`;
  const w = window.open("", "_blank", "width=1100,height=800");
  if(w){
    w.document.open(); w.document.write(html); w.document.close();
    w.focus();
    w.onafterprint = ()=> w.close();
    // give the inline SVG layout a tick before opening the print dialog
    setTimeout(()=>{ try{ w.print(); }catch(_){} }, 250);
    return;
  }
  // popup blocked -> fall back to a hidden iframe (footer may then show the file path)
  const old = document.getElementById("printFrame"); if(old) old.remove();
  const ifr = document.createElement("iframe");
  ifr.id = "printFrame";
  ifr.style.cssText = "position:fixed;left:-9999px;top:0;width:0;height:0;border:0;";
  document.body.appendChild(ifr);
  const doc = ifr.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(()=>{ try{ ifr.contentWindow.focus(); ifr.contentWindow.print(); }catch(_){} setTimeout(()=> ifr.remove(), 1500); }, 150);
}
document.getElementById("btnPrint").addEventListener("click", ()=>{ printDoc(buildPrintView(), t('printTitle')); });

// import from JSON
const fileImport = document.getElementById("fileImport");
document.getElementById("btnImport").addEventListener("click", ()=> fileImport.click());
fileImport.addEventListener("change", e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data) ? data : data.orders;
      if(!Array.isArray(list)) throw new Error("No orders array found.");
      record();
      orders = list.map(d => makeOrder({
        orderNo:d.orderNo||"", customer:d.customer||"", deliveryDate:d.deliveryDate||"",
        destCode:d.destCode||"", qty:+d.qty||1,
        length:+d.length||1200, width:+d.width||800, height:+d.height||1200,
        loadMode:["optimized","long","wide"].includes(d.loadMode)?d.loadMode:"optimized",
        sequence:Math.max(1,Math.min(99,+d.sequence||1)),
        stackable:!!d.stackable, active:!!d.active, remark:d.remark||"",
        ...(d.color ? {color:d.color} : {}),
      }));
      if(data.truck && TRUCKS[data.truck]){ currentTruck = data.truck; truckSel.value = currentTruck; }
      loadNote = (data && typeof data.note==="string") ? data.note : "";
      updateNoteBtn();
      renderAll();
      const noteHint = loadNote.trim() ? t('withRemarks') : "";
      notify("ok", t('imported', orders.length) + noteHint + ".", "", 4000);
    }catch(err){
      notify("warn", t('tImportFail'), String(err.message||err), 6000);
    }
  };
  reader.readAsText(file);
  fileImport.value = "";   // allow selecting the same file again
});
// reset: two-click confirmation on the button (no native confirm)
const btnReset = document.getElementById("btnReset");
const resetLabel = document.getElementById("resetLabel");
let resetArmed = false, resetTimer = null;
function disarmReset(){
  resetArmed = false; clearTimeout(resetTimer);
  btnReset.classList.remove("armed"); resetLabel.textContent = t('resetLabel');
}
btnReset.addEventListener("click", ()=>{
  if(orders.length===0){ disarmReset(); return; }   // nothing to clear
  if(!resetArmed){
    resetArmed = true;
    btnReset.classList.add("armed");
    resetLabel.textContent = t('resetArmed');
    resetTimer = setTimeout(disarmReset, 4000);       // reset automatically
    return;
  }
  disarmReset();
  record();
  orders = []; colorIdx = 0; loadNote = ""; updateNoteBtn(); renderAll();
});
// a click elsewhere disarms the reset again
document.addEventListener("click", e=>{ if(resetArmed && !btnReset.contains(e.target)) disarmReset(); });

// list: inputs (event delegation)
const list = document.getElementById("list");
let editRecorded = false;   // has this text-field edit already been saved to history?
list.addEventListener("input", e=>{
  const card = e.target.closest(".order"); if(!card) return;
  const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
  const f = e.target.dataset.f; if(!f) return;
  if(!editRecorded){ record(); editRecorded = true; }   // one undo step per edit
  if(e.target.classList.contains("num") || f==="sequence"){
    handleNumInput(e.target, o, f);
  } else {
    o[f] = e.target.value;
  }
  if(["length","width","height","qty","loadMode","sequence"].includes(f)) recalc();
});
list.addEventListener("change", e=>{
  const card = e.target.closest(".order"); if(!card) return;
  const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
  const f = e.target.dataset.f;
  if(f==="stackable"){ record(); o.stackable = e.target.checked; recalc(); }
  else if(f==="active"){ record(); o.active = e.target.checked;
    if(hideInactive) renderList(); else card.classList.toggle("inactive",!o.active);
    recalc(); }
  else if(f==="loadMode"){ record(); o.loadMode = e.target.value; renderList(); recalc(); }
});
list.addEventListener("click", e=>{
  const btn = e.target.closest("button[data-act]"); if(!btn) return;
  const card = e.target.closest(".order"); const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
  const act = btn.dataset.act;
  if(act==="del"){ record(); orders = orders.filter(x=>x.id!==o.id); renderAll(); }
  else if(act==="inc"){ record(); o.sequence = Math.min(99,(+o.sequence||0)+1); renderList(); recalc(); }
  else if(act==="dec"){ record(); o.sequence = Math.max(1,(+o.sequence||1)-1); renderList(); recalc(); }
});
// sortable column headers
list.addEventListener("click", e=>{
  const h = e.target.closest("[data-sort]"); if(!h) return;
  sortOrders(h.dataset.sort);
});
// flash an order's pallets in the graphic
function flashPallets(oid){
  document.querySelectorAll(`#truckSvg g.pal[data-oid="${oid}"]`).forEach(g=>{
    g.classList.remove("palflash");
    void g.getBoundingClientRect();   // reflow -> restart animation
    g.classList.add("palflash");
    setTimeout(()=> g.classList.remove("palflash"), 950);
  });
}
// trigger with dedupe (prevents a double flash from click + focus of the same interaction)
let lastFlashOid = null, lastFlashT = 0;
function triggerFlash(oid){
  const now = performance.now();
  if(oid === lastFlashOid && now - lastFlashT < 150) return;
  lastFlashOid = oid; lastFlashT = now;
  flashPallets(oid);
}
// Tab -> select content; focus into a row -> flash its pallets
list.addEventListener("focusin", e=>{
  const card = e.target.closest(".order");
  if(card && e.target.tagName==="INPUT" && e.target.type!=="checkbox"){ editRecorded = false; e.target.select(); }
  if(card) triggerFlash(card.dataset.id);
});
// click anywhere in the row (except buttons/header) -> flash pallets
list.addEventListener("click", e=>{
  if(e.target.closest("button[data-act]") || e.target.closest("[data-sort]")) return;
  const card = e.target.closest(".order"); if(card) triggerFlash(card.dataset.id);
});
// click the copy icon -> copy the order number to the clipboard
async function copyText(t){
  try{ await navigator.clipboard.writeText(t); return true; }
  catch(_){
    try{ const ta=document.createElement("textarea"); ta.value=t; ta.style.position="fixed"; ta.style.opacity="0";
      document.body.appendChild(ta); ta.focus(); ta.select(); const ok=document.execCommand("copy"); ta.remove(); return ok; }
    catch(_){ return false; }
  }
}
list.addEventListener("click", e=>{
  const sw = e.target.closest(".order .copybtn"); if(!sw) return;
  const card = e.target.closest(".order"); const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
  const nr = o.orderNo || ("#"+o.id);
  copyText(nr).then(ok => notify(ok?"ok":"warn",
    ok ? t('copied', esc(nr)) : t('copyFail'), "", 2500));
});

function handleNumInput(input, o, f){
  if(f==="length"||f==="width"||f==="height"){
    // digits + comma only; dot -> comma
    let v = input.value.replace(/\./g,",").replace(/[^0-9,]/g,"");
    const parts = v.split(","); if(parts.length>2) v = parts[0]+","+parts.slice(1).join("");
    input.value = v;
    o[f] = parseFloat(v.replace(",","."))||0;
  } else if(f==="qty"){
    let v = input.value.replace(/[^0-9]/g,""); input.value=v;
    o.qty = parseInt(v,10)||0;
  } else if(f==="sequence"){
    let v = input.value.replace(/[^0-9]/g,"");
    let n = parseInt(v,10); if(!Number.isFinite(n)) n=1; n=Math.max(1,Math.min(99,n));
    input.value = v===""?"":n; o.sequence = n;
  }
}

/* ---- clipboard ---- */
const modal = document.getElementById("modal");
const pasteArea = document.getElementById("pasteArea");
// import from clipboard (used by the toolbar button and the footer button in the list)
async function openPaste(){
  try{
    const txt = await navigator.clipboard.readText();
    if(txt && txt.trim()){ importText(txt); return; }
  }catch(_){ /* permission denied -> fallback dialog */ }
  pasteArea.value=""; modal.classList.add("open"); pasteArea.focus();
}
document.getElementById("btnPaste").addEventListener("click", openPaste);
document.getElementById("pasteCancel").addEventListener("click", ()=>modal.classList.remove("open"));
document.getElementById("pasteOk").addEventListener("click", ()=>{ importText(pasteArea.value); modal.classList.remove("open"); });
modal.addEventListener("click", e=>{ if(e.target===modal) modal.classList.remove("open"); });

function importText(txt){
  const {orders:parsed, skipped} = parseClipboard(txt);
  if(parsed.length===0 && skipped.length===0){
    notify("warn", t('tNoValid'));
    return;
  }
  // drop duplicates by order number (existing ones + within the import)
  const seen = new Set(orders.map(o => o.orderNo).filter(Boolean));
  const toAdd = [], duplicates = [];
  for(const o of parsed){
    const nr = o.orderNo;
    if(nr && seen.has(nr)){ duplicates.push(nr); }
    else { if(nr) seen.add(nr); toAdd.push(o); }
  }
  if(toAdd.length){
    const truck = TRUCKS[currentTruck];
    toAdd.forEach(o=>{ o.stackable = (2*o.height <= truck.h); }); // default stackable
    record();
    orders.push(...toAdd);
    renderAll();
  }
  // assemble hints
  const parts = [];
  if(duplicates.length) parts.push(t('dupSkipped', duplicates.length));
  if(skipped.length)    parts.push(t('incomplIgnored', skipped.length));
  const title = t('imported', toAdd.length) + (parts.length ? " — " + parts.join(", ") : "") + ".";
  let detail = "";
  if(duplicates.length) detail += t('dupListLabel') + duplicates.slice(0,8).join(", ") + (duplicates.length>8?" …":"") + "\n";
  if(skipped.length){
    detail += skipped.slice(0,5).map(l => l.length>70 ? l.slice(0,70)+"…" : l).join("\n");
    if(skipped.length>5) detail += "\n" + t('andMore', skipped.length-5);
  }
  const hasWarn = duplicates.length || skipped.length;
  notify(hasWarn ? "warn" : "ok", title, detail.trim(), 5000);  // auto-hide after 5 s
}

// toast hint: type ok|warn, html title, optional code preview, timeoutMs (0 = stays until closed)
function notify(type, titleHtml, detail="", timeoutMs=5000){
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = `<div><span>${titleHtml}</span>${detail?`<pre>${esc(detail)}</pre>`:""}</div>`+
                 `<button class="x" title="Schließen">×</button>`;
  el.querySelector(".x").addEventListener("click", ()=>el.remove());
  box.appendChild(el);
  if(timeoutMs>0) setTimeout(()=>el.remove(), timeoutMs);
}

// keyboard shortcut Ctrl+Z (not in text fields, native undo applies there)
document.addEventListener("keydown", e=>{
  if((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key.toLowerCase()==="z"){
    const t = e.target.tagName;
    if(t==="INPUT" || t==="TEXTAREA") return;   // native undo in the field
    e.preventDefault(); undo();
  }
});

// list-level controls outside the order rows: header icons + footer buttons (event delegation)
list.addEventListener("click", e=>{
  const b = e.target.closest("[data-listact]"); if(!b) return;
  switch(b.dataset.listact){
    case "allInactive":
      if(!orders.some(o=>o.active)) return;
      record(); orders.forEach(o=> o.active = false); renderAll(); break;
    case "hideInactive":
      hideInactive = !hideInactive; renderAll(); break;
    case "add":   addOrder(); break;
    case "paste": openPaste(); break;
  }
});

// text filter for the order list (rows only; the truck graphic shows all active orders).
// The search box lives in the persistent list header, so it is wired once after the first render.
function wireSearch(){
  const s = document.getElementById("search"); if(!s || s.dataset.wired) return;
  s.dataset.wired = "1";
  s.addEventListener("input", e=>{
    filterText = e.target.value.trim().toLowerCase();
    renderList(); recalc();   // recalc re-applies per-row bands for the now-visible rows
  });
}

// re-align the per-row position bands when the truck graphic rescales (debounced)
let resizeTimer = null;
window.addEventListener("resize", ()=>{ clearTimeout(resizeTimer); resizeTimer = setTimeout(recalc, 150); });

/* ============================ Start ============================ */
applyStatic();
updateNoteBtn();
renderAll();
wireSearch();   // the search box lives in the (persistent) list header created by renderAll
