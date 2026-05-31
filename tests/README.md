# Packing tests

Regression / benchmark suite for the loading algorithm (`src/js/04-packing.js`).
No dependencies — runs with plain Node.

```bash
node tests/run.mjs                   # run everything (exit 1 on any failure)
node tests/run.mjs --update-baseline # accept current results as the new baseline
```

## What it checks

**Golden cases** (`tests/cases/*.json`) — curated inputs with a known-good target:

- **Invariants** (always): no overlaps, every pallet within the truck width,
  all pallets placed, expected overflow count.
- **Metric**: achieved load length ≤ `expected.usedLength_m` + `tolerance_m`.
- **Never-regress**: achieved length must not exceed `baseline.usedLength_m`.

Exact coordinates are deliberately **not** asserted — equal-length layouts are not unique.

**Invariant fuzz** (Tier 1): thousands of seeded random inputs, only checked for
overlaps / width / completeness. Catches correctness bugs without a hand answer.

## Case format

```jsonc
{
  "name": "...",
  "truck": { "l": 13600, "w": 2450, "h": 2650 },     // mm, inline (self-contained)
  "orders": [
    { "orderNo": "...", "qty": 4, "length": 1200, "width": 830, "height": 1860,
      "loadMode": "optimized|long|wide", "sequence": 1, "stackable": false }
  ],
  "expected": { "usedLength_m": 5.26, "overflow": 0, "tolerance_m": 0.05 },
  "baseline": { "usedLength_m": 5.26 }                 // auto-maintained via --update-baseline
}
```

## Adding a case

1. In the app, build a load you consider optimal (manually if needed) and note the length.
2. Create `tests/cases/NN-name.json` with the orders + truck and set
   `expected.usedLength_m` to that target.
3. Run `node tests/run.mjs`. If the algorithm already meets it, lock the baseline with
   `--update-baseline`. If it doesn't, the case documents an open improvement (FAIL = todo).

`expected` is the quality goal (what *should* be reachable); `baseline` guards against the
algorithm getting worse than it currently is. Improvements are reported and can be locked in.
