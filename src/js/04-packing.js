/* ============================ Beladungs-Algorithmus ============================ */
// Topdown: X = LKW-Länge (vorne=links), Y = LKW-Breite.
// "lang"  -> Länge zeigt in Fahrtrichtung (X), Breite quer (Y)
// "breit" -> Breite zeigt in Fahrtrichtung (X), Länge quer (Y)
function orientations(o){
  return {
    lang:  {fx:o.laenge, fy:o.breite},
    breit: {fx:o.breite, fy:o.laenge},
  };
}
function isStackable(o, truck){
  return o.stapelbar && (2*o.hoehe <= truck.h);
}
// Mögliche Reihen-Zusammensetzungen über die LKW-Breite (lang/breit gemischt).
// Liefert je Palettenzahl die geringste Tiefe und die vollste (= breiteste) Belegung.
function rowCandidates(o, W){
  const lang  = {fx:o.laenge, fy:o.breite};   // lang:  Länge längs, Breite quer
  const breit = {fx:o.breite, fy:o.laenge};   // breit: Breite längs, Länge quer
  const maxL = Math.floor(W / lang.fy);
  const maxB = Math.floor(W / breit.fy);
  const best = {};   // count -> {depth, width, comp:[orientierungen]}
  for(let cl=0; cl<=maxL; cl++){
    for(let cb=0; cb<=maxB; cb++){
      if(cl+cb===0) continue;
      const width = cl*lang.fy + cb*breit.fy;
      if(width > W + 0.01) continue;
      const depth = Math.max(cl>0?lang.fx:0, cb>0?breit.fx:0);
      const c = cl+cb;
      const cur = best[c];
      // bevorzuge geringste Tiefe; bei Gleichstand die vollste Reihe (mehr Breite genutzt)
      if(!cur || depth < cur.depth-0.01 || (Math.abs(depth-cur.depth)<0.01 && width > cur.width+0.01)){
        const comp = [];
        for(let i=0;i<cl;i++) comp.push(lang);
        for(let i=0;i<cb;i++) comp.push(breit);
        best[c] = {depth, width, comp, breitN:cb};
      }
    }
  }
  if(Object.keys(best).length===0){   // Palette breiter als LKW -> 1 Stück (Überbreite)
    best[1] = {depth:lang.fx, width:lang.fy, comp:[lang], breitN:0};
  }
  return best;
}
// Reihen-Plan für G Stellplätze. "optimiert" minimiert die Gesamttiefe per DP und
// mischt lang/breit innerhalb einer Reihe, damit die Breite voll genutzt wird.
function planRows(o, W, G){
  if(G<=0) return [];
  if(o.ladeart==="lang" || o.ladeart==="breit"){
    const ori = (o.ladeart==="lang") ? {fx:o.laenge, fy:o.breite} : {fx:o.breite, fy:o.laenge};
    const per = Math.max(1, Math.floor(W / ori.fy));
    const rows = [];
    for(let left=G; left>0; left-=per){
      rows.push({depth:ori.fx, comp:Array(Math.min(per,left)).fill(ori)});
    }
    return rows;
  }
  // optimiert: minimale Gesamttiefe per DP; bei Gleichstand MAXIMAL breit
  const cand = rowCandidates(o, W);
  const counts = Object.keys(cand).map(Number).sort((a,b)=>a-b);
  const f = new Array(G+1).fill(Infinity), br = new Array(G+1).fill(0), choice = new Array(G+1).fill(0);
  f[0] = 0; br[0] = 0;
  for(let n=1; n<=G; n++){
    for(let i=counts.length-1; i>=0; i--){
      const c = counts[i];
      if(c>n) continue;
      const d = cand[c].depth + f[n-c];
      const b = cand[c].breitN + br[n-c];
      if(d < f[n]-0.01 || (Math.abs(d-f[n])<0.01 && b > br[n])){ f[n]=d; br[n]=b; choice[n]=c; }
    }
  }
  const rows = [];
  for(let n=G; n>0; ){
    const c = choice[n] || counts[0];
    rows.push({depth:cand[c].depth, comp:cand[c].comp.slice()});
    n -= c;
  }
  const isBreit = ori => ori.fx===o.breite && ori.fy===o.laenge;
  rows.sort((a,b)=> b.comp.filter(isBreit).length - a.comp.filter(isBreit).length);  // breit vorne, lang hinten
  return rows;
}
// Gesamttiefe (= Lademeter) der Querreihen-Variante
function rowsLength(o, W, ground){
  return planRows(o, W, ground).reduce((s,r)=>s+r.depth, 0);
}
// --- Variante B: Längsbahnen (Spalten). Probiert alle Lang-/Breit-Bahn-Kombinationen
// und balanciert die Paletten, um die maximale Bahnlänge (= Lademeter) zu minimieren.
function lanesPlan(o, W, ground){
  const a = o.laenge, b = o.breite;           // Lang-Bahn: Breite b, Länge je Palette a
  const maxLang = Math.floor(W / b), maxBreit = Math.floor(W / a);
  let best = null;
  for(let nl=0; nl<=maxLang; nl++){
    for(let nb=0; nb<=maxBreit; nb++){
      if(nl+nb===0 || nl*b + nb*a > W + 0.01) continue;
      const lanes = [];
      for(let i=0;i<nl;i++) lanes.push({unit:a, width:b, count:0});  // Lang-Bahn
      for(let i=0;i<nb;i++) lanes.push({unit:b, width:a, count:0});  // Breit-Bahn
      for(let k=0;k<ground;k++){                                     // Paletten ausbalancieren
        let bl = lanes[0];
        for(const ln of lanes) if((ln.count+1)*ln.unit < (bl.count+1)*bl.unit) bl = ln;
        bl.count++;
      }
      const length = Math.max(...lanes.map(l=>l.count*l.unit));
      if(!best || length < best.length-0.01 || (Math.abs(length-best.length)<0.01 && nb > best.nb))
        best = {lanes, length, nb};
    }
  }
  if(!best) best = {lanes:[{unit:a, width:b, count:ground}], length:ground*a, nb:0};  // Überbreite
  return best;
}
// Bestes Packen eines Auftrags -> Streifen.
//  mode "lanes": waagerechte Bahnen (jede einzeln in Lücken schiebbar).
//  mode "rows":  Querreihen als (rigider) Block; auch für feste Ladeart lang/breit.
function packGround(o, W, ground){
  if(ground<=0) return {mode:"none"};
  let rows = planRows(o, W, ground);
  if(o.ladeart!=="lang" && o.ladeart!=="breit"){
    const rowsLen = rows.reduce((s,r)=>s+r.depth, 0);
    const isBreit = ori => ori.fx===o.breite && ori.fy===o.laenge;
    const rowsBreit = rows.reduce((s,r)=> s + r.comp.filter(isBreit).length, 0);
    const lp = lanesPlan(o, W, ground);
    const lanesBreit = lp.lanes.reduce((s,l)=> s + (Math.abs(l.unit-o.breite)<0.01 ? l.count : 0), 0);
    // kürzeste Länge gewinnt; bei Gleichstand mehr breit; bei Breit-Gleichstand Bahnen (verzahnen besser)
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
  // Reihen-Modus (rigider Block)
  const block = []; let x = 0;
  for(const row of rows){
    let y = 0;
    for(const ori of row.comp){ block.push({x, y, w:ori.fx, h:ori.fy}); y += ori.fy; }
    x += row.depth;
  }
  return {mode:"rows", block};
}
// Lademeter eines einzelnen Auftrags (alleine geladen), aufgerundet auf 0,1 m
function orderLademeter(o, truck){
  if(!(o.anzahl>0)) return 0;
  const stack = isStackable(o, truck);
  const ground = stack ? Math.ceil(o.anzahl/2) : o.anzahl;
  if(ground<=0) return 0;
  let len = rowsLength(o, truck.w, ground);
  if(o.ladeart!=="lang" && o.ladeart!=="breit") len = Math.min(len, lanesPlan(o, truck.w, ground).length);
  return Math.ceil(len / 100) / 10;
}

// Skyline (Frontlinie je Breiten-Position) für die Block-Verzahnung
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
// "Gratis"-Lückenfüllung: einzelne Paletten in bestehende Vertiefungen setzen,
// ohne die bisherige Gesamtlänge zu erhöhen (füllt sonst tote Ecken zwischen Aufträgen).
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
      if(x + ori.fx > gMax + 0.01) continue;          // muss „gratis" unter die Decke passen
      // Priorität: vorderste Position (x), dann flachste Tiefe (fx -> bevorzugt breit), dann mehr Breite (fy)
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

// Platziert eine FESTE Auftrags-Reihenfolge sequenziell auf der Skyline.
function layoutSequence(seq, truck){
  const W = truck.w;
  const placements = [];
  let sky = [{y0:0, y1:W, x:0}];            // Frontlinie, anfangs überall vorne (x=0)
  for(const o of seq){
    const stack = isStackable(o, truck);
    let ground = stack ? Math.ceil(o.anzahl/2) : o.anzahl;
    if(ground<=0) continue;
    let left = o.anzahl;
    const sc = ()=>{ const s = stack ? Math.min(2, left) : 1; left -= s; return s; };
    const lang = {fx:o.laenge, fy:o.breite}, breit = {fx:o.breite, fy:o.laenge};
    const oris = o.ladeart==="lang" ? [lang] : o.ladeart==="breit" ? [breit] : [lang, breit];

    // 1) gratis-Lückenfüllung in Vertiefungen vorheriger Aufträge
    const gf = gapFill(sky, W, oris, ground);
    for(const p of gf.placed) placements.push({ x:p.x, y:p.y, w:p.w, h:p.h, color:o.color, order:o, stack:sc() });
    sky = gf.sky; ground -= gf.placed.length;
    if(ground<=0) continue;

    // 2) Rest als optimales Paket (Bahnen/Reihen) verzahnt platzieren
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
// Aufträge GLEICHER Ladereihenfolge dürfen vermischt werden (Spec). Wir probieren mehrere
// Sortierungen innerhalb jeder Reihenfolge-Gruppe und nehmen das kürzeste Ergebnis.
function orderByGroups(active, cmp, truck){
  const groups = new Map();
  for(const o of active){ if(!groups.has(o.reihenfolge)) groups.set(o.reihenfolge, []); groups.get(o.reihenfolge).push(o); }
  const out = [];
  for(const k of [...groups.keys()].sort((a,b)=>a-b)){
    const g = groups.get(k).slice();
    if(cmp) g.sort(cmp);
    out.push(...g);
  }
  return out;
}
function computeLayout(){
  const truck = TRUCKS[currentTruck];
  const L = truck.l;
  const active = orders.filter(o => o.aktiv && o.anzahl>0);
  active.sort((a,b)=> (a.reihenfolge-b.reihenfolge) || (a.id-b.id));

  const gnd = o => isStackable(o,truck) ? Math.ceil(o.anzahl/2) : o.anzahl;
  // Kandidaten-Sortierungen (je Reihenfolge-Gruppe); Original (nach id) ist immer dabei -> nie schlechter
  const cmps = [
    null,                                                  // Original (id)
    (a,b)=> gnd(b)*b.laenge*b.breite - gnd(a)*a.laenge*a.breite, // größte Fläche zuerst
    (a,b)=> gnd(b) - gnd(a),                               // meiste Stellplätze zuerst
    (a,b)=> Math.max(b.laenge,b.breite) - Math.max(a.laenge,a.breite), // längste Palette zuerst
    (a,b)=> b.breite - a.breite,                           // breiteste zuerst
  ];
  let best = null;
  for(const cmp of cmps){
    const r = layoutSequence(orderByGroups(active, cmp, truck), truck);
    if(!best || r.usedLength < best.usedLength - 0.01) best = r;
  }
  const placements = best ? best.placements : [];
  const usedLength = best ? best.usedLength : 0;
  placements.forEach(p => p.overflow = (p.x + p.w) > L + 0.01);
  const fits = usedLength <= L + 0.01;
  return {placements, usedLength, fits, truck};
}
