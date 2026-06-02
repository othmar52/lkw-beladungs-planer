/* ============================ Loading algorithm ============================ */
// Top-down: X = truck length (front=left), Y = truck width.
// "long"  -> length along driving direction (X), width across (Y)
// "wide"  -> width along driving direction (X), length across (Y)
function orientations(o){
  return {
    lengthwise:  {fx:o.length, fy:o.width},
    crosswise: {fx:o.width, fy:o.length},
  };
}
function isStackable(o, truck){
  return o.stackable && (2*o.height <= truck.h);
}
// Possible row compositions across the truck width (long/wide mixed).
// For each pallet count: smallest depth and fullest (= widest) layout.
function rowCandidates(o, W){
  const lengthwise  = {fx:o.length, fy:o.width};   // long: length lengthwise, width across
  const crosswise = {fx:o.width, fy:o.length};   // wide: width lengthwise, length across
  const maxL = Math.floor(W / lengthwise.fy);
  const maxB = Math.floor(W / crosswise.fy);
  const best = {};   // count -> {depth, width, comp:[orientations]}
  for(let cl=0; cl<=maxL; cl++){
    for(let cb=0; cb<=maxB; cb++){
      if(cl+cb===0) continue;
      const width = cl*lengthwise.fy + cb*crosswise.fy;
      if(width > W + 0.01) continue;
      const depth = Math.max(cl>0?lengthwise.fx:0, cb>0?crosswise.fx:0);
      const c = cl+cb;
      const cur = best[c];
      // prefer smallest depth; on a tie the fullest row (more width used)
      if(!cur || depth < cur.depth-0.01 || (Math.abs(depth-cur.depth)<0.01 && width > cur.width+0.01)){
        const comp = [];
        for(let i=0;i<cl;i++) comp.push(lengthwise);
        for(let i=0;i<cb;i++) comp.push(crosswise);
        best[c] = {depth, width, comp, crosswiseN:cb};
      }
    }
  }
  if(Object.keys(best).length===0){   // pallet wider than truck -> 1 per row (oversize)
    best[1] = {depth:lengthwise.fx, width:lengthwise.fy, comp:[lengthwise], crosswiseN:0};
  }
  return best;
}
// Row plan for G slots. "optimized" minimises total depth via DP and
// mixes long/wide within a row so the width is fully used.
function planRows(o, W, G){
  if(G<=0) return [];
  if(o.loadMode==="long" || o.loadMode==="wide"){
    const ori = (o.loadMode==="long") ? {fx:o.length, fy:o.width} : {fx:o.width, fy:o.length};
    const per = Math.max(1, Math.floor(W / ori.fy));
    const rows = [];
    for(let left=G; left>0; left-=per){
      rows.push({depth:ori.fx, comp:Array(Math.min(per,left)).fill(ori)});
    }
    return rows;
  }
  // optimized: minimal total depth via DP; on a tie MAXIMISE wide
  const cand = rowCandidates(o, W);
  const counts = Object.keys(cand).map(Number).sort((a,b)=>a-b);
  const f = new Array(G+1).fill(Infinity), br = new Array(G+1).fill(0), choice = new Array(G+1).fill(0);
  f[0] = 0; br[0] = 0;
  for(let n=1; n<=G; n++){
    for(let i=counts.length-1; i>=0; i--){
      const c = counts[i];
      if(c>n) continue;
      const d = cand[c].depth + f[n-c];
      const b = cand[c].crosswiseN + br[n-c];
      if(d < f[n]-0.01 || (Math.abs(d-f[n])<0.01 && b > br[n])){ f[n]=d; br[n]=b; choice[n]=c; }
    }
  }
  const rows = [];
  for(let n=G; n>0; ){
    const c = choice[n] || counts[0];
    rows.push({depth:cand[c].depth, comp:cand[c].comp.slice()});
    n -= c;
  }
  const isBreit = ori => ori.fx===o.width && ori.fy===o.length;
  rows.sort((a,b)=> b.comp.filter(isBreit).length - a.comp.filter(isBreit).length);  // wide first, long last
  return rows;
}
// total depth (= load metres) of the cross-rows variant
function rowsLength(o, W, ground){
  return planRows(o, W, ground).reduce((s,r)=>s+r.depth, 0);
}
// --- Variant B: lengthwise lanes (columns). Tries all long/wide lane combinations
// and balances the pallets to minimise the longest lane (= load metres).
function lanesPlan(o, W, ground){
  const a = o.length, b = o.width;           // long lane: width b, length a per pallet
  const maxLengthwise = Math.floor(W / b), maxCrosswise = Math.floor(W / a);
  let best = null;
  for(let nl=0; nl<=maxLengthwise; nl++){
    for(let nb=0; nb<=maxCrosswise; nb++){
      if(nl+nb===0 || nl*b + nb*a > W + 0.01) continue;
      const lanes = [];
      for(let i=0;i<nl;i++) lanes.push({unit:a, width:b, count:0});  // long lane
      for(let i=0;i<nb;i++) lanes.push({unit:b, width:a, count:0});  // wide lane
      for(let k=0;k<ground;k++){                                     // balance pallets
        let bl = lanes[0];
        for(const ln of lanes) if((ln.count+1)*ln.unit < (bl.count+1)*bl.unit) bl = ln;
        bl.count++;
      }
      const length = Math.max(...lanes.map(l=>l.count*l.unit));
      if(!best || length < best.length-0.01 || (Math.abs(length-best.length)<0.01 && nb > best.nb))
        best = {lanes, length, nb};
    }
  }
  if(!best) best = {lanes:[{unit:a, width:b, count:ground}], length:ground*a, nb:0};  // oversize
  return best;
}
// --- "longwide": FORCED mix. Always combine some lengthwise + some crosswise lanes
// across the width (both orientations present), choosing the combination that fills the
// truck width fullest; ties broken by shortest load metres. Returns null if no genuine
// mix fits (then the caller falls back to optimized packing).
function mixLanesPlan(o, W, ground){
  if(ground < 2) return null;
  const a = o.length, b = o.width;
  const maxLengthwise = Math.floor(W / b), maxCrosswise = Math.floor(W / a);
  let best = null;
  for(let nl=1; nl<=maxLengthwise; nl++){
    for(let nb=1; nb<=maxCrosswise; nb++){
      const wsum = nl*b + nb*a;
      if(wsum > W + 0.01) continue;
      if(nl + nb > ground) continue;          // need enough pallets so BOTH orientations are used
      const lanes = [];
      for(let i=0;i<nl;i++) lanes.push({unit:a, width:b, count:0});  // lengthwise lane
      for(let i=0;i<nb;i++) lanes.push({unit:b, width:a, count:0});  // crosswise lane
      for(let k=0;k<ground;k++){                                     // balance pallets
        let bl = lanes[0];
        for(const ln of lanes) if((ln.count+1)*ln.unit < (bl.count+1)*bl.unit) bl = ln;
        bl.count++;
      }
      if(lanes.some(l=>l.count===0)) continue;                       // a lane stayed empty -> not a real mix
      const length = Math.max(...lanes.map(l=>l.count*l.unit));
      // primary: fullest width; tie: shortest load metres
      if(!best || wsum > best.wsum + 0.01 || (Math.abs(wsum-best.wsum)<0.01 && length < best.length-0.01))
        best = {lanes, length, wsum};
    }
  }
  return best;
}
// Best packing of an order -> strips.
//  mode "lanes": horizontal lanes (each can slide into gaps individually).
//  mode "rows":  cross-rows as a (rigid) block; also for fixed load mode long/wide.
function packGround(o, W, ground){
  if(ground<=0) return {mode:"none"};
  // forced mix (longwide): lengthwise + crosswise lanes side by side, balanced & interlocked.
  if(o.loadMode==="longwide"){
    const mp = mixLanesPlan(o, W, ground);
    if(mp){
      const strips = []; let y = 0;
      for(const ln of mp.lanes){
        if(ln.count===0) continue;
        const units = [];
        for(let k=0;k<ln.count;k++) units.push({w:ln.unit, h:ln.width});
        strips.push({y, h:ln.width, units});
        y += ln.width;
      }
      if(strips.length) return {mode:"lanes", strips};
    }
    // no genuine mix possible -> fall through to optimized packing
  }
  // fixed orientation (long/wide): build the LARGEST full rectangle in the requested orientation;
  // the overflow (pallets that don't complete a row) is rotated to the other orientation and laid
  // flat behind it — only when that is actually shorter. Lanes interlock with neighbours.
  if(o.loadMode==="long" || o.loadMode==="wide"){
    const wide = (o.loadMode==="wide");
    const reqAcross = wide ? o.length : o.width;    // across-truck size of requested orientation
    const reqDepth  = wide ? o.width  : o.length;   // depth (along truck) of requested orientation
    const rotAcross = wide ? o.width  : o.length;   // rotated pallet across-size
    const rotDepth  = wide ? o.length : o.width;    // rotated pallet depth
    const nLanes = Math.max(1, Math.floor(W / reqAcross));
    const fullRows = Math.floor(ground / nLanes);
    const rem = ground - fullRows * nLanes;
    const staircaseDepth = Math.ceil(ground / nLanes) * reqDepth;
    const rectRotDepth   = fullRows*reqDepth + (rem>0 ? rotDepth : 0);
    const rotFits = rem>0 && rem*rotAcross <= W + 0.01;
    const strips = [];
    if(fullRows>=1 && rotFits && rectRotDepth < staircaseDepth - 0.01){
      // full lang rectangle...
      for(let i=0;i<nLanes;i++){
        const units = []; for(let k=0;k<fullRows;k++) units.push({w:reqDepth, h:reqAcross});
        strips.push({y:i*reqAcross, h:reqAcross, units});
      }
      // ...overflow rotated, side by side, laid flat behind the rectangle
      for(let k=0;k<rem;k++) strips.push({y:k*rotAcross, h:rotAcross, units:[{w:rotDepth, h:rotAcross}]});
    } else {
      // no worthwhile overflow -> balanced lanes in the requested orientation
      const counts = new Array(nLanes).fill(0);
      for(let k=0; k<ground; k++){ let bi=0; for(let i=1;i<nLanes;i++) if((counts[i]+1)*reqDepth < (counts[bi]+1)*reqDepth) bi=i; counts[bi]++; }
      let y = 0;
      for(let i=0;i<nLanes;i++){
        if(counts[i]===0) continue;
        const units = []; for(let k=0;k<counts[i];k++) units.push({w:reqDepth, h:reqAcross});
        strips.push({y, h:reqAcross, units}); y += reqAcross;
      }
    }
    return {mode:"lanes", strips};
  }
  let rows = planRows(o, W, ground);
  if(o.loadMode!=="long" && o.loadMode!=="wide"){
    const rowsLen = rows.reduce((s,r)=>s+r.depth, 0);
    const isBreit = ori => ori.fx===o.width && ori.fy===o.length;
    const rowsBreit = rows.reduce((s,r)=> s + r.comp.filter(isBreit).length, 0);
    const lp = lanesPlan(o, W, ground);
    const lanesBreit = lp.lanes.reduce((s,l)=> s + (Math.abs(l.unit-o.width)<0.01 ? l.count : 0), 0);
    // shortest length wins; on a tie more wide; on a wide tie lanes (interlock better)
    let useLanes;
    if(lp.length < rowsLen - 0.01) useLanes = true;
    else if(rowsLen < lp.length - 0.01) useLanes = false;
    else useLanes = (lanesBreit >= rowsBreit);
    if(useLanes){
      const strips = []; let y = 0;
      for(const ln of lp.lanes){
        const units = [];
        for(let k=0;k<ln.count;k++) units.push({w:ln.unit, h:ln.width});
        strips.push({y, h:ln.width, units});
        y += ln.width;
      }
      return {mode:"lanes", strips};
    }
  }
  // rows mode (rigid block)
  const block = []; let x = 0;
  for(const row of rows){
    let y = 0;
    for(const ori of row.comp){ block.push({x, y, w:ori.fx, h:ori.fy}); y += ori.fy; }
    x += row.depth;
  }
  return {mode:"rows", block};
}
// load metres of a single order (loaded alone), rounded up to 0.1 m
function orderLoadMeters(o, truck){
  if(!(o.qty>0)) return 0;
  const stack = isStackable(o, truck);
  const ground = stack ? Math.ceil(o.qty/2) : o.qty;
  if(ground<=0) return 0;
  let len = rowsLength(o, truck.w, ground);
  if(o.loadMode==="longwide"){
    const mp = mixLanesPlan(o, truck.w, ground);
    if(mp) len = mp.length;
  } else if(o.loadMode!=="long" && o.loadMode!=="wide"){
    len = Math.min(len, lanesPlan(o, truck.w, ground).length);
  }
  return Math.ceil(len / 100) / 10;
}

