/* ============================ Colour palette ============================ */
const PALETTE = ["#2563eb","#16a34a","#d97706","#9333ea","#dc2626","#0891b2",
  "#ca8a04","#db2777","#4f46e5","#15803d","#b45309","#0d9488","#7c3aed","#e11d48"];
let colorIdx = 0;
const nextColor = () => PALETTE[(colorIdx++) % PALETTE.length];

/* ============================ Model ============================ */
let uid = 1;
let orders = [];
let loadNote = "";   // load-wide remarks — MIRROR of the active load's note (kept for the existing code paths)
let loadName = "";   // load name — MIRROR of the active load's name (toolbar field + export prefix)
let hideInactive = false;   // hide orders not on the active load
let filterText = "";        // text filter for the order list (lower-cased)

/* ============================ Loads (multiple trucks in parallel) ============================
   One shared `orders[]` pool; each load assigns a pallet quantity per order (`assign[orderId]`),
   so a single order can be split across loads. Each load has its own truck/name/note.
   `currentTruck`, `loadName`, `loadNote` are kept as live MIRRORS of the active load so the
   existing single-load code paths (which read those globals) keep working unchanged. */
let loads = [];
let activeLoadId = null;
let loadSeq = 1;
function makeLoad(data={}){
  return Object.assign({ id: loadSeq++, name:"", truck: currentTruck, note:"", assign:{} }, data);
}
function activeLoad(){ return loads.find(l=>l.id===activeLoadId) || loads[0]; }
function ensureLoads(){ if(!loads.length){ loads = [makeLoad()]; activeLoadId = loads[0].id; } }
ensureLoads();
const assignedOn = (load, o) => load.assign[o.id]|0;            // pallets of o on a given load
const onActive   = o => assignedOn(activeLoad(), o) > 0;        // is o on the active load?
function assignedTotal(o){ let s=0; for(const l of loads) s += (l.assign[o.id]|0); return s; }
function otherLoadsQty(o){ let s=0; for(const l of loads) if(l.id!==activeLoadId) s += (l.assign[o.id]|0); return s; }
const openQty = o => Math.max(0, (o.qty|0) - assignedTotal(o));  // pallets not yet on any load
// max that may go on the active load = total minus what other loads already hold
const assignCap = o => Math.max(0, (o.qty|0) - otherLoadsQty(o));
// virtual orders for one load (clone of the pool order, qty = assigned on that load, active)
function loadOrders(load){
  const out = [];
  for(const o of orders){ const n = load.assign[o.id]|0; if(n>0) out.push(Object.assign({}, o, {qty:n, active:true})); }
  return out;
}
// layout of the active load with its own truck (computeLayout stays parametrised → tests unaffected)
function currentLayout(){
  const L = activeLoad();
  return computeLayout(loadOrders(L), TRUCKS[L.truck] || TRUCKS[currentTruck]);
}
// largest count of o's available pallets that still fits the active load's truck length
// (binary search — usedLength is monotonic in the order's qty). Returns 0 if none fit.
function maxFitOnActive(o){
  const L = activeLoad();
  const truck = TRUCKS[L.truck] || TRUCKS[currentTruck];
  const cap = assignCap(o);
  if(cap<=0 || !truck) return 0;
  const saved = L.assign[o.id];
  const fits = k => {
    if(k>0) L.assign[o.id] = k; else delete L.assign[o.id];
    return computeLayout(loadOrders(L), truck).usedLength <= truck.l + 1;
  };
  let lo=1, hi=cap, best=0;
  while(lo<=hi){ const mid=(lo+hi)>>1; if(fits(mid)){ best=mid; lo=mid+1; } else hi=mid-1; }
  if(saved!=null) L.assign[o.id] = saved; else delete L.assign[o.id];   // restore
  return best;
}
// how many MORE pallets of o fit on a given load (beyond what it already holds), capped at `avail`.
// Binary search; mutates+restores load.assign. Used to spread an order across freshly created loads.
function fitCount(load, o, avail){
  const truck = TRUCKS[load.truck] || TRUCKS[currentTruck];
  if(!truck || avail<=0) return 0;
  const base = load.assign[o.id]|0, saved = load.assign[o.id];
  const fits = k => {
    if(k>0) load.assign[o.id] = k; else delete load.assign[o.id];
    return computeLayout(loadOrders(load), truck).usedLength <= truck.l + 1;
  };
  let lo=base+1, hi=base+avail, best=base;
  while(lo<=hi){ const mid=(lo+hi)>>1; if(fits(mid)){ best=mid; lo=mid+1; } else hi=mid-1; }
  if(saved!=null) load.assign[o.id] = saved; else delete load.assign[o.id];
  return best - base;
}
// how many fresh loads of `truckName` are needed to take `remaining` pallets of o (each load filled
// by fitCount on an empty truck). Returns {loads, leftover} (leftover>0 => pallet oversize for the type).
function loadsNeeded(o, remaining, truckName){
  let rem = remaining|0, n = 0, guard = 0;
  const tmp = { truck: truckName, assign:{} };
  while(rem>0 && guard++ < 99){
    tmp.assign = {};
    const fit = fitCount(tmp, o, rem);
    if(fit<=0) break;
    rem -= fit; n++;
  }
  return { loads:n, leftover:rem };
}
// pull the active load's fields into the mirror globals + sync the inputs that show them
function syncActiveLoadMirror(){
  const l = activeLoad(); if(!l) return;
  if(TRUCKS[l.truck]) currentTruck = l.truck;
  loadName = l.name; loadNote = l.note;
  const sel = document.getElementById("truckSel"); if(sel) sel.value = currentTruck;
  if(typeof syncLoadNameInput==="function") syncLoadNameInput();
  if(typeof updateNoteBtn==="function") updateNoteBtn();
}

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

