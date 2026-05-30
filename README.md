# Truck Loading Planner

A single‑file, dependency‑free web tool for planning how pallets are loaded onto a truck.
It shows a **top‑down view** of the truck (front = left) with colour‑coded pallets and an
editable order list below, and computes a space‑efficient, **overlap‑free** arrangement.

The whole app ships as **one self‑contained `lkw-planer.html`** (HTML + CSS + JS inline, no
external libraries, works offline) — just open it in a browser.

## Features

- **Top‑down truck view** (SVG): pallets coloured per order, `2×` marker for stacked pallets,
  used‑length marker and a metre ruler.
- **Order list**: order no., customer, delivery date, destination, pallet count, L×W×H (mm),
  load mode, sequence, stackable & active toggles, per‑order remark — all inline‑editable and sortable.
- **Loading optimisation** (`optimized` mode): per order the shorter of
  *cross‑rows* and *lengthwise lanes* is chosen; orders interlock via a skyline (free gaps are
  filled); orders with the same sequence number may be reordered for minimal loading metres.
  Crosswise loading is preferred on ties. Forced `all lengthwise` / `all crosswise` modes too.
- **Stacking**: two pallets per slot when allowed and the truck is tall enough.
- **Clipboard import** of the planning‑system's fixed‑width report (date‑anchored parsing,
  duplicate & incomplete‑line handling).
- **JSON export/import** of a load (with a filename dialog and load‑wide remarks).
- **Print / PDF**: a clean light print view (hatched pallets, order table) via the browser's
  print dialog → "Save as PDF".
- **Settings** (persisted in `localStorage`): manage truck types (add/edit/delete), toggle the
  hover crosshair, switch language.
- **Trilingual UI**: German (default), English, Hungarian.
- Undo (Ctrl+Z), hover measurements for free gaps and pallet dimensions, copy order number,
  hide inactive orders, and more.

## Example Data from Kiwi
```
9   1234567  Weingut B 28.05.26 AT34 9013 01 3             0   1200 830  1860

10 *1234568  Trading K 28.05.26 AT40 9013 01 6   37942 6   0   1200 800  1440

11 *1234569  Trading K 28.05.26 AT40 9013 01 5   37942 1   0   1200 832  1746
```

## Build

The app is developed as separate sources in `src/` and assembled into one file by `build.mjs`
(plain Node, no dependencies):

```
src/
  index.html        # skeleton with /* @@STYLES@@ */ and /* @@SCRIPT@@ */ placeholders
  styles.css
  js/01-config.js … 06-events.js   # concatenated in alphabetical order (one shared scope)
build.mjs
```

```bash
node build.mjs        # → dist/lkw-planer.html
```

Open `dist/lkw-planer.html` in any modern browser. `dist/` is git‑ignored.

## Releases

Pushing a version tag (`vX.Y`) triggers a GitHub Actions workflow that builds the file and
attaches `lkw-planer.html` to the GitHub Release as a downloadable asset:

```bash
git tag v0.3
git push --tags
```

## License

No license specified yet.
