#!/usr/bin/env node
// Baut die Einzeldatei dist/lkw-planer.html aus den Quellen in src/.
// Keine Dependencies. Aufruf:  node build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, 'src');
const outDir = join(root, 'dist');
const outFile = join(outDir, 'lkw-planer.html');

const css = readFileSync(join(srcDir, 'styles.css'), 'utf8').replace(/\s+$/, '');

// JS-Module in alphabetischer Reihenfolge (01-config, 02-i18n, …) zusammenfügen
const jsFiles = readdirSync(join(srcDir, 'js')).filter(f => f.endsWith('.js')).sort();
const js = jsFiles
  .map(f => `/* ===== ${f} ===== */\n` + readFileSync(join(srcDir, 'js', f), 'utf8').replace(/\s+$/, ''))
  .join('\n\n');

let html = readFileSync(join(srcDir, 'index.html'), 'utf8');
// Funktions-Replacer: verhindert Sonderzeichen-Interpretation ($&, $1 …) in CSS/JS
html = html.replace('/* @@STYLES@@ */', () => '\n' + css + '\n');
html = html.replace('/* @@SCRIPT@@ */', () => '\n' + js + '\n');

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html);
console.log(`✓ gebaut: dist/lkw-planer.html  (${jsFiles.length} JS-Module, ${(html.length/1024).toFixed(0)} KB)`);