// skyline (front line per width position) for block interlocking
function skyMax(sky, ya, yb){
  let m = 0;
  for(const s of sky) if(s.y1 > ya+0.01 && s.y0 < yb-0.01) m = Math.max(m, s.x);
  return m;
}
function skySet(sky, ya, yb, x){
  const out = [];
  for(const s of sky){
    if(s.y1 <= ya+0.01 || s.y0 >= yb-0.01){ out.push(s); continue; }
    if(s.y0 < ya-0.01) out.push({y0:s.y0, y1:ya, x:s.x});
    if(s.y1 > yb+0.01) out.push({y0:yb, y1:s.y1, x:s.x});
  }
  out.push({y0:ya, y1:yb, x});
  out.sort((a,b)=>a.y0-b.y0);
  return out;
}
function skyGlobalMax(sky){ let m = 0; for(const s of sky) m = Math.max(m, s.x); return m; }
// "free" gap fill: place individual pallets into existing recesses,
// without increasing the current total length (fills otherwise dead corners between orders).
function gapFill(sky, W, oris, maxN){
  const placed = []; const gMax = skyGlobalMax(sky);
  if(gMax<=0) return {placed, sky};
  let n = maxN;
  while(n>0){
    let best = null;
    const ys = new Set([0]); for(const s of sky){ ys.add(s.y0); ys.add(s.y1); }
    for(const ori of oris) for(const y of ys){
      if(y < -0.01 || y+ori.fy > W+0.01) continue;
      const x = skyMax(sky, y, y+ori.fy);
      if(x + ori.fx > gMax + 0.01) continue;          // must fit "for free" under the ceiling
      // priority: frontmost position (x), then shallowest depth (fx -> prefers wide), then more width (fy)
      if(!best
         || x < best.x - 0.01
         || (Math.abs(x-best.x)<0.01 && ori.fx < best.w - 0.01)
         || (Math.abs(x-best.x)<0.01 && Math.abs(ori.fx-best.w)<0.01 && ori.fy > best.h + 0.01))
        best = {x, y, w:ori.fx, h:ori.fy};
    }
    if(!best) break;
    placed.push(best);
    sky = skySet(sky, best.y, best.y+best.h, best.x+best.w);
    n--;
  }
  return {placed, sky};
}