/* ============================ Undo / redo history ============================ */
let undoStack = [];
let redoStack = [];
const HISTORY_MAX = 200;
// full app state — extend here when new persistent state is added (keeps undo/redo complete)
function captureState(){
  return JSON.stringify({
    orders, uid, colorIdx, currentTruck, loadNote, loadName,
    loads, activeLoadId, loadSeq,
    manualMode: (typeof manualMode!=="undefined" && manualMode),
    manualPallets: (typeof manualPallets!=="undefined" && manualPallets)
      ? manualPallets.map(p=>({pid:p.pid, oid:p.order.id, color:p.color, w:p.w, h:p.h, x:p.x, y:p.y, stack:p.stack}))
      : null,
  });
}
function applyState(s){
  const d = JSON.parse(s);
  orders = d.orders; uid = d.uid; colorIdx = d.colorIdx; currentTruck = d.currentTruck;
  loadNote = d.loadNote ?? ""; loadName = d.loadName ?? "";
  if(Array.isArray(d.loads)){ loads = d.loads; activeLoadId = d.activeLoadId; loadSeq = d.loadSeq || (loadSeq); }
  ensureLoads();
  if(!loads.some(l=>l.id===activeLoadId)) activeLoadId = loads[0].id;
  if(typeof manualMode!=="undefined"){
    manualMode = !!d.manualMode;
    manualPallets = d.manualPallets
      ? d.manualPallets.map(p=>({ pid:p.pid, order: orders.find(o=>o.id===p.oid) || orders[0],
          color:p.color, w:p.w, h:p.h, x:p.x, y:p.y, stack:p.stack }))
      : null;
  }
}
// push a pre-change snapshot onto the undo stack (clears the redo chain)
function pushUndo(snap){
  undoStack.push(snap);
  if(undoStack.length > HISTORY_MAX) undoStack.shift();
  redoStack = [];
  updateUndoBtn();
}
// call before each change: saves the current state
function record(){ pushUndo(captureState()); }
function undo(){
  if(!undoStack.length) return;
  redoStack.push(captureState());
  applyState(undoStack.pop());
  afterHistoryRestore();
}
function redo(){
  if(!redoStack.length) return;
  undoStack.push(captureState());
  applyState(redoStack.pop());
  afterHistoryRestore();
}
// re-sync all UI that lives outside the list/graphic after an undo/redo
function afterHistoryRestore(){
  syncActiveLoadMirror();   // pull active load -> mirror globals + truck/name/note inputs
  if(typeof syncManualUI==="function") syncManualUI();
  if(typeof syncSearchInput==="function") syncSearchInput();
  if(typeof renderTabs==="function") renderTabs();
  renderAll(); updateUndoBtn();
}
function updateUndoBtn(){
  const b = document.getElementById("btnUndo"); if(b) b.disabled = undoStack.length===0;
  const r = document.getElementById("btnRedo"); if(r) r.disabled = redoStack.length===0;
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
