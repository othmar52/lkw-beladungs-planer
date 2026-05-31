#!/usr/bin/env node
// Packing regression / benchmark runner — no dependencies.
//
//   node tests/run.mjs                  run all cases under tests/cases/*.json
//   node tests/run.mjs --update-baseline rewrite each case's "baseline" to the current result
//
// A case asserts INVARIANTS (no overlap, within truck width, all pallets placed,
// expected overflow count) and a METRIC (used length <= target + tolerance).
// It never asserts exact coordinates — equal-length layouts are not unique.
//
// "expected.usedLength_m" = best known / hand-optimised target (quality goal).
// "baseline.usedLength_m" = last recorded algo result (never-regress guard).

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CASES_DIR = join(HERE, "cases");
const EPS_MM = 1;                          // 1 mm float tolerance for comparisons
const UPDATE = process.argv.includes("--update-baseline");

// --- load the packing module into an isolated context (computeLayout(orders, truck)) ---
const packingSrc = readFileSync(join(ROOT, "src/js/04-packing.js"), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(packingSrc + "\nthis.computeLayout = computeLayout;", sandbox);
const computeLayout = sandbox.computeLayout;

// --- helpers ---
const isStackable = (o, t) => !!o.stackable && 2 * o.height <= t.h;
const groundSlots = (o, t) => (isStackable(o, t) ? Math.ceil(o.qty / 2) : o.qty);

function overlaps(pl) {
  for (let i = 0; i < pl.length; i++)
    for (let j = i + 1; j < pl.length; j++) {
      const a = pl[i], b = pl[j];
      if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 &&
          a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) return [a, b];
    }
  return null;
}

function normalizeOrders(raw) {
  return raw.map((o, i) => ({
    id: i + 1,
    color: "#000",
    active: o.active !== false,
    orderNo: o.orderNo || ("#" + (i + 1)),
    customer: o.customer || "",
    qty: +o.qty || 0,
    length: +o.length, width: +o.width, height: +o.height,
    loadMode: o.loadMode || "optimized",
    sequence: +o.sequence || 1,
    stackable: !!o.stackable,
  }));
}

function runCase(c) {
  const truck = c.truck;
  const orders = normalizeOrders(c.orders);
  const layout = computeLayout(orders, truck);
  const pls = layout.placements;
  const fails = [];

  // invariants
  const ov = overlaps(pls);
  if (ov) fails.push(`overlap: ${ov[0].order.orderNo} vs ${ov[1].order.orderNo}`);
  for (const p of pls)
    if (p.y < -0.5 || p.y + p.h > truck.w + 0.5) { fails.push(`out of width: ${p.order.orderNo}`); break; }
  const expectGround = orders.filter(o => o.active && o.qty > 0)
    .reduce((s, o) => s + groundSlots(o, truck), 0);
  if (pls.length !== expectGround) fails.push(`placed ${pls.length}/${expectGround} slots`);
  const overflow = pls.filter(p => p.overflow).length;
  const expOverflow = c.expected?.overflow ?? 0;
  if (overflow !== expOverflow) fails.push(`overflow ${overflow}, expected ${expOverflow}`);

  // metric
  const istMM = Math.round(layout.usedLength);
  const tgtMM = c.expected?.usedLength_m != null ? Math.round(c.expected.usedLength_m * 1000) : null;
  const tolMM = Math.round((c.expected?.tolerance_m ?? 0.05) * 1000);
  if (tgtMM != null && istMM > tgtMM + tolMM + EPS_MM)
    fails.push(`over target: ${(istMM / 1000).toFixed(3)}m > ${(tgtMM / 1000).toFixed(2)}m (+${tolMM}mm tol)`);

  const baseMM = c.baseline?.usedLength_m != null ? Math.round(c.baseline.usedLength_m * 1000) : null;
  let regressed = false, improved = false;
  if (baseMM != null) {
    if (istMM > baseMM + EPS_MM) { fails.push(`REGRESSION: ${(istMM / 1000).toFixed(3)}m > baseline ${(baseMM / 1000).toFixed(3)}m`); regressed = true; }
    else if (istMM < baseMM - EPS_MM) improved = true;
  }

  return { name: c.name, istMM, tgtMM, baseMM, fails, regressed, improved };
}

