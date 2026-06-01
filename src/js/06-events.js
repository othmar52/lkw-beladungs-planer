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
truckSel.addEventListener("change", e=>{
  record(); currentTruck = e.target.value; activeLoad().truck = currentTruck; renderAll();
});


/* ---------- loads (tab bar above the graphic) ---------- */
// leaving manual mode when the active load changes (the hand layout belongs to one load)
function dropManualForSwitch(){ if(manualMode){ manualMode=false; manualPallets=null; syncManualUI(); } }
function switchLoad(id){
  if(id===activeLoadId || !loads.some(l=>l.id===id)) return;
  dropManualForSwitch();
  activeLoadId = id;
  syncActiveLoadMirror();   // truck/name/note inputs follow the load
  resetSearch();
  renderAll();
}
function addLoad(){
  record();
  dropManualForSwitch();
  const l = makeLoad({ truck: currentTruck });
  loads.push(l); activeLoadId = l.id;
  syncActiveLoadMirror();
  renderAll();
  notify("ok", t('loadAdded'), "", 2500);
}
function deleteLoad(id){
  if(loads.length<=1) return;   // at least one load must remain
  record();
  const wasActive = (id===activeLoadId);
  loads = loads.filter(l=>l.id!==id);
  if(wasActive){ dropManualForSwitch(); activeLoadId = loads[0].id; syncActiveLoadMirror(); }
  renderAll();
}
document.getElementById("loadTabs").addEventListener("click", e=>{
  const del = e.target.closest("[data-loaddel]");
  if(del){ e.stopPropagation(); deleteLoad(+del.dataset.loaddel); return; }
  if(e.target.closest("[data-loadadd]")){ addLoad(); return; }
  const tab = e.target.closest("[data-loadid]");
  if(tab) switchLoad(+tab.dataset.loadid);
});
// double-click a tab -> rename the load inline
document.getElementById("loadTabs").addEventListener("dblclick", e=>{
  const tab = e.target.closest("[data-loadid]"); if(!tab) return;
  const id = +tab.dataset.loadid, load = loads.find(l=>l.id===id); if(!load) return;
  const nameSpan = tab.querySelector(".ltabname"); if(!nameSpan || tab.querySelector(".ltabedit")) return;
  const inp = document.createElement("input");
  inp.className = "ltabedit"; inp.value = load.name || ""; inp.placeholder = t('loadTab', loadIndex(load)+1);
  nameSpan.replaceWith(inp);
  inp.focus(); inp.select();
  let done = false;
  const commit = ()=>{ if(done) return; done = true; record(); load.name = inp.value.trim();
    if(id===activeLoadId) loadName = load.name; renderTabs(); };
  inp.addEventListener("blur", commit);
  inp.addEventListener("keydown", ev=>{
    if(ev.key==="Enter"){ ev.preventDefault(); inp.blur(); }
    else if(ev.key==="Escape"){ done = true; renderTabs(); }
  });
  inp.addEventListener("click", ev=> ev.stopPropagation());
  inp.addEventListener("dblclick", ev=> ev.stopPropagation());
});

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
  if(drag){ clearHover(); return; }   // no crosshair while actively dragging a pallet
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
  const layout = currentLayout();
  manualPallets = layout.placements.map((p,i)=>({
    pid:i+1, order:p.order, color:p.color, w:p.w, h:p.h, x:p.x, y:p.y, stack:p.stack }));
}
// reflect manualMode into the toolbar buttons + svg class (also used after undo/redo)
function syncManualUI(){
  document.getElementById("btnManual").classList.toggle("toggled", manualMode);
  document.getElementById("btnCompact").style.display = manualMode ? "" : "none";
  truckSvgEl.classList.toggle("manual", manualMode);
}
function setManualMode(on){
  manualMode = on;
  syncManualUI();
  if(on){ seedManualFromAuto(); notify("ok", t('manualOn'), "", 3500); }
  else  { manualPallets = null;  notify("ok", t('manualOff'), "", 2500); }
  recalc();
}
document.getElementById("btnManual").addEventListener("click", ()=> setManualMode(!manualMode));

