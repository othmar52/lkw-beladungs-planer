/* ============================ Colour palette ============================ */
const PALETTE = ["#2563eb","#16a34a","#d97706","#9333ea","#dc2626","#0891b2",
  "#ca8a04","#db2777","#4f46e5","#15803d","#b45309","#0d9488","#7c3aed","#e11d48"];
let colorIdx = 0;
const nextColor = () => PALETTE[(colorIdx++) % PALETTE.length];

/* ============================ Model ============================ */
let uid = 1;
let orders = [];
let loadNote = "";   // load-wide remarks (export/import + note button)
let hideInactive = false;   // hide inactive orders in the list
let filterText = "";        // text filter for the order list (lower-cased)

function makeOrder(data={}){
  return Object.assign({
    id: uid++,
    color: nextColor(),
    orderNo:"", customer:"", deliveryDate:"", destCode:"",
    qty:1, length:1200, width:800, height:1200,
    loadMode:"optimized", sequence:1,
    stackable:false, active:false, remark:"",
  }, data);
}

/* ============================ Undo history ============================ */
let history = [];
const HISTORY_MAX = 200;
function snapshot(){ return JSON.stringify({orders, uid, colorIdx, currentTruck}); }
// call before each change: saves the current state
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

/* ============================ Clipboard parsing ============================ */
const DATE_RE = /^\d{2}\.\d{2}\.\d{2}$/;
// tries to parse a line into an order; null if incomplete
function parseLine(line){
  const t = line.split(/\s+/);
  if(t.length < 8) return null;
  const di = t.findIndex(x => DATE_RE.test(x));   // date anchor
  if(di < 2) return null;                          // before it: idx + job no. (+customer)
  if(di + 4 >= t.length - 3) return null;          // pallet count must come before L/W/H
  const L = parseNum(t[t.length-3]), B = parseNum(t[t.length-2]), H = parseNum(t[t.length-1]);
  if([L,B,H].some(v => v==null || v<=0)) return null;   // L/W/H must be valid numbers
  const qty = parseInt(t[di+4],10);
  if(!Number.isFinite(qty) || qty <= 0) return null; // pallet count must be valid
  return makeOrder({
    orderNo: t[1].replace(/\*/g,""),        // strip *, keep C
    customer: t.slice(2, di).join(" "),
    deliveryDate: t[di],
    destCode: t[di+1] || "",
    qty, length:L, width:B, height:H,
  });
}
function parseClipboard(text){
  const orders = [], skipped = [];
  for(const raw of text.split(/\r?\n/)){
    const line = raw.trim();
    if(!line) continue;
    const parsed = parseLine(line);
    if(parsed){ orders.push(parsed); }
    else if(/^\d+\s/.test(line)){ skipped.push(line); }  // looks like a data line but is incomplete
    // silently ignore other lines (headers/junk)
  }
  return {orders, skipped};
}
function parseNum(s){
  if(s==null) return null;
  const v = parseFloat(String(s).replace(",","."));
  return Number.isFinite(v) ? v : null;
}
