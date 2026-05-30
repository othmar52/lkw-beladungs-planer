/* ============================ Farbpalette ============================ */
const PALETTE = ["#2563eb","#16a34a","#d97706","#9333ea","#dc2626","#0891b2",
  "#ca8a04","#db2777","#4f46e5","#15803d","#b45309","#0d9488","#7c3aed","#e11d48"];
let colorIdx = 0;
const nextColor = () => PALETTE[(colorIdx++) % PALETTE.length];

/* ============================ Modell ============================ */
let uid = 1;
let orders = [];
let loadBemerkungen = "";   // ladungs-weite Bemerkungen (Export/Import + Notiz-Button)
let hideInactive = false;   // inaktive Aufträge in der Liste ausblenden

function makeOrder(data={}){
  return Object.assign({
    id: uid++,
    color: nextColor(),
    auftragsnummer:"", kunde:"", lieferdatum:"", destCode:"",
    anzahl:1, laenge:1200, breite:800, hoehe:1200,
    ladeart:"optimiert", reihenfolge:1,
    stapelbar:false, aktiv:false, bemerkung:"",
  }, data);
}

/* ============================ Undo-History ============================ */
let history = [];
const HISTORY_MAX = 200;
function snapshot(){ return JSON.stringify({orders, uid, colorIdx, currentTruck}); }
// vor jeder Änderung aufrufen: sichert den aktuellen Zustand
function record(){
  history.push(snapshot());
  if(history.length > HISTORY_MAX) history.shift();
  updateUndoBtn();
}
function undo(){
  if(!history.length) return;
  const s = JSON.parse(history.pop());
  orders = s.orders; uid = s.uid; colorIdx = s.colorIdx; currentTruck = s.currentTruck;
  const sel = document.getElementById("truckSel"); if(sel) sel.value = currentTruck;
  renderAll(); updateUndoBtn();
}
function updateUndoBtn(){
  const b = document.getElementById("btnUndo"); if(b) b.disabled = history.length===0;
}

/* ============================ Parsing Zwischenablage ============================ */
const DATE_RE = /^\d{2}\.\d{2}\.\d{2}$/;
// versucht eine Zeile zu einem Auftrag zu parsen; null wenn unvollständig
function parseLine(line){
  const t = line.split(/\s+/);
  if(t.length < 8) return null;
  const di = t.findIndex(x => DATE_RE.test(x));   // Datums-Anker
  if(di < 2) return null;                          // davor: Idx + JobNr (+Kunde)
  if(di + 4 >= t.length - 3) return null;          // Palettenanzahl muss vor L/B/H liegen
  const L = parseNum(t[t.length-3]), B = parseNum(t[t.length-2]), H = parseNum(t[t.length-1]);
  if([L,B,H].some(v => v==null || v<=0)) return null;   // L/B/H müssen gültige Zahlen sein
  const anzahl = parseInt(t[di+4],10);
  if(!Number.isFinite(anzahl) || anzahl <= 0) return null; // Palettenanzahl muss gültig sein
  return makeOrder({
    auftragsnummer: t[1].replace(/\*/g,""),        // * entfernen, C bleibt
    kunde: t.slice(2, di).join(" "),
    lieferdatum: t[di],
    destCode: t[di+1] || "",
    anzahl, laenge:L, breite:B, hoehe:H,
  });
}
function parseClipboard(text){
  const orders = [], skipped = [];
  for(const raw of text.split(/\r?\n/)){
    const line = raw.trim();
    if(!line) continue;
    const parsed = parseLine(line);
    if(parsed){ orders.push(parsed); }
    else if(/^\d+\s/.test(line)){ skipped.push(line); }  // sieht aus wie Datenzeile, aber unvollständig
    // andere Zeilen (Kopfzeilen/Müll) still ignorieren
  }
  return {orders, skipped};
}
function parseNum(s){
  if(s==null) return null;
  const v = parseFloat(String(s).replace(",","."));
  return Number.isFinite(v) ? v : null;
}