// compact all pallets to the front: slide each forward in its y-band until it touches
// another pallet (or the front wall). Eliminates every X gap; Y positions stay unchanged.
function compactForward(){
  if(!manualMode || !manualPallets) return;
  record();
  const placed = [];
  for(const p of [...manualPallets].sort((a,b)=> a.x-b.x || a.y-b.y)){
    let x = 0;
    for(const q of placed)
      if(p.y < q.y+q.h-0.5 && q.y < p.y+p.h-0.5) x = Math.max(x, q.x+q.w);   // shares the y-band
    p.x = x; placed.push(p);
  }
  recalc();
}
document.getElementById("btnCompact").addEventListener("click", compactForward);

// drop a pallet: magnet-snap to nearby neighbour edges, then INSERT & SHOVE —
// any pallet overlapping it (or pushed into another) slides backwards (+x) to make room.
const SNAP_MM = 160;
function snapPallet(pal, arr){
  const list = arr || manualPallets;
  const W = TRUCKS[currentTruck].w;
  const others = list.filter(p=>p!==pal);
  // gentle magnet: snap x/y to the nearest neighbour edge within SNAP_MM
  const xe = [0]; const ye = [0, W-pal.h];
  for(const o of others){ xe.push(o.x, o.x+o.w); ye.push(o.y, o.y+o.h, o.y-pal.h); }
  const near = (v, cands)=>{ let best=v, bd=SNAP_MM; for(const c of cands){ const d=Math.abs(c-v); if(d<bd){bd=d; best=c;} } return best; };
  pal.x = Math.max(0, near(pal.x, xe));
  pal.y = Math.max(0, Math.min(W-pal.h, near(pal.y, ye)));
  const overlap = (a,b)=> a.x < b.x+b.w-0.5 && b.x < a.x+a.w-0.5 && a.y < b.y+b.h-0.5 && b.y < a.y+a.h-0.5;
  const xOv = (a,b)=> Math.min(a.x+a.w, b.x+b.w) - Math.max(a.x, b.x);   // overlap depth along the truck
  // gentle case: only a shallow overlap -> snap the dropped pallet BESIDE its neighbours (don't shove them).
  // Only a deep overlap (> half the pallet's depth) counts as "insert between" -> shove.
  const ov = others.filter(o=> overlap(pal,o));
  if(ov.length){
    const pen = Math.max(...ov.map(o=> xOv(pal,o)));
    if(pen < pal.w*0.5){
      const back  = Math.max(...ov.map(o=> o.x+o.w));            // sit just behind them
      const front = Math.min(...ov.map(o=> o.x)) - pal.w;        // or just in front
      pal.x = Math.max(0, (front>=0 && Math.abs(front-pal.x) <= Math.abs(back-pal.x)) ? front : back);
      if(others.some(o=> overlap(pal,o))){                       // still touching someone -> go fully to the band's front line
        let x=0; for(const o of others) if(pal.y < o.y+o.h-0.5 && o.y < pal.y+pal.h-0.5) x = Math.max(x, o.x+o.w);
        pal.x = x;
      }
      return;
    }
  }
  // insert & shove (fixpoint): the dropped pallet (anchor) stays put; everything overlapping it
  // is pushed backwards (+x). Among the others, the rear one slides behind the front one.
  let moved = true, guard = 0;
  while(moved && guard++ < 4000){
    moved = false;
    for(const o of others){
      if(overlap(o, pal)){                                  // anchor wins -> push o behind it
        const nx = pal.x+pal.w; if(nx > o.x+0.5){ o.x = nx; moved = true; }
      }
      for(const b of others){
        if(b===o || !overlap(o,b)) continue;
        const bFront = b.x < o.x-0.01 || (Math.abs(b.x-o.x)<0.01 && others.indexOf(b) < others.indexOf(o));
        if(bFront){ const nx = b.x+b.w; if(nx > o.x+0.5){ o.x = nx; moved = true; } }
      }
    }
  }
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
  // capture the pre-move state now (the drag mutates positions live) so a real move is undoable
  drag = { pal, dx: loc.x - pal.x, dy: loc.y - pal.y, moved:false, pointerId:e.pointerId, preState: captureState() };
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
  // show where it would snap to (dashed outline + front line), computed on a copy (no side effects)
  const clones = manualPallets.map(p=> ({...p}));
  const cp = clones[manualPallets.indexOf(drag.pal)];
  snapPallet(cp, clones);
  const g = document.getElementById("dropGuide");   // separate group -> not wiped by the hover handler
  if(g){
    const X = HOVER_PAD+cp.x, Y = HOVER_PAD+cp.y;
    g.innerHTML =
      `<rect x="${X+10}" y="${Y+10}" width="${cp.w-20}" height="${cp.h-20}" rx="18" fill="rgba(52,211,153,.12)" stroke="#34d399" stroke-width="22" stroke-dasharray="90 70"/>`+
      `<line x1="${X}" y1="${Y-25}" x2="${X}" y2="${Y+cp.h+25}" stroke="#34d399" stroke-width="14"/>`;
  }
  e.preventDefault();
});
truckSvgEl.addEventListener("pointerup", e=>{
  if(!drag) return;
  const { pal, moved, preState } = drag;
  try{ if(moved) truckSvgEl.releasePointerCapture(drag.pointerId); }catch(_){}
  drag = null;
  if(moved){ pushUndo(preState); snapPallet(pal); recalc(); }   // a plain click (no move) leaves the DOM intact -> dblclick can fire
});
// double-click a pallet -> rotate (swap length/width) if it still fits the width
truckSvgEl.addEventListener("dblclick", e=>{
  if(!manualMode) return;
  const g = e.target.closest("[data-pid]"); if(!g) return;
  const pal = manualPallets.find(p=>p.pid==g.dataset.pid); if(!pal) return;
  if(pal.h > TRUCKS[currentTruck].w && pal.w > TRUCKS[currentTruck].w) return;
  if(pal.w > TRUCKS[currentTruck].w) return;   // rotated (new height = old width) would exceed width
  record();
  const nw = pal.h, nh = pal.w; pal.w = nw; pal.h = nh;
  snapPallet(pal); recalc(); e.preventDefault();
});