// --- run ---
const files = readdirSync(CASES_DIR).filter(f => f.endsWith(".json")).sort();
if (!files.length) { console.error("No cases found in", CASES_DIR); process.exit(1); }

const m = mm => mm == null ? "  —  " : (mm / 1000).toFixed(2);
let fail = 0, improvedN = 0;
let scoreSum = 0, scoreN = 0;
const rows = [];

for (const f of files) {
  const path = join(CASES_DIR, f);
  const c = JSON.parse(readFileSync(path, "utf8"));
  const r = runCase(c);
  if (r.fails.length) fail++;
  if (r.improved) improvedN++;
  if (r.tgtMM) { scoreSum += r.istMM / r.tgtMM; scoreN++; }
  const status = r.fails.length ? "FAIL" : r.improved ? "OK+" : "OK";
  rows.push({ r, status });

  if (UPDATE) { c.baseline = { usedLength_m: +(r.istMM / 1000).toFixed(3) }; writeFileSync(path, JSON.stringify(c, null, 2) + "\n"); }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("Case", 34) + pad("Ziel", 7) + pad("Base", 7) + pad("Ist", 7) + pad("Δ", 8) + "Status");
console.log("-".repeat(69));
for (const { r, status } of rows) {
  const delta = r.baseMM != null ? ((r.istMM - r.baseMM) / 1000).toFixed(2) : "—";
  console.log(pad(r.name.slice(0, 33), 34) + pad(m(r.tgtMM), 7) + pad(m(r.baseMM), 7) + pad(m(r.istMM), 7) + pad(delta, 8) + status);
  for (const msg of r.fails) console.log("    ↳ " + msg);
}
console.log("-".repeat(69));
const score = scoreN ? (scoreSum / scoreN).toFixed(3) : "n/a";
console.log(`${files.length} cases · FAIL ${fail} · Verbesserungen ${improvedN} · Score (Ø Ist/Ziel) ${score}`);

// --- Tier 1: invariant fuzz (deterministic seed) — random inputs, only assert no-overlap / width / placed ---
const FUZZ = 4000;
let seed = 1234567;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
let fuzzFail = 0, firstFail = null;
for (let it = 0; it < FUZZ; it++) {
  const n = 1 + Math.floor(rnd() * 5);
  const truck = pick([{ l: 13600, w: 2450, h: 2650 }, { l: 7200, w: 2450, h: 2500 }, { l: 13300, w: 2400, h: 2600 }]);
  const orders = [];
  for (let k = 0; k < n; k++) orders.push({
    id: k + 1, color: "#000", active: true, orderNo: "O" + k,
    qty: 1 + Math.floor(rnd() * 8),
    length: 600 + Math.floor(rnd() * 7) * 100, width: 600 + Math.floor(rnd() * 5) * 100,
    height: 1000 + Math.floor(rnd() * 900),
    loadMode: pick(["optimized", "optimized", "long", "wide"]),
    sequence: 1 + Math.floor(rnd() * 3), stackable: rnd() < 0.3,
  });
  const layout = computeLayout(orders, truck);
  const pls = layout.placements;
  const ov = overlaps(pls);
  const widthBad = pls.some(p => p.y < -0.5 || p.y + p.h > truck.w + 0.5);
  const expG = orders.reduce((s, o) => s + groundSlots(o, truck), 0);
  if (ov || widthBad || pls.length !== expG) {
    fuzzFail++;
    if (!firstFail) firstFail = { it, why: ov ? "overlap" : widthBad ? "width" : `placed ${pls.length}/${expG}`, orders, truck };
  }
}
if (fuzzFail) {
  console.log(`Fuzz: ${FUZZ} Laeufe · FAIL ${fuzzFail}  (erster: #${firstFail.it} ${firstFail.why})`);
  console.log("  " + JSON.stringify(firstFail.orders.map(o => ({ q: o.qty, l: o.length, w: o.width, m: o.loadMode, s: o.sequence }))));
} else {
  console.log(`Fuzz: ${FUZZ} Laeufe · 0 Ueberlappungen / Breitenfehler / fehlende Paletten`);
}

if (UPDATE) console.log("baselines aktualisiert.");
process.exit(fail || fuzzFail ? 1 : 0);
