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
  return Object.assign({ id: loadSeq++, name:"", truck: currentTruck, note:"", assign:{}, modeOf:{} }, data);
}
// effective load type of order o ON a given load: a per-load override wins, else DEFAULT = "optimized".
// (Each load defaults to "optimized" independently — even the same order split across loads.)
function loadModeFor(load, o){ return (load && load.modeOf && load.modeOf[o.id]) || "optimized"; }
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
  for(const o of orders){ const n = load.assign[o.id]|0; if(n>0) out.push(Object.assign({}, o, {qty:n, active:true, loadMode:loadModeFor(load,o)})); }
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
/* ============================ Auto loads (NUTS-2 distance grouping) ============================ */
// NUTS-2 region centroids [lat,lon] for AT + neighbours (approx; enough for "nearest dest" grouping)
const NUTS2 = {
  AT11:[47.55,16.40],AT12:[48.30,15.75],AT13:[48.21,16.37],AT21:[46.72,13.85],AT22:[47.20,15.10],
  AT31:[48.15,13.90],AT32:[47.45,13.20],AT33:[47.15,11.30],AT34:[47.25,9.90],
  DE11:[48.70,9.30],DE12:[49.00,8.40],DE13:[47.90,8.00],DE14:[48.20,9.40],DE21:[47.95,11.80],DE22:[48.70,12.90],
  DE23:[49.35,12.10],DE24:[50.05,11.30],DE25:[49.30,10.80],DE26:[49.95,9.95],DE27:[48.20,10.40],DE30:[52.52,13.40],
  DE40:[52.40,13.00],DE50:[53.10,8.80],DE60:[53.55,10.00],DE71:[49.90,8.70],DE72:[50.60,8.70],DE73:[51.10,9.50],
  DE80:[53.60,12.70],DE91:[52.20,10.50],DE92:[52.40,9.70],DE93:[53.10,10.40],DE94:[52.80,8.00],DEA1:[51.20,6.80],
  DEA2:[50.90,6.90],DEA3:[51.95,7.60],DEA4:[51.90,8.80],DEA5:[51.40,8.00],DEB1:[50.35,7.60],DEB2:[49.80,6.70],
  DEB3:[49.50,8.10],DEC0:[49.40,7.00],DED2:[51.05,13.70],DED4:[50.75,12.90],DED5:[51.30,12.40],DEE0:[51.95,11.60],
  DEF0:[54.20,9.70],DEG0:[50.90,11.00],
  CZ01:[50.08,14.44],CZ02:[49.95,14.60],CZ03:[49.20,13.90],CZ04:[50.45,13.40],CZ05:[50.35,15.80],CZ06:[49.10,16.60],
  CZ07:[49.60,17.25],CZ08:[49.80,18.25],
  SK01:[48.15,17.10],SK02:[48.40,18.00],SK03:[48.80,19.40],SK04:[48.90,21.40],
  HU11:[47.50,19.05],HU12:[47.50,19.30],HU21:[47.10,18.20],HU22:[47.20,16.90],HU23:[46.20,18.10],
  HU31:[48.10,20.30],HU32:[47.50,21.60],HU33:[46.50,20.30],
  SI03:[46.40,15.30],SI04:[46.05,14.40],
  CH01:[46.40,6.60],CH02:[47.00,7.50],CH03:[47.50,7.80],CH04:[47.40,8.60],CH05:[47.40,9.30],CH06:[47.00,8.40],CH07:[46.30,8.90],
  ITC1:[45.05,7.90],ITC2:[45.74,7.40],ITC3:[44.40,8.80],ITC4:[45.55,9.70],ITH1:[46.70,11.40],ITH2:[46.10,11.10],
  ITH3:[45.55,11.90],ITH4:[46.10,13.10],ITH5:[44.60,11.00],ITI1:[43.40,11.10],ITI4:[41.90,12.70],
  PL21:[49.90,20.00],PL22:[50.25,18.90],PL51:[51.00,16.80],PL52:[50.65,17.90],PL61:[53.00,18.50],PL71:[51.60,19.40],PL9:[52.20,21.00],
};
// rough distance (km) between two NUTS-2 dest codes; fallback when a code is unknown
function destDist(a, b){
  if(!a || !b) return 9999;
  if(a===b) return 0;
  const A = NUTS2[a], B = NUTS2[b];
  if(A && B){
    const R=6371, d2r=Math.PI/180;
    const dLat=(B[0]-A[0])*d2r, dLon=(B[1]-A[1])*d2r;
    const h=Math.sin(dLat/2)**2 + Math.cos(A[0]*d2r)*Math.cos(B[0]*d2r)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }
  if(a.slice(0,2)===b.slice(0,2)) return 80 + Math.abs((parseInt(a.slice(2))||0)-(parseInt(b.slice(2))||0))*15;
  return 9999;
}
// auto-distribute all OPEN pallets into loads. opts: {sameDate, groupDest, fillExisting}
function autoCreateLoads(opts){
  const tn = activeLoad().truck;
  const open = {}; orders.forEach(o=>{ const q=openQty(o); if(q>0) open[o.id]=q; });
  const hasOpen = ()=> Object.values(open).some(v=>v>0);
  const put = (L,o,k)=>{ if(k>0){ L.assign[o.id]=(L.assign[o.id]|0)+k; open[o.id]-=k; } };
  const ADJ_KM = 200;   // "adjacent" destinations = NUTS-2 centroids within this distance
  const loadDate = L=>{ for(const o of orders) if((L.assign[o.id]|0)>0 && o.deliveryDate) return o.deliveryDate; return null; };
  const loadCustomer = L=>{ for(const o of orders) if((L.assign[o.id]|0)>0 && o.customer) return o.customer; return null; };
  const loadDests = L=>{ const s=[]; for(const o of orders) if((L.assign[o.id]|0)>0 && o.destCode) s.push(o.destCode); return s; };
  const loadRemark = L=>{ for(const o of orders) if((L.assign[o.id]|0)>0) return (o.remark||"").trim(); return ""; };
  const compatible = (L,o)=>{
    if(opts.sameDate){ const d=loadDate(L); if(d && o.deliveryDate && o.deliveryDate!==d) return false; }
    if(opts.sameCustomer){ const c=loadCustomer(L); if(c && o.customer && o.customer!==c) return false; }
    if(opts.adjacentOnly){ const ds=loadDests(L);
      if(ds.length && o.destCode && !ds.includes(o.destCode)){
        let m=Infinity; for(const d of ds) m=Math.min(m, destDist(o.destCode,d));
        if(m>ADJ_KM) return false;
      } }
    return true;
  };
  const pickFor = L=>{
    const cands = orders.filter(o=> open[o.id]>0 && compatible(L,o) && fitCount(L,o,open[o.id])>0);
    if(!cands.length) return null;
    // prefer orders with the SAME customer AND remark as what is already on the load (better grouping)
    const lc = loadCustomer(L), lr = loadRemark(L);
    const cr = o=> (lc && (o.customer||"")===lc && (o.remark||"").trim()===lr) ? 0 : 1;
    if(opts.groupDest){
      const dests = loadDests(L);
      const score = o=>{ if(!dests.length) return 0; if(dests.includes(o.destCode)) return 0;
        let m=Infinity; for(const d of dests) m=Math.min(m, destDist(o.destCode,d)); return m; };
      cands.sort((a,b)=> cr(a)-cr(b) || score(a)-score(b) || open[b.id]-open[a.id]);
    } else cands.sort((a,b)=> cr(a)-cr(b) || open[b.id]-open[a.id]);
    return cands[0];
  };
  const fillLoad = L=>{ let g=0; while(g++<999){ const o=pickFor(L); if(!o) break; const k=fitCount(L,o,open[o.id]); if(k<=0) break; put(L,o,k); } };
  const palCount = L => Object.values(L.assign).reduce((s,v)=>s+(v|0),0);
  const before = new Map(loads.map(l=>[l.id, palCount(l)]));   // remember fill level before auto
  if(opts.fillExisting) for(const L of loads.slice()) fillLoad(L);
  let created=0, g=0; const newIds=[];
  while(hasOpen() && g++<999){
    const L = makeLoad({ truck:tn });
    fillLoad(L);
    if(!Object.keys(L.assign).length) break;   // nothing fits (oversize remainder) -> stop
    loads.push(L); created++; newIds.push(L.id);
  }
  // name every UNNAMED, non-empty load by its (distinct) customer names, e.g. "Test1/Test2"
  // (user-given names are left untouched)
  for(const L of loads){ if((!L.name || !L.name.trim()) && Object.values(L.assign).some(v=>v>0)) L.name = autoLoadName(L); }
  reorderLoadsBySharedOrders();   // cluster loads that share an order next to each other
  // every load that GAINED pallets this run (newly created OR a pre-existing one that got filled)
  const presentIds = loads.filter(l=> palCount(l) > (before.get(l.id)||0)).map(l=>l.id);
  return { created, leftover: Object.values(open).reduce((s,v)=>s+Math.max(0,v),0), newIds, presentIds };
}
// combined customer names of all orders on a load (distinct, "/"-joined) -> used as the load name
function autoLoadName(L){
  const names = [];
  for(const o of orders){ if((L.assign[o.id]|0)>0){ const c=(o.customer||"").trim(); if(c && !names.includes(c)) names.push(c); } }
  return names.join("/");
}
// reorder the loads array so loads sharing orders sit next to each other (greedy: most shared first)
function reorderLoadsBySharedOrders(){
  if(loads.length < 3) return;
  const setOf = L => new Set(Object.keys(L.assign).filter(k=> (L.assign[k]|0)>0));
  const sets = new Map(loads.map(l=>[l.id, setOf(l)]));
  const shared = (a,b)=>{ let n=0; for(const k of sets.get(a.id)) if(sets.get(b.id).has(k)) n++; return n; };
  const rest = loads.slice(), out = [rest.shift()];
  while(rest.length){
    const last = out[out.length-1];
    let bi=0, best=-1;
    for(let i=0;i<rest.length;i++){ const s=shared(last, rest[i]); if(s>best){ best=s; bi=i; } }
    out.push(rest.splice(bi,1)[0]);
  }
  loads = out;
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
    orderNo:"", customer:"", deliveryDate:"", destCode:"", customerNo:"", address:"",
    qty:1, length:1200, width:800, height:1200,
    loadMode:"optimized", sequence:1,
    stackable:false, active:false, remark:"",
  }, data);
}