/* ---------- export the error-analysis file (tests/cases/*.json) ----------
   Stores BOTH layouts so the algo can be improved:
   - "algo": what the algorithm currently produces  ("so ist es" / not optimal if a hand layout exists)
   - "hand": the manually corrected layout, if any   ("so ist es gut" = desired target)
   Each layout keeps pallet positions (relative to the others via absolute mm) + total load metres.
   Runner-compatible: expected = hand (or algo), baseline = algo. */
function exportTestcase(){
  const truck = TRUCKS[currentTruck];
  const active = loadOrders(activeLoad());   // virtual orders on the active load (qty = assigned)
  if(!active.length){ notify("warn", t('tNoExport')); return; }
  const idx = {}; active.forEach((o,i)=> idx[o.id]=i);
  const r = (mm,d=3)=> +(mm/1000).toFixed(d);
  const placementsOf = layout => layout.placements.map(p=>({
    oi: idx[p.order.id] ?? 0, x: Math.round(p.x), y: Math.round(p.y), w: p.w, h: p.h, stack: p.stack||1,
    overflow: !!p.overflow }));
  const auto = currentLayout();
  const fixture = {
    kind: "analysis",
    truckName: currentTruck,
    truck: { l:truck.l, w:truck.w, h:truck.h },
    orders: active.map(o=>({ orderNo:o.orderNo, customer:o.customer, deliveryDate:o.deliveryDate, destCode:o.destCode,
      qty:o.qty, length:o.length, width:o.width, height:o.height, loadMode:o.loadMode, sequence:o.sequence,
      stackable:o.stackable, active:true, color:o.color })),
    algo: { usedLength_m: r(auto.usedLength,3), overflow: auto.placements.filter(p=>p.overflow).length, placements: placementsOf(auto) },
  };
  if(manualMode && manualPallets && manualPallets.length){
    const hand = manualLayout();
    fixture.hand = { usedLength_m: r(hand.usedLength,3), overflow: hand.placements.filter(p=>p.overflow).length, placements: placementsOf(hand) };
  }
  const target = fixture.hand ? fixture.hand.usedLength_m : fixture.algo.usedLength_m;
  fixture.expected = { usedLength_m: +target.toFixed(2), overflow: fixture.algo.overflow, tolerance_m: 0.05 };
  fixture.baseline = { usedLength_m: fixture.algo.usedLength_m };
  fixture.name = `${active.length} Auftr., ${active.reduce((s,o)=>s+o.qty,0)} Pal., algo ${fixture.algo.usedLength_m}m`
    + (fixture.hand ? ` -> hand ${fixture.hand.usedLength_m}m` : "");
  const d = new Date();
  const ts = `${pad2(d.getDate())}${pad2(d.getMonth()+1)}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  const fname = `analysis-${active.length}o-${target.toFixed(2)}m-${ts}.json`;
  const blob = new Blob([JSON.stringify(fixture, null, 2)+"\n"], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=fname;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  notify("ok", t('tcSaved'), "tests/cases/ ← "+fname, 4500);
}
document.getElementById("btnTestcase").addEventListener("click", exportTestcase);

/* ---------- calibration: generate a random load to stress-test the algorithm ---------- */
function randomLoad(){
  if(manualMode) setManualMode(false);
  record();
  colorIdx = 0; orders = [];
  loads = [makeLoad({ truck: currentTruck })]; activeLoadId = loads[0].id;   // single fresh load
  const sizes = [[1200,800],[1200,1000],[1200,830],[1200,1200],[1300,900],[1400,1000]];   // never smaller than 1200x800
  const pickMode = ()=>{ const r = Math.random(); return r < 0.75 ? "optimized" : r < 0.90 ? "long" : "wide"; };   // 75% / 15% / 10%
  const n = 2 + Math.floor(Math.random()*4);
  for(let i=0;i<n;i++){
    const s = sizes[Math.floor(Math.random()*sizes.length)];
    const l = Math.max(s[0], s[1]), w = Math.min(s[0], s[1]);   // length must always be >= width
    orders.push(makeOrder({
      orderNo: "R"+(1000+Math.floor(Math.random()*9000)), customer: "Test "+(i+1),
      qty: 1+Math.floor(Math.random()*8), length:l, width:w, height: 1000+Math.floor(Math.random()*1000),
      loadMode: pickMode(), sequence: 1+Math.floor(Math.random()*3),
      active: true,
    }));
  }
  loads[0].assign = {}; orders.forEach(o=> loads[0].assign[o.id] = o.qty);   // all pallets on the load
  syncActiveLoadMirror();
  revealNewOrders();
  renderAll();
  notify("ok", t('randomCreated'), "", 4000);
}
document.getElementById("btnRandom").addEventListener("click", randomLoad);

// toolbar
// add a new order (used by the toolbar button and the footer button in the list)
function addOrder(){
  record();
  const o = makeOrder({length:1200, width:800, height:1200, qty:1, sequence:1});
  orders.push(o);
  revealNewOrders();   // new (inactive) order -> un-hide inactive + clear the search so it is visible
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
document.getElementById("btnRedo").addEventListener("click", redo);

// reflect the inline header controls' state (hide-inactive on/off + inactive count) without a full re-render
function updateHeadCtl(){
  const inact = orders.filter(o=>!onActive(o)).length;
  const filtering = !!filterText;
  const hb = document.querySelector('#listHead [data-listact="hideInactive"]');
  if(!hb) return;
  hb.classList.toggle("on", hideInactive);
  hb.classList.toggle("filtering", filtering);
  hb.title = filtering ? t('hideSearch') : (hideInactive ? t('hideShow') : t('hideHide'));
  let cnt = hb.querySelector(".cnt");
  if(hideInactive && !filtering && inact>0){   // badge shows how many are currently hidden
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
  if(noteArea.value !== loadNote) record();
  loadNote = noteArea.value; activeLoad().note = loadNote; updateNoteBtn(); noteModal.classList.remove("open");
});
noteModal.addEventListener("click", e=>{ if(e.target===noteModal) noteModal.classList.remove("open"); });

// "»"-overflow dialog: fill the active load, optionally spread the rest over new loads
const splitModal = document.getElementById("splitModal");
let splitPending = null;   // { oid, nFit, cap }
function closeSplit(){ splitModal.classList.remove("open"); splitPending = null; }
function applyFit(o, n){ const al = activeLoad(); if(n>0) al.assign[o.id] = n; else delete al.assign[o.id]; }
// (re)compute the dialog texts for the currently selected truck type
function updateSplitDialog(){
  if(!splitPending) return;
  const o = orders.find(x=>x.id===splitPending.oid); if(!o) return;
  const truckName = document.getElementById("splitTruck").value;
  const need = loadsNeeded(o, splitPending.cap - splitPending.nFit, truckName);
  splitPending.truckName = truckName; splitPending.need = need;
  document.getElementById("splitCreatePre").textContent = t('splitCreatePre', need.loads);
  document.getElementById("splitFillOnly").textContent = t('splitFillBtn', splitPending.nFit, splitPending.cap);
  document.getElementById("splitCreate").classList.toggle("disabled", need.loads<=0);
}
const splitTruckSel = document.getElementById("splitTruck");
splitTruckSel.addEventListener("change", updateSplitDialog);
splitTruckSel.addEventListener("click", e=> e.stopPropagation());   // choosing the type must not trigger "create"
splitTruckSel.addEventListener("mousedown", e=> e.stopPropagation());
document.getElementById("splitClose").addEventListener("click", closeSplit);
splitModal.addEventListener("click", e=>{ if(e.target===splitModal) closeSplit(); });
document.getElementById("splitFillOnly").addEventListener("click", ()=>{
  if(!splitPending) return;
  const o = orders.find(x=>x.id===splitPending.oid); if(!o){ closeSplit(); return; }
  record(); applyFit(o, splitPending.nFit);
  closeSplit(); if(manualMode) seedManualFromAuto(); recalc();
});
document.getElementById("splitCreate").addEventListener("click", ()=>{
  if(!splitPending) return;
  if(document.getElementById("splitCreate").classList.contains("disabled")) return;
  const o = orders.find(x=>x.id===splitPending.oid); if(!o){ closeSplit(); return; }
  const tn = splitPending.truckName || activeLoad().truck;
  record();
  applyFit(o, splitPending.nFit);
  let remaining = splitPending.cap - splitPending.nFit, created = 0, guard = 0;
  while(remaining>0 && guard++ < 99){
    const nl = makeLoad({ truck: tn }); loads.push(nl);
    const n = fitCount(nl, o, remaining);
    if(n<=0){ loads = loads.filter(l=>l.id!==nl.id); break; }   // pallet too big even for an empty truck
    nl.assign[o.id] = n; remaining -= n; created++;
  }
  closeSplit();
  if(manualMode) seedManualFromAuto();
  renderAll();
  notify("ok", t('splitDone', created) + (remaining>0 ? " "+t('splitRest', remaining) : ""), "", 4500);
});

// export as JSON
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const expNote = document.getElementById("expNote");
const pad2 = n => String(n).padStart(2,"0");
function defaultExportName(){
  const d = new Date();
  const stamp = `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} ${pad2(d.getHours())}-${pad2(d.getMinutes())}`;
  const base = loadName.trim() || "LKW-Ladung";   // a load name replaces the "LKW-Ladung" prefix
  return `${base} ${stamp}`;
}
function doExport(name){
  loadNote = expNote.value; activeLoad().note = loadNote; updateNoteBtn();
  const inclInactive = document.getElementById("expInclInactive").checked;
  // pool to export: all orders, or only those that sit on at least one load
  const pool = inclInactive ? orders : orders.filter(o=> assignedTotal(o)>0);
  const usedTrucks = {};
  for(const l of loads) if(TRUCKS[l.truck]) usedTrucks[l.truck] = TRUCKS[l.truck];
  const data = {
    app:"lkw-planer", version:2,
    activeLoad: Math.max(0, loads.findIndex(l=>l.id===activeLoadId)),
    trucks: usedTrucks,
    loads: loads.map(l=>({ name:l.name, truck:l.truck, note:l.note,
      assign: pool.map(o=> l.assign[o.id]|0) })),   // pallet counts aligned to the orders index
    orders: pool.map(o=>({ orderNo:o.orderNo, customer:o.customer, deliveryDate:o.deliveryDate,
      destCode:o.destCode, qty:o.qty, length:o.length, width:o.width, height:o.height,
      loadMode:o.loadMode, sequence:o.sequence, stackable:o.stackable, remark:o.remark, color:o.color })),
    // legacy mirrors (active load) so an older importer still finds a usable single load
    truck: currentTruck, name: loadName, note: loadNote,
  };
  let fname = (name||"").trim().replace(/[\\/:*?"<>|]/g,"-") || defaultExportName();
  if(!/\.json$/i.test(fname)) fname += ".json";
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  notify("ok", t('exported', pool.length), fname, 4000);
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
  /* @page margin:0 suppresses the browser header/footer; each .page provides its own margin -> one A4 sheet per load */
  body{margin:0;color:#000;background:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}
  .page{padding:10mm 12mm;break-after:page;}
  .page:last-child{break-after:auto;}
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
  @page{size:A4 landscape;margin:0;}
`;
// one print page (one A4 sheet) for a single load
function buildLoadPage(load){
  const layout = (manualMode && load.id===activeLoadId) ? manualLayout()
               : computeLayout(loadOrders(load), TRUCKS[load.truck] || TRUCKS[currentTruck]);
  const truck = layout.truck;
  const ords = loadOrders(load);
  const usedM = (Math.ceil(layout.usedLength/100)/10).toFixed(1);
  const Lm = truck.l/1000;
  const freeM = Math.max(0, Math.round((Lm - usedM)*10)/10).toFixed(1);
  const totalPal = ords.reduce((s,o)=>s+o.qty,0);
  const over = layout.placements.filter(p=>p.overflow).reduce((s,p)=>s+(p.stack||1),0);
  const d = new Date();
  const dateStr = `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fitTxt = ords.length ? (layout.fits ? t('fitOk') : t('fitBad', over)) : "";
  const dims = `${Lm.toFixed(2)} × ${(truck.w/1000).toFixed(2)} × ${(truck.h/1000).toFixed(2)} m`;
  const th = [t('col_orderNo'),t('col_customer'),t('col_deliveryDate'),t('col_destCode'),t('col_qty'),
              t('printDims'),t('col_sequence'),t('printLmCol'),t('col_remark')]
              .map(x=>`<th>${esc(x)}</th>`).join("");
  const rows = ords.map(o=>{
    return `<tr><td>${esc(o.orderNo)}</td><td>${esc(o.customer)}</td><td>${esc(o.deliveryDate)}</td>`+
      `<td>${esc(o.destCode)}</td><td>${o.qty}</td><td>${o.length} × ${o.width} × ${o.height}</td>`+
      `<td>${o.sequence}</td><td>${orderLoadMeters(o,truck).toFixed(1)}</td>`+
      `<td>${esc(o.remark||"")}</td></tr>`;
  }).join("");
  const remarks = (load.note||"").trim()
    ? `<div class="premarks"><b>${t('printRemarks')}:</b> ${esc(load.note)}</div>` : "";
  return `<section class="page">`+
    `<h1>${t('printTitle')} — ${esc(loadLabel(load))}</h1>`+
    `<div class="pmeta"><b>${t('printDate')}:</b> ${dateStr} &nbsp;·&nbsp; <b>${t('truckLabel')}:</b> ${esc(load.truck)} (${dims})<br>`+
    `<b>${t('used')}</b> ${usedM} m &nbsp;·&nbsp; <b>${t('free')}</b> ${freeM} m &nbsp;·&nbsp; ${esc(t('palCount',totalPal))}`+
    (fitTxt ? ` &nbsp;·&nbsp; ${esc(fitTxt)}` : "") + `</div>`+
    `<div class="psvg">${buildPrintSvg(layout)}</div>`+
    remarks +
    `<h2>${t('printOrders')}</h2>`+
    `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`+
    `</section>`;
}
// print: ALL loads, one A4 sheet per load (loads with at least one pallet; else the active load)
function buildPrintView(){
  const withPal = loads.filter(l => orders.some(o => (l.assign[o.id]|0) > 0));
  const list = withPal.length ? withPal : [activeLoad()];
  return list.map(buildLoadPage).join("");
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
      // register any truck types shipped with the file (multi-load files carry a `trucks` map)
      if(data.trucks && typeof data.trucks==="object"){
        let added = false;
        for(const [nm,T] of Object.entries(data.trucks)){
          if(T && typeof T==="object" && !TRUCKS[nm]){ TRUCKS[nm] = {l:+T.l, w:+T.w, h:+T.h}; added = true; }
        }
        if(added){ saveTrucks(); rebuildTruckSelect(); }
      }
      // rebuild the loads
      loadSeq = 1;
      if(Array.isArray(data.loads)){
        // multi-load format: assign arrays aligned to the orders index
        loads = data.loads.map(L=>{
          const tn = (L && L.truck && TRUCKS[L.truck]) ? L.truck : currentTruck;
          const load = makeLoad({ name:(L&&L.name)||"", truck:tn, note:(L&&L.note)||"" });
          const arr = (L && Array.isArray(L.assign)) ? L.assign : [];
          orders.forEach((o,i)=>{ const n = arr[i]|0; if(n>0) load.assign[o.id] = Math.min(n, o.qty|0); });
          return load;
        });
        if(!loads.length) loads = [makeLoad()];
        const ai = Math.max(0, Math.min(loads.length-1, +data.activeLoad||0));
        activeLoadId = loads[ai].id;
      } else {
        // legacy single-load: truck name string OR {l,w,h} object (analysis file), assign active orders fully
        let tn = currentTruck;
        if(typeof data.truck==="string" && TRUCKS[data.truck]) tn = data.truck;
        else if(data.truck && typeof data.truck==="object"){
          const T = data.truck, nm0 = data.truckName;
          let nm = (nm0 && TRUCKS[nm0] && TRUCKS[nm0].l===T.l && TRUCKS[nm0].w===T.w && TRUCKS[nm0].h===T.h) ? nm0 : null;
          if(!nm){ nm = (nm0 ? nm0+" (Import)" : "Import"); TRUCKS[nm] = {l:+T.l, w:+T.w, h:+T.h}; saveTrucks(); rebuildTruckSelect(); }
          tn = nm;
        }
        const load = makeLoad({ name:(typeof data.name==="string"?data.name:""), truck:tn,
          note:(typeof data.note==="string"?data.note:"") });
        orders.forEach(o=>{ if(o.active && o.qty>0) load.assign[o.id] = o.qty; });
        loads = [load]; activeLoadId = load.id;
      }
      syncActiveLoadMirror();   // currentTruck/name/note + inputs follow the active load
      revealNewOrders();        // freshly imported orders -> un-hide + clear the search
      // analysis file with a hand-optimised layout -> show it in manual mode for inspection
      if(data.hand && Array.isArray(data.hand.placements) && manualMode) setManualMode(false);
      renderAll();
      if(data.hand && Array.isArray(data.hand.placements)){
        manualMode = true;
        document.getElementById("btnManual").classList.add("toggled");
        document.getElementById("btnCompact").style.display = "";   // show the compact button (import bypasses setManualMode)
        truckSvgEl.classList.add("manual");
        manualPallets = data.hand.placements.map((p,i)=>{
          const o = orders[p.oi] || orders[0];
          return { pid:i+1, order:o, color:(o&&o.color)||"#888", w:p.w, h:p.h, x:p.x, y:p.y, stack:p.stack||1 };
        });
        recalc();
        notify("ok", t('analysisLoaded'), `Hand ${data.hand.usedLength_m}m · Algo ${data.algo?data.algo.usedLength_m:"?"}m`, 5000);
      } else {
        const noteHint = loadNote.trim() ? t('withRemarks') : "";
        notify("ok", t('imported', orders.length) + noteHint + ".", "", 4000);
      }
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
  orders = []; colorIdx = 0;
  loads = [makeLoad({ truck: currentTruck })]; activeLoadId = loads[0].id;   // back to one empty load
  hideInactive = false; resetSearch();   // "clear all" also clears the search filter
  manualMode = false; manualPallets = null; syncManualUI();
  syncActiveLoadMirror(); renderAll();
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
  if(["length","width","height","qty","loadMode","sequence","assignQty"].includes(f)){
    if(manualMode) seedManualFromAuto();   // qty/size/sequence/assignment change the pallet set -> rebuild the hand layout
    recalc();
  }
});
list.addEventListener("change", e=>{
  const card = e.target.closest(".order"); if(!card) return;
  const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
  const f = e.target.dataset.f;
  if(f==="stackable"){ record(); o.stackable = e.target.checked; }
  else if(f==="loadMode"){ record(); o.loadMode = e.target.value; renderList(); }
  else return;
  // structural change (stacking/load mode changes the pallet set) -> rebuild the hand layout
  if(manualMode) seedManualFromAuto();
  recalc();
});
list.addEventListener("click", e=>{
  const btn = e.target.closest("button[data-act]"); if(!btn) return;
  const card = e.target.closest(".order"); const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
  const act = btn.dataset.act;
  if(act==="del"){ record(); orders = orders.filter(x=>x.id!==o.id); renderAll(); }
  else if(act==="inc"){ record(); o.sequence = Math.min(99,(+o.sequence||0)+1); renderList(); recalc(); }
  else if(act==="dec"){ record(); o.sequence = Math.max(1,(+o.sequence||1)-1); renderList(); recalc(); }
  else if(act==="fillFit"){
    // load as many of this order's pallets as still fit on the active load's truck
    const al = activeLoad(), nFit = maxFitOnActive(o), cap = assignCap(o), cur = al.assign[o.id]|0;
    if(nFit >= cap){
      // Case A: everything that may go on this load fits -> just load it
      if(nFit === cur){ notify("warn", t('fillNone')); return; }
      record();
      if(cap>0) al.assign[o.id] = cap; else delete al.assign[o.id];
      if(manualMode) seedManualFromAuto();
      recalc();
    } else {
      // Case B: load too large -> ask whether to create more loads (truck type selectable)
      splitPending = { oid:o.id, nFit, cap };
      const sel = document.getElementById("splitTruck");
      sel.innerHTML = Object.keys(TRUCKS).map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
      sel.value = al.truck;   // preselect the active tab's truck type
      updateSplitDialog();
      splitModal.classList.add("open");
    }
  }
  else if(act==="clearAssign"){
    // remove this order entirely from the active load
    const al = activeLoad();
    if(!(al.assign[o.id]|0)) return;   // already not on this load
    record();
    delete al.assign[o.id];
    if(manualMode) seedManualFromAuto();
    recalc();
  }
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
  } else if(f==="assignQty"){
    // pallets of this order on the ACTIVE load (0 .. total minus what other loads hold)
    let v = input.value.replace(/[^0-9]/g,"");
    let n = parseInt(v,10); if(!Number.isFinite(n)) n = 0;
    n = Math.max(0, Math.min(assignCap(o), n));
    input.value = (v==="" ) ? "" : n;
    const al = activeLoad();
    if(n>0) al.assign[o.id] = n; else delete al.assign[o.id];
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
    revealNewOrders();   // newly pasted orders -> un-hide inactive + clear the search
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

// keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
// (not while editing a text field — native undo/redo applies there)
document.addEventListener("keydown", e=>{
  if(!(e.ctrlKey||e.metaKey)) return;
  const tag = e.target.tagName;
  if(tag==="INPUT" || tag==="TEXTAREA") return;   // native undo/redo in the field
  const k = e.key.toLowerCase();
  if(k==="z" && !e.shiftKey){ e.preventDefault(); undo(); }
  else if(k==="y" || (k==="z" && e.shiftKey)){ e.preventDefault(); redo(); }
});

// list-level controls outside the order rows: header icons + footer buttons (event delegation)
list.addEventListener("click", e=>{
  const b = e.target.closest("[data-listact]"); if(!b) return;
  switch(b.dataset.listact){
    case "allInactive":
      if(!orders.some(o=>onActive(o))) return;
      record(); activeLoad().assign = {}; renderAll(); break;
    case "hideInactive":
      hideInactive = !hideInactive;
      if(!hideInactive) resetSearch();   // "show inactive again" also clears the search filter
      renderAll(); break;
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
// clear the active search filter + the search input
function resetSearch(){
  filterText = "";
  const s = document.getElementById("search"); if(s) s.value = "";
}
// reflect the current filterText into the search box (after undo/redo/import)
function syncSearchInput(){
  const s = document.getElementById("search"); if(s) s.value = filterText;
}
// new orders coming in -> make them visible again (un-hide inactive + drop the search filter)
function revealNewOrders(){
  hideInactive = false;
  resetSearch();
}

// re-align the per-row position bands when the truck graphic rescales (debounced)
let resizeTimer = null;
window.addEventListener("resize", ()=>{ clearTimeout(resizeTimer); resizeTimer = setTimeout(recalc, 150); });

/* ============================ Start ============================ */
applyStatic();
updateNoteBtn();
renderAll();
wireSearch();   // the search box lives in the (persistent) list header created by renderAll
