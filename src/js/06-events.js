/* ============================ Events ============================ */
function esc(s){ return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

// LKW-Auswahl
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

/* ---------- Einstellungen (LKW-Typen + Anzeige) ---------- */
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
// liest alle Tabellenzeilen, baut TRUCKS neu (Reihenfolge bleibt), speichert & aktualisiert
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
  if(Object.keys(next).length===0) return;   // mind. ein gültiger Typ muss bleiben
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
  applyStatic();   // statische Texte
  renderAll();     // dynamische Inhalte (Liste/Grafik/Info/Totals/Labels)
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

// Hover über eine freie Lücke -> zwei Maß-Achsen (Länge × Breite der Lücke) einblenden
const truckSvgEl = document.getElementById("truckSvg");
const palTip = document.getElementById("palTip");
function clearHoverGuide(){ const g = document.getElementById("hoverGuide"); if(g) g.innerHTML = ""; }
function hidePalTip(){ palTip.style.display = "none"; }
function clearHover(){ clearHoverGuide(); hidePalTip(); }
truckSvgEl.addEventListener("mouseleave", clearHover);
truckSvgEl.addEventListener("mousemove", e=>{
  const g = document.getElementById("hoverGuide"); if(!g || !hoverLayout) return;
  const ctm = truckSvgEl.getScreenCTM(); if(!ctm) return;
  const pt = truckSvgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const loc = pt.matrixTransform(ctm.inverse());
  const pad = HOVER_PAD, { truck, placements } = hoverLayout, L = truck.l, W = truck.w;
  const tx = loc.x - pad, ty = loc.y - pad;
  if(tx < 0 || tx > L || ty < 0 || ty > W){ clearHover(); return; }
  // über einer geladenen Palette? -> Maße (L×B×H) als Tooltip anzeigen
  for(const p of placements){
    if(tx >= p.x-0.01 && tx <= p.x+p.w+0.01 && ty >= p.y-0.01 && ty <= p.y+p.h+0.01){
      g.innerHTML = "";
      const o = p.order;
      palTip.innerHTML = `<b>${esc(o.auftragsnummer || "#"+o.id)}</b>` + (o.kunde ? ` · ${esc(o.kunde)}` : "") + `<br>`+
        `${t('tipLBH')} ${o.laenge} × ${o.breite} × ${o.hoehe} mm` + (p.stack===2 ? " "+t('stacked') : "");
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
  // freie Spanne in X (bei Höhe ty) und in Y (bei Länge tx)
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
  // X-Achse (Länge der Lücke)
  h += `<line x1="${px0}" y1="${pty}" x2="${px1}" y2="${pty}" stroke="${C}" stroke-width="9"/>`;
  h += `<line x1="${px0}" y1="${pty-55}" x2="${px0}" y2="${pty+55}" stroke="${C}" stroke-width="9"/>`;
  h += `<line x1="${px1}" y1="${pty-55}" x2="${px1}" y2="${pty+55}" stroke="${C}" stroke-width="9"/>`;
  h += `<text x="${(px0+px1)/2}" y="${pty-75}" font-size="150" fill="${C}" text-anchor="middle" font-weight="800" paint-order="stroke" stroke="${DK}" stroke-width="45">${fmt(x1-x0)}</text>`;
  // Y-Achse (Breite der Lücke)
  h += `<line x1="${ptx}" y1="${py0}" x2="${ptx}" y2="${py1}" stroke="${C}" stroke-width="9"/>`;
  h += `<line x1="${ptx-55}" y1="${py0}" x2="${ptx+55}" y2="${py0}" stroke="${C}" stroke-width="9"/>`;
  h += `<line x1="${ptx-55}" y1="${py1}" x2="${ptx+55}" y2="${py1}" stroke="${C}" stroke-width="9"/>`;
  h += `<text x="${ptx+75}" y="${(py0+py1)/2}" font-size="150" fill="${C}" text-anchor="start" dominant-baseline="central" font-weight="800" paint-order="stroke" stroke="${DK}" stroke-width="45">${fmt(y1-y0)}</text>`;
  g.innerHTML = h;
});

// Klick auf Palette -> zugehörige Auftragszeile hinscrollen + aufblitzen
document.getElementById("truckSvg").addEventListener("click", e=>{
  const g = e.target.closest("[data-oid]"); if(!g) return;
  const row = document.querySelector(`.order[data-id="${g.dataset.oid}"]`);
  if(!row) return;
  row.scrollIntoView({behavior:"smooth", block:"center"});
  row.classList.remove("flash");
  void row.offsetWidth;          // Reflow erzwingen, damit die Animation neu startet
  row.classList.add("flash");
  setTimeout(()=> row.classList.remove("flash"), 1200);
});

// Toolbar
document.getElementById("btnAdd").addEventListener("click", ()=>{
  record();
  const o = makeOrder({laenge:1200, breite:800, hoehe:1200, anzahl:1, reihenfolge:1});
  orders.push(o);
  if(hideInactive){   // neuer Auftrag ist inaktiv -> Filter aus, damit er sichtbar ist
    hideInactive = false;
    btnHide.classList.remove("toggled");
  }
  renderAll();
  // zum neuen Auftrag scrollen und Auftragsnummer fokussieren
  const row = document.querySelector(`.order[data-id="${o.id}"]`);
  if(row){
    row.scrollIntoView({behavior:"smooth", block:"nearest"});
    const inp = row.querySelector('input[data-f="auftragsnummer"]');
    if(inp){ inp.focus(); inp.select(); }
  }
});
document.getElementById("btnRefresh").addEventListener("click", renderAll);
document.getElementById("btnUndo").addEventListener("click", undo);

// Alle Aufträge auf inaktiv setzen
document.getElementById("btnDeselect").addEventListener("click", ()=>{
  if(!orders.some(o=>o.aktiv)) return;
  record();
  orders.forEach(o=> o.aktiv = false);
  renderAll();
});

// Inaktive in der Liste aus-/einblenden
const btnHide = document.getElementById("btnHideInactive");
function updateHideLabel(){
  const inact = orders.filter(o=>!o.aktiv).length;
  const lbl = document.getElementById("hideLabel");
  if(lbl) lbl.textContent = (hideInactive ? t('hideShow') : t('hideHide')) + (inact ? ` (${inact})` : "");
}
btnHide.addEventListener("click", ()=>{
  hideInactive = !hideInactive;
  btnHide.classList.toggle("toggled", hideInactive);
  renderAll();   // Liste + Totals (inkl. Ausgeblendet-Hinweis) + Label aktualisieren
});

// Bemerkungen-Notiz (Anzeigen/Bearbeiten)
const noteModal = document.getElementById("noteModal");
const noteArea = document.getElementById("noteArea");
function updateNoteBtn(){
  document.getElementById("btnNote").classList.toggle("hasnote", loadBemerkungen.trim().length>0);
}
document.getElementById("btnNote").addEventListener("click", ()=>{
  noteArea.value = loadBemerkungen; noteModal.classList.add("open"); noteArea.focus();
});
document.getElementById("noteCancel").addEventListener("click", ()=> noteModal.classList.remove("open"));
document.getElementById("noteOk").addEventListener("click", ()=>{
  loadBemerkungen = noteArea.value; updateNoteBtn(); noteModal.classList.remove("open");
});
noteModal.addEventListener("click", e=>{ if(e.target===noteModal) noteModal.classList.remove("open"); });

// Export als JSON
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const expNote = document.getElementById("expNote");
const pad2 = n => String(n).padStart(2,"0");
function defaultExportName(){
  const d = new Date();
  return `LKW-Ladung ${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} ${pad2(d.getHours())}-${pad2(d.getMinutes())}`;
}
function doExport(name){
  loadBemerkungen = expNote.value; updateNoteBtn();
  const data = { app:"lkw-planer", version:1, truck:currentTruck, bemerkungen:loadBemerkungen,
    orders: orders.map(o=>({ auftragsnummer:o.auftragsnummer, kunde:o.kunde, lieferdatum:o.lieferdatum,
      destCode:o.destCode, anzahl:o.anzahl, laenge:o.laenge, breite:o.breite, hoehe:o.hoehe,
      ladeart:o.ladeart, reihenfolge:o.reihenfolge, stapelbar:o.stapelbar, aktiv:o.aktiv,
      bemerkung:o.bemerkung, color:o.color })) };
  let fname = (name||"").trim().replace(/[\\/:*?"<>|]/g,"-") || defaultExportName();
  if(!/\.json$/i.test(fname)) fname += ".json";
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  notify("ok", t('exported', orders.length), fname, 4000);
}
document.getElementById("btnExport").addEventListener("click", ()=>{
  if(orders.length===0){ notify("warn", t('tNoExport')); return; }
  nameInput.value = defaultExportName();
  expNote.value = loadBemerkungen;
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

// Druck-Grafik: weiße LKW-Fläche, Paletten als Schraffur (je Auftrag eigener Winkel/Farbe)
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
    s += `<text class="pal-label" x="${cx}" y="${cy}" font-size="170" text-anchor="middle" dominant-baseline="central">${esc(p.order.auftragsnummer || "#"+p.order.id)}</text>`;
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
// Druckansicht / PDF (via Browser-Druckdialog -> „Als PDF speichern")
function buildPrintView(){
  const layout = computeLayout();
  const truck = layout.truck;
  const active = orders.filter(o=>o.aktiv && o.anzahl>0);
  const usedM = (Math.ceil(layout.usedLength/100)/10).toFixed(1);
  const Lm = truck.l/1000;
  const freeM = Math.max(0, Math.round((Lm - usedM)*10)/10).toFixed(1);
  const totalPal = active.reduce((s,o)=>s+o.anzahl,0);
  const over = layout.placements.filter(p=>p.overflow).reduce((s,p)=>s+(p.stack||1),0);
  const d = new Date();
  const dateStr = `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fitTxt = active.length ? (layout.fits ? t('fitOk') : t('fitBad', over)) : "";
  const dims = `${Lm.toFixed(2)} × ${(truck.w/1000).toFixed(2)} × ${(truck.h/1000).toFixed(2)} m`;
  const th = [t('col_auftragsnummer'),t('col_kunde'),t('col_lieferdatum'),t('col_destCode'),t('col_anzahl'),
              t('printDims'),t('col_reihenfolge'),t('printLmCol'),t('col_bemerkung')]
              .map(x=>`<th>${esc(x)}</th>`).join("");
  const rows = active.map(o=>{
    return `<tr><td>${esc(o.auftragsnummer)}</td><td>${esc(o.kunde)}</td><td>${esc(o.lieferdatum)}</td>`+
      `<td>${esc(o.destCode)}</td><td>${o.anzahl}</td><td>${o.laenge} × ${o.breite} × ${o.hoehe}</td>`+
      `<td>${o.reihenfolge}</td><td>${orderLademeter(o,truck).toFixed(1)}</td>`+
      `<td>${esc(o.bemerkung||"")}</td></tr>`;
  }).join("");
  const remarks = loadBemerkungen.trim()
    ? `<div class="premarks"><b>${t('printRemarks')}:</b> ${esc(loadBemerkungen)}</div>` : "";
  document.getElementById("printView").innerHTML =
    `<h1>${t('printTitle')}</h1>`+
    `<div class="pmeta"><b>${t('printDate')}:</b> ${dateStr} &nbsp;·&nbsp; <b>${t('truckLabel')}:</b> ${esc(currentTruck)} (${dims})<br>`+
    `<b>${t('used')}</b> ${usedM} m &nbsp;·&nbsp; <b>${t('free')}</b> ${freeM} m &nbsp;·&nbsp; ${esc(t('palCount',totalPal))}`+
    (fitTxt ? ` &nbsp;·&nbsp; ${esc(fitTxt)}` : "") + `</div>`+
    `<div class="psvg">${buildPrintSvg(layout)}</div>`+
    remarks +
    `<h2>${t('printOrders')}</h2>`+
    `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}
document.getElementById("btnPrint").addEventListener("click", ()=>{ buildPrintView(); window.print(); });

// Import aus JSON
const fileImport = document.getElementById("fileImport");
document.getElementById("btnImport").addEventListener("click", ()=> fileImport.click());
fileImport.addEventListener("change", e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data) ? data : data.orders;
      if(!Array.isArray(list)) throw new Error("Kein Auftrags-Array gefunden.");
      record();
      orders = list.map(d => makeOrder({
        auftragsnummer:d.auftragsnummer||"", kunde:d.kunde||"", lieferdatum:d.lieferdatum||"",
        destCode:d.destCode||"", anzahl:+d.anzahl||1,
        laenge:+d.laenge||1200, breite:+d.breite||800, hoehe:+d.hoehe||1200,
        ladeart:["optimiert","lang","breit"].includes(d.ladeart)?d.ladeart:"optimiert",
        reihenfolge:Math.max(1,Math.min(99,+d.reihenfolge||1)),
        stapelbar:!!d.stapelbar, aktiv:!!d.aktiv, bemerkung:d.bemerkung||"",
        ...(d.color ? {color:d.color} : {}),
      }));
      if(data.truck && TRUCKS[data.truck]){ currentTruck = data.truck; truckSel.value = currentTruck; }
      loadBemerkungen = (data && typeof data.bemerkungen==="string") ? data.bemerkungen : "";
      updateNoteBtn();
      renderAll();
      const noteHint = loadBemerkungen.trim() ? t('withRemarks') : "";
      notify("ok", t('imported', orders.length) + noteHint + ".", "", 4000);
    }catch(err){
      notify("warn", t('tImportFail'), String(err.message||err), 6000);
    }
  };
  reader.readAsText(file);
  fileImport.value = "";   // gleiche Datei erneut wählbar
});
// Reset: Zwei-Klick-Bestätigung direkt am Button (kein natives confirm)
const btnReset = document.getElementById("btnReset");
const resetLabel = document.getElementById("resetLabel");
let resetArmed = false, resetTimer = null;
function disarmReset(){
  resetArmed = false; clearTimeout(resetTimer);
  btnReset.classList.remove("armed"); resetLabel.textContent = t('resetLabel');
}
btnReset.addEventListener("click", ()=>{
  if(orders.length===0){ disarmReset(); return; }   // nichts zu löschen
  if(!resetArmed){
    resetArmed = true;
    btnReset.classList.add("armed");
    resetLabel.textContent = t('resetArmed');
    resetTimer = setTimeout(disarmReset, 4000);       // automatisch zurücksetzen
    return;
  }
  disarmReset();
  record();
  orders = []; colorIdx = 0; loadBemerkungen = ""; updateNoteBtn(); renderAll();
});
// Klick woanders entschärft den Reset wieder
document.addEventListener("click", e=>{ if(resetArmed && !btnReset.contains(e.target)) disarmReset(); });

// Liste: Eingaben (event delegation)
const list = document.getElementById("list");
let editRecorded = false;   // wurde diese Textfeld-Bearbeitung schon in der History gesichert?
list.addEventListener("input", e=>{
  const card = e.target.closest(".order"); if(!card) return;
  const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
  const f = e.target.dataset.f; if(!f) return;
  if(!editRecorded){ record(); editRecorded = true; }   // 1 Undo-Schritt pro Bearbeitung
  if(e.target.classList.contains("num") || f==="reihenfolge"){
    handleNumInput(e.target, o, f);
  } else {
    o[f] = e.target.value;
  }
  if(["laenge","breite","hoehe","anzahl","ladeart","reihenfolge"].includes(f)) recalc();
});
list.addEventListener("change", e=>{
  const card = e.target.closest(".order"); if(!card) return;
  const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
  const f = e.target.dataset.f;
  if(f==="stapelbar"){ record(); o.stapelbar = e.target.checked; recalc(); }
  else if(f==="aktiv"){ record(); o.aktiv = e.target.checked;
    if(hideInactive) renderList(); else card.classList.toggle("inactive",!o.aktiv);
    recalc(); }
  else if(f==="ladeart"){ record(); o.ladeart = e.target.value; renderList(); recalc(); }
});
list.addEventListener("click", e=>{
  const btn = e.target.closest("button[data-act]"); if(!btn) return;
  const card = e.target.closest(".order"); const o = orders.find(x=>x.id==card.dataset.id); if(!o) return;
  const act = btn.dataset.act;
  if(act==="del"){ record(); orders = orders.filter(x=>x.id!==o.id); renderAll(); }
  else if(act==="inc"){ record(); o.reihenfolge = Math.min(99,(+o.reihenfolge||0)+1); renderList(); recalc(); }
  else if(act==="dec"){ record(); o.reihenfolge = Math.max(1,(+o.reihenfolge||1)-1); renderList(); recalc(); }
});
// Sortierbare Spaltenköpfe
list.addEventListener("click", e=>{
  const h = e.target.closest("[data-sort]"); if(!h) return;
  sortOrders(h.dataset.sort);
});
// Paletten eines Auftrags in der Grafik aufblitzen lassen
function flashPallets(oid){
  document.querySelectorAll(`#truckSvg g.pal[data-oid="${oid}"]`).forEach(g=>{
    g.classList.remove("palflash");
    void g.getBoundingClientRect();   // Reflow -> Animation startet neu
    g.classList.add("palflash");
    setTimeout(()=> g.classList.remove("palflash"), 950);
  });
}
// Auslöser mit Dedupe (verhindert Doppel-Blitz aus Klick + Fokus derselben Interaktion)
let lastFlashOid = null, lastFlashT = 0;
function triggerFlash(oid){
  const now = performance.now();
  if(oid === lastFlashOid && now - lastFlashT < 150) return;
  lastFlashOid = oid; lastFlashT = now;
  flashPallets(oid);
}
// Tab -> Inhalt markieren; Fokus in eine Zeile -> deren Paletten aufblitzen
list.addEventListener("focusin", e=>{
  if(e.target.tagName==="INPUT" && e.target.type!=="checkbox"){ editRecorded = false; e.target.select(); }
  const card = e.target.closest(".order"); if(card) triggerFlash(card.dataset.id);
});
// Klick irgendwo in die Zeile (außer Buttons/Header) -> Paletten aufblitzen
list.addEventListener("click", e=>{
  if(e.target.closest("button[data-act]") || e.target.closest("[data-sort]")) return;
  const card = e.target.closest(".order"); if(card) triggerFlash(card.dataset.id);
});
// Klick auf das Farbquadrat -> Auftragsnummer in die Zwischenablage kopieren
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
  const nr = o.auftragsnummer || ("#"+o.id);
  copyText(nr).then(ok => notify(ok?"ok":"warn",
    ok ? t('copied', esc(nr)) : t('copyFail'), "", 2500));
});

function handleNumInput(input, o, f){
  if(f==="laenge"||f==="breite"||f==="hoehe"){
    // nur Ziffern + Komma; Punkt -> Komma
    let v = input.value.replace(/\./g,",").replace(/[^0-9,]/g,"");
    const parts = v.split(","); if(parts.length>2) v = parts[0]+","+parts.slice(1).join("");
    input.value = v;
    o[f] = parseFloat(v.replace(",","."))||0;
  } else if(f==="anzahl"){
    let v = input.value.replace(/[^0-9]/g,""); input.value=v;
    o.anzahl = parseInt(v,10)||0;
  } else if(f==="reihenfolge"){
    let v = input.value.replace(/[^0-9]/g,"");
    let n = parseInt(v,10); if(!Number.isFinite(n)) n=1; n=Math.max(1,Math.min(99,n));
    input.value = v===""?"":n; o.reihenfolge = n;
  }
}

/* ---- Zwischenablage ---- */
const modal = document.getElementById("modal");
const pasteArea = document.getElementById("pasteArea");
document.getElementById("btnPaste").addEventListener("click", async ()=>{
  try{
    const txt = await navigator.clipboard.readText();
    if(txt && txt.trim()){ importText(txt); return; }
  }catch(_){ /* Berechtigung verweigert -> Fallback-Dialog */ }
  pasteArea.value=""; modal.classList.add("open"); pasteArea.focus();
});
document.getElementById("pasteCancel").addEventListener("click", ()=>modal.classList.remove("open"));
document.getElementById("pasteOk").addEventListener("click", ()=>{ importText(pasteArea.value); modal.classList.remove("open"); });
modal.addEventListener("click", e=>{ if(e.target===modal) modal.classList.remove("open"); });

function importText(txt){
  const {orders:parsed, skipped} = parseClipboard(txt);
  if(parsed.length===0 && skipped.length===0){
    notify("warn", t('tNoValid'));
    return;
  }
  // Duplikate nach Auftragsnummer aussortieren (bereits vorhandene + innerhalb des Imports)
  const seen = new Set(orders.map(o => o.auftragsnummer).filter(Boolean));
  const toAdd = [], duplicates = [];
  for(const o of parsed){
    const nr = o.auftragsnummer;
    if(nr && seen.has(nr)){ duplicates.push(nr); }
    else { if(nr) seen.add(nr); toAdd.push(o); }
  }
  if(toAdd.length){
    const truck = TRUCKS[currentTruck];
    toAdd.forEach(o=>{ o.stapelbar = (2*o.hoehe <= truck.h); }); // Default Stapelbar
    record();
    orders.push(...toAdd);
    renderAll();
  }
  // Hinweise zusammenstellen
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
  notify(hasWarn ? "warn" : "ok", title, detail.trim(), 5000);  // nach 5 s automatisch ausblenden
}

// Toast-Hinweis: type ok|warn, html-Titel, optional Code-Vorschau, timeoutMs (0 = bleibt bis Schließen)
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

// Tastenkürzel Strg+Z (nicht in Textfeldern, dort gilt natives Undo)
document.addEventListener("keydown", e=>{
  if((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key.toLowerCase()==="z"){
    const t = e.target.tagName;
    if(t==="INPUT" || t==="TEXTAREA") return;   // natives Undo im Feld
    e.preventDefault(); undo();
  }
});

/* ============================ Start ============================ */
applyStatic();
updateNoteBtn();
renderAll();