// Places a FIXED order sequence sequentially on the skyline.
function layoutSequence(seq, truck){
  const W = truck.w;
  const placements = [];
  let sky = [{y0:0, y1:W, x:0}];            // front line, initially everywhere at front (x=0)
  for(const o of seq){
    const stack = isStackable(o, truck);
    let ground = stack ? Math.ceil(o.qty/2) : o.qty;
    if(ground<=0) continue;
    let left = o.qty;
    const sc = ()=>{ const s = stack ? Math.min(2, left) : 1; left -= s; return s; };
    const lengthwise = {fx:o.length, fy:o.width}, crosswise = {fx:o.width, fy:o.length};
    const oris = o.loadMode==="long" ? [lengthwise] : o.loadMode==="wide" ? [crosswise] : [lengthwise, crosswise];

    // 1) free gap fill into recesses of previous orders
    const gf = gapFill(sky, W, oris, ground);
    for(const p of gf.placed) placements.push({ x:p.x, y:p.y, w:p.w, h:p.h, color:o.color, order:o, stack:sc() });
    sky = gf.sky; ground -= gf.placed.length;
    if(ground<=0) continue;

    // 2) place the rest as an optimal package (lanes/rows), interlocked
    const pk = packGround(o, W, ground);
    if(pk.mode==="lanes"){
      for(const st of pk.strips){
        let cx = skyMax(sky, st.y, st.y+st.h);
        for(const u of st.units){
          placements.push({ x:cx, y:st.y, w:u.w, h:u.h, color:o.color, order:o, stack:sc() });
          cx += u.w;
        }
        sky = skySet(sky, st.y, st.y+st.h, cx);
      }
    } else if(pk.mode==="rows"){
      let shift = 0;
      for(const p of pk.block) shift = Math.max(shift, skyMax(sky, p.y, p.y+p.h) - p.x);
      for(const p of pk.block){
        const ax = shift + p.x;
        placements.push({ x:ax, y:p.y, w:p.w, h:p.h, color:o.color, order:o, stack:sc() });
        sky = skySet(sky, p.y, p.y+p.h, ax + p.w);
      }
    }
  }
  const usedLength = placements.reduce((m,p)=> Math.max(m, p.x+p.w), 0);
  return {placements, usedLength};
}
// Alternative: skyline best-fit, pallet by pallet. Each pallet is placed at the
// orientation/width-band that yields the SHORTEST resulting end (fills short lanes
// instead of extending the longest). Orders processed in sequence; later orders may
// still tuck into earlier recesses. Used as an extra candidate in computeLayout.
function layoutSequenceGreedy(seq, truck){
  const W = truck.w;
  const placements = [];
  let sky = [{y0:0, y1:W, x:0}];
  for(const o of seq){
    const stack = isStackable(o, truck);
    const ground = stack ? Math.ceil(o.qty/2) : o.qty;
    if(ground<=0) continue;
    let left = o.qty;
    const sc = ()=>{ const s = stack ? Math.min(2, left) : 1; left -= s; return s; };
    const lengthwise = {fx:o.length, fy:o.width}, crosswise = {fx:o.width, fy:o.length};
    const oris = o.loadMode==="long" ? [lengthwise] : o.loadMode==="wide" ? [crosswise] : [lengthwise, crosswise];
    // forced mix: place as a balanced lane package (per-pallet greedy would collapse to one orientation)
    if(o.loadMode==="longwide"){
      const pk = packGround(o, W, ground);
      if(pk.mode==="lanes"){
        for(const st of pk.strips){
          let cx = skyMax(sky, st.y, st.y+st.h);
          for(const u of st.units){
            placements.push({ x:cx, y:st.y, w:u.w, h:u.h, color:o.color, order:o, stack:sc() });
            cx += u.w;
          }
          sky = skySet(sky, st.y, st.y+st.h, cx);
        }
        continue;
      }
    }
    for(let k=0; k<ground; k++){
      const ys = new Set([0]); for(const s of sky){ ys.add(s.y0); ys.add(s.y1); }
      let best = null;
      for(const ori of oris) for(const y of ys){
        if(y < -0.01 || y+ori.fy > W+0.01) continue;
        const x = skyMax(sky, y, y+ori.fy), endx = x + ori.fx;
        // minimise end; tie -> frontmost; tie -> shallower (wide); tie -> fuller width
        if(!best
           || endx < best.endx-0.01
           || (Math.abs(endx-best.endx)<0.01 && x < best.x-0.01)
           || (Math.abs(endx-best.endx)<0.01 && Math.abs(x-best.x)<0.01 && ori.fx < best.fx-0.01)
           || (Math.abs(endx-best.endx)<0.01 && Math.abs(x-best.x)<0.01 && Math.abs(ori.fx-best.fx)<0.01 && ori.fy > best.fy+0.01))
          best = {x, y, fx:ori.fx, fy:ori.fy, endx};
      }
      if(!best) break;
      placements.push({ x:best.x, y:best.y, w:best.fx, h:best.fy, color:o.color, order:o, stack:sc() });
      sky = skySet(sky, best.y, best.y+best.fy, best.endx);
    }
  }
  const usedLength = placements.reduce((m,p)=> Math.max(m, p.x+p.w), 0);
  return {placements, usedLength};
}
// Orders with the SAME sequence may be reordered (spec). We try several
// orderings within each sequence group and take the shortest result.
function orderByGroups(active, cmp, truck){
  const groups = new Map();
  for(const o of active){ if(!groups.has(o.sequence)) groups.set(o.sequence, []); groups.get(o.sequence).push(o); }
  const out = [];
  for(const k of [...groups.keys()].sort((a,b)=>a-b)){
    const g = groups.get(k).slice();
    if(cmp) g.sort(cmp);
    out.push(...g);
  }
  return out;
}
// orders/truck default to the app globals; pass them explicitly for tests (see tests/run.mjs)
function computeLayout(ordersArg, truckArg){
  const truck = truckArg || TRUCKS[currentTruck];
  const L = truck.l;
  const active = (ordersArg || orders).filter(o => o.active && o.qty>0);
  active.sort((a,b)=> (a.sequence-b.sequence) || (a.id-b.id));

  const gnd = o => isStackable(o,truck) ? Math.ceil(o.qty/2) : o.qty;
  // candidate orderings (per sequence group); original (by id) always included -> never worse
  const cmps = [
    null,                                                  // original (id)
    (a,b)=> gnd(b)*b.length*b.width - gnd(a)*a.length*a.width, // largest area first
    (a,b)=> gnd(a)*a.length*a.width - gnd(b)*b.length*b.width, // smallest area first (small order fills the front step)
    (a,b)=> gnd(b) - gnd(a),                               // most slots first
    (a,b)=> gnd(a) - gnd(b),                               // fewest slots first
    (a,b)=> Math.max(b.length,b.width) - Math.max(a.length,a.width), // longest pallet first
    (a,b)=> b.width - a.width,                           // widest first
  ];
  // count of wide (crosswise) placements -> secondary objective ("prefer wide")
  const breitCount = pl => pl.reduce((s,p)=> s + (Math.abs(p.w - p.order.width) < 0.01 ? 1 : 0), 0);
  // evaluate an orientation assignment (order id -> forced loadMode) across all candidate orderings.
  // PRIMARY objective: shortest total length. SECONDARY (tie): most wide placements.
  function evalAssign(modeOf){
    const view = active.map(o => (modeOf[o.id] && modeOf[o.id]!==o.loadMode)
      ? Object.assign({}, o, {loadMode:modeOf[o.id]}) : o);
    let best = null;
    for(const cmp of cmps){
      const seq = orderByGroups(view, cmp, truck);
      for(const fn of [layoutSequence, layoutSequenceGreedy]){
        const r = fn(seq, truck);
        const breit = breitCount(r.placements);
        if(!best || r.usedLength < best.usedLength-0.01
           || (Math.abs(r.usedLength-best.usedLength)<0.01 && breit > best.breit))
          best = {usedLength:r.usedLength, breit, placements:r.placements};
      }
    }
    return best;
  }
  const better = (a,b)=> a.usedLength < b.usedLength-0.01
    || (Math.abs(a.usedLength-b.usedLength)<0.01 && a.breit > b.breit);

  // Orientation search (hill-climbing). Two rules:
  //  - "optimized" orders: free to try long/wide/auto, adopt on any shortening (tie -> more wide).
  //  - fixed "long"/"wide" orders: the requested orientation is a PREFERENCE, not absolute — it may be
  //    relaxed to free orientation, but only when that shortens the TOTAL load significantly (>= RELAX_MM),
  //    e.g. so following orders pack tighter. Small gains keep the requested orientation.
  // optimized orders may flip long/wide to shorten the load (tie -> more wide). Fixed long/wide
  // orders keep their orientation; their unavoidable overflow is rotated inside packGround (see above).
  const flippable = active.filter(o=> o.loadMode==="optimized").map(o=>o.id);
  const modeOf = {};
  let cur = evalAssign(modeOf);
  if(flippable.length && active.length <= 16){
    let improved = true, guard = 0;
    while(improved && guard++ < 8){
      improved = false;
      for(const id of flippable){
        const save = modeOf[id];
        for(const m of [undefined, "long", "wide"]){
          if(m===save) continue;
          modeOf[id] = m;
          const cand = evalAssign(modeOf);
          if(better(cand, cur)){ cur = cand; improved = true; } else modeOf[id] = save;
        }
      }
    }
  }
  const placements = cur ? cur.placements : [];
  const usedLength = cur ? cur.usedLength : 0;
  placements.forEach(p => p.overflow = (p.x + p.w) > L + 0.01);
  const fits = usedLength <= L + 0.01;
  return {placements, usedLength, fits, truck};
}