/* ============================ Undo / redo history ============================ */
let undoStack = [];
let redoStack = [];
// max remembered undo steps — configurable in the global settings dialog (settings.historyMax)
function historyMax(){ const n = settings && +settings.historyMax; return (n>=1 && n<=999) ? n : 200; }
// serialise / restore a hand-layout pallet array (orders referenced by id)
const palToData = arr => arr.map(p=>({pid:p.pid, oid:p.order.id, color:p.color, w:p.w, h:p.h, x:p.x, y:p.y, stack:p.stack}));
const palFromData = arr => arr.map(p=>({ pid:p.pid, order: orders.find(o=>o.id===p.oid) || orders[0],
  color:p.color, w:p.w, h:p.h, x:p.x, y:p.y, stack:p.stack }));
// full app state — extend here when new persistent state is added (keeps undo/redo + localStorage complete)
function captureState(){
  return JSON.stringify({
    orders, uid, colorIdx, currentTruck, loadNote, loadName,
    loads, activeLoadId, loadSeq,
    manualMode: (typeof manualMode!=="undefined" && manualMode),
    manualPallets: (typeof manualPallets!=="undefined" && manualPallets) ? palToData(manualPallets) : null,
    manualByLoad: (typeof manualByLoad!=="undefined") ? Object.fromEntries(Object.entries(manualByLoad).map(([k,a])=>[k, palToData(a)])) : null,
    manualOnByLoad: (typeof manualOnByLoad!=="undefined") ? Object.assign({}, manualOnByLoad) : null,
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
    manualPallets = d.manualPallets ? palFromData(d.manualPallets) : null;
  }
  if(typeof manualByLoad!=="undefined"){
    for(const k in manualByLoad) delete manualByLoad[k];
    if(d.manualByLoad) for(const [k,a] of Object.entries(d.manualByLoad)) manualByLoad[k] = palFromData(a);
  }
  if(typeof manualOnByLoad!=="undefined"){
    for(const k in manualOnByLoad) delete manualOnByLoad[k];
    if(d.manualOnByLoad) Object.assign(manualOnByLoad, d.manualOnByLoad);
  }
}
// ---- persist the whole working state to localStorage and restore it on reload ----
const STATE_KEY = "lkwPlaner.state";
let stateLoading = false;   // guard: don't re-save while restoring
function saveState(){ if(stateLoading) return; try{ localStorage.setItem(STATE_KEY, captureState()); }catch(_){} }
let _saveT = null;   // debounced save for high-frequency edits (typing in text fields)
function saveStateSoon(){ if(stateLoading) return; if(_saveT) clearTimeout(_saveT); _saveT = setTimeout(()=>{ _saveT=null; saveState(); }, 400); }
function loadState(){
  let s; try{ s = localStorage.getItem(STATE_KEY); }catch(_){ s = null; }
  if(!s) return false;
  stateLoading = true;
  try{ applyState(s); } catch(_){ stateLoading=false; return false; }
  stateLoading = false;
  return true;
}
// history entries are { snap, label }. label = name of the action that this snapshot precedes.
// push a pre-change snapshot onto the undo stack (clears the redo chain)
function pushUndo(entry){
  undoStack.push(typeof entry==="string" ? {snap:entry, label:""} : entry);
  while(undoStack.length > historyMax()) undoStack.shift();
  redoStack = [];
  updateUndoBtn();
}
// trim the stacks when the limit was lowered in the settings
function trimHistory(){ while(undoStack.length > historyMax()) undoStack.shift(); while(redoStack.length > historyMax()) redoStack.shift(); updateUndoBtn(); }
// call before each change: saves the current state + a human label of the action
function record(label){ pushUndo({ snap: captureState(), label: label || (typeof t==="function" ? t('hist_change') : "") }); }
function undo(){
  if(!undoStack.length) return;
  const e = undoStack.pop();
  redoStack.push({ snap: captureState(), label: e.label });   // redo re-applies the same action
  applyState(e.snap);
  afterHistoryRestore();
}
function redo(){
  if(!redoStack.length) return;
  const e = redoStack.pop();
  undoStack.push({ snap: captureState(), label: e.label });
  applyState(e.snap);
  afterHistoryRestore();
}
// jump several steps at once (clicked in the Verlauf view)
function jumpHistory(kind, steps){
  for(let i=0;i<steps;i++){ if(kind==="undo") undo(); else redo(); }
}
// the COMPLETE undo/redo history for the Verlauf view (scrollable). u[0]=most recent undo (1 step),
// r[0]=next redo (1 step). The view itself scrolls, so we list everything that is still in the stacks.
function historyView(){
  const u = [], r = [];
  for(let i=undoStack.length-1; i>=0; i--) u.push({ label: undoStack[i].label, steps: undoStack.length - i });
  for(let j=redoStack.length-1; j>=0; j--) r.push({ label: redoStack[j].label, steps: redoStack.length - j });
  return { u, r };
}
// re-sync all UI that lives outside the list/graphic after an undo/redo
function afterHistoryRestore(){
  syncActiveLoadMirror();   // pull active load -> mirror globals + truck/name/note inputs
  if(typeof syncActiveManualState==="function") syncActiveManualState();   // keep per-load hand state in sync
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
