# LKW Planner — Handover

Stand: 2026-05-29

## Zweck
Single-File-HTML-Tool zur **Beladungsplanung von LKW mit Paletten**. Topdown-Ansicht des
LKW (oben, fix), darunter eine sortier-/editierbare Auftragsliste. Keine Installation,
kein Build, keine externen Libs — einfach [LKW Planner/lkw-planer.html](LKW%20Planner/lkw-planer.html)
im Browser öffnen.

## Dateien
- `LKW Planner/lkw-planer.html` — **die gesamte App** (HTML + CSS + JS in einer Datei).
- `LKW Planner/Prompt.txt` — ursprüngliche Spezifikation des Auftraggebers.
- `LKW Planner/Plandaten.txt` / `Plandaten.png` — Beispiel-Report aus dem Quellsystem (Import-Format).
- `IDEAS.md` — offene Feature-Ideen.

## Datenmodell
Globale `orders[]`, jeder Auftrag (`makeOrder`):
`id, color, auftragsnummer, kunde, lieferdatum, destCode, anzahl, laenge, breite, hoehe (mm),
ladeart ('optimiert'|'lang'|'breit'), reihenfolge (1–99), stapelbar (bool), aktiv (bool)`.
Nur **aktive** Aufträge mit `anzahl>0` kommen in Grafik/Berechnung.

LKW-Typen: `DEFAULT_TRUCKS` (mm) = Kühler 13300×2400×2600, Plane 13600×2450×2650,
Motorwagen Wenzel 7200×2450×2500, Motorwagen Tüske 8000×2450×2700. Zur Laufzeit ist `TRUCKS`
**mutierbar** und wird aus `localStorage` (`lkwPlaner.trucks`) geladen (Fallback = Defaults).
`settings` (`lkwPlaner.settings`) hält `showCrosshair` und `lang` ("de"|"en"). `loadConfig/saveTrucks/saveSettings`.

## Mehrsprachigkeit (DE/EN, Default DE)
Zentrales `I18N = {de:{…}, en:{…}}`; `t(key, ...args)` liefert den Text der aktuellen `settings.lang`
(Werte können Strings oder Funktionen für Pluralformen/Parameter sein). Statische Texte tragen
`data-i18n` (textContent), `data-i18n-title` (title) bzw. `data-i18n-ph` (placeholder); `applyStatic()`
setzt sie. Dynamische Texte (Render-Funktionen, Toasts, SVG „VORNE", Tooltips) nutzen `t()`.
Umschalten via `#langSel` in den Einstellungen → `saveSettings()` + `applyStatic()` + `renderAll()`.
**Beim Hinzufügen neuer UI-Texte: Key in BEIDE Sprachen eintragen** (Node-Check: alle `t()`-/`data-i18n`-Keys
müssen in `de` und `en` existieren).

## Import aus Zwischenablage (`parseClipboard` / `parseLine`)
Festbreiten-Report; Parsing über **Datums-Anker** (`\d{2}\.\d{2}\.\d{2}`):
- Token 0 = Idx (ignoriert), Token 1 = Auftragsnummer (`*` entfernen, `C` bleibt).
- Tokens zwischen Idx+1 und Datum = mehrwortiger Kundenname.
- Direkt nach Datum: Dest-Code, dann **2 Spalten überspringen**, dann **Palettenanzahl**.
- **Letzte 3 Tokens = Länge / Breite / Höhe.**
Unvollständige Zeilen (beginnen mit Zahl, parsen aber nicht) → ignoriert + Warn-Toast.
Bereits vorhandene Auftragsnummern werden beim Import **nicht doppelt** angelegt.

## Beladungs-Algorithmus (das Herzstück — wichtigste Design-Historie)
Koordinaten topdown: **X = LKW-Länge** (vorne = links), **Y = LKW-Breite**.
Orientierungen: *lang* = Länge längs (fx=laenge, fy=breite), *breit* = Breite längs (fx=breite, fy=laenge).

Pro Auftrag werden **zwei Varianten** berechnet, für "optimiert" gewinnt die mit der kürzeren Länge:
1. **Querreihen** (`planRows` + `rowCandidates`): DP über Palettenzahl, minimiert Gesamttiefe,
   mischt lang/breit **innerhalb einer Reihe** (volle Breitennutzung). Gut wenn 3 lang + 2 breit o.ä.
2. **Längsbahnen / Spalten** (`lanesPlan`): probiert alle Lang-/Breit-Bahn-Kombinationen,
   balanciert Paletten über die Bahnen, minimiert die längste Bahn. Gewinnt z. B. bei 1290×864.

Stapelung: wenn `stapelbar` und `2*hoehe <= LKW-Höhe`, trägt ein Stellplatz 2 Paletten
(`ground = ceil(anzahl/2)`). `stapelbar` wird automatisch deaktiviert wenn LKW zu niedrig.

**Auftragsübergreifende Verzahnung (`computeLayout`)**: eine **Skyline** (Frontlinie je Y-Position).
- **Gratis-Lückenfüllung (`gapFill`)**: vor dem Hauptpaket werden einzelne Paletten in Vertiefungen
  vorheriger Aufträge gesetzt, sofern sie „unter die Decke" passen (Gesamtlänge steigt nicht).
- Bahnen-Aufträge: jede Bahn (Streifen) wird **einzeln** so weit wie möglich nach links geschoben.
- Reihen-Aufträge & feste lang/breit: Rest als **rigider Block** nach links geschoben.
Bei Gleichstand Bahnen-Länge==Reihen-Länge → **Bahnen bevorzugen** (verschachteln besser).
Aufträge in Reihenfolge `reihenfolge` verarbeitet (vorne = niedrigste Reihenfolge).

**Umsortieren innerhalb gleicher Reihenfolge (`computeLayout`/`orderByGroups`)**: Aufträge mit
identischer `reihenfolge` dürfen laut Spec vermischt werden. `computeLayout` probiert mehrere
Sortierungen je Reihenfolge-Gruppe (Original/id, größte Fläche, meiste Stellplätze, längste/breiteste
Palette zuerst) via `layoutSequence` und nimmt das **kürzeste** Ergebnis. Original ist immer Kandidat
→ **nie schlechter**. Bringt teils deutlich kürzere Ladungen (vermeidet eingeschlossene Taschen).
Die **Listenanzeige** bleibt unverändert; nur die Grafik nutzt die optimierte Reihenfolge.

**Garantie:** überschneidungsfrei (per Skyline + exakte Koordinaten). Mit Node-Fuzz über
tausende Zufalls-Layouts geprüft (0 Überschneidungen, 0 Breitenüberschreitungen, alle Paletten platziert).
**Keine** beweisbar global-optimale 2D-Packung (NP-schwer) — aber pro Auftrag optimal aus {Reihen, Bahnen}
plus Verzahnung. Überstehende Paletten (Länge > LKW) werden rot-gestrichelt markiert + Info-Hinweis.

### Wie man den Algorithmus testet
Funktionen sind reines JS. Zum Verifizieren: `<script>`-Block extrahieren, Pack-Funktionen
(`planRows`, `lanesPlan`, `packGround`, `gapFill`, `layoutSequence`, `orderByGroups`) nach Node
kopieren, Overlap-Check (achsenparallele Rechtecke) + Fuzz laufen lassen. (So wurde während der
Entwicklung jede Algorithmus-Änderung verifiziert — immer 0 Überschneidungen.)

## UI / Features
- **Toolbar**: LKW-Auswahl, Neuer Auftrag (scrollt hin + fokussiert, Reihenfolge default 1),
  Aus Zwischenablage, Aktualisieren, Rückgängig (Strg+Z), „Alle inaktiv", Export/Import JSON,
  Reset (Zwei-Klick „Sicher?").
- **Grafik** (`renderTruck`): SVG, Dark Theme, Paletten in Auftragsfarbe, „2×"-Marker bei Stapelung,
  grüne Linie = genutzte Länge, Meter-Maßband.
  - **Klick auf Palette** → scrollt zur Auftragszeile + lässt sie aufblitzen (`.order.flash`).
  - **Hover über freie Lücke** → zwei gelbe Maß-Achsen (freie Länge × Breite, in m), auch im
    Endbereich; via `mousemove` + `getScreenCTM().inverse()`, gezeichnet in `<g id="hoverGuide">`.
- **Liste** (`renderList`): Zeilenform, je Zeile in Auftragsfarbe getönt (`color-mix`); aktive Zeilen
  haben kräftigeren Rand + helleren linken Farbbalken. Sortierbare Header (`SORT_COLS`/`sortOrders`,
  inkl. Aktiv/Stapelbar als boolesch). Tab markiert Feldinhalt; L/B/H nur Zahlen+Komma (Punkt→Komma).
  - **Klick/Fokus irgendwo in eine Zeile** → deren Paletten blitzen auf (`flashPallets`/`triggerFlash`,
    150 ms Dedupe gegen Doppel-Blitz aus Klick+Fokus).
- **`recalc()`** aktualisiert nach jeder Änderung die Grafik/Totals/Info **und** synchronisiert je
  Zeile die „X Lademeter"-Anzeige und den Stapelbar-Status, ohne die Liste neu zu rendern
  (Fokus/Cursor bleiben erhalten).
- **Undo-History**: `record()` vor jeder Mutation sichert kompletten Zustand (bis 200 Schritte),
  Textfeld-Bearbeitung = 1 Undo-Schritt pro Fokus-Session.
- **Toasts** (`notify`): Hinweise unten, 5 s Auto-Ausblenden.
- **Ladeinfo** (rechts, `renderInfo`): pro aktivem Auftrag Nr/Kunde/Paletten/Lademeter; Passt-Meldung
  mit **Anzahl überstehender Paletten** wenn es nicht passt.
- **Export/Import JSON**: Export-Button öffnet einen Dateinamen-Dialog (`#nameModal`, Default
  „LKW-Ladung " + Datum/Uhrzeit) und lädt eine .json (Truck + alle Auftragsfelder inkl. Farbe);
  Import liest sie via `makeOrder` wieder ein (mit Validierung + Fehler-Toast), undo-fähig.
- **Einstellungen** (`#settingsModal`, Zahnrad): LKW-Typen anlegen/ändern/löschen (Maße in Metern,
  intern mm), persistiert in `localStorage`; `rebuildTruckSelect`/`renderTruckTable`/`applyTruckTable`.
  Plus Schalter „Fadenkreuz/Distanzanzeige" (`settings.showCrosshair`) — gated den Hover-Handler.

## Wichtige Entscheidungen / Stolpersteine
- Lademeter immer **auf 0,1 m aufgerundet**.
- `chooseOrientation`/`packOrder` (alte Versionen) wurden ersetzt — nicht wiederbeleben.
- Orientierungs-Objekte per **Wert** vergleichen, nicht per Referenz (früherer Bug).
- Layout-Reihenfolge (inkl. Umsortieren gleicher `reihenfolge`) ist unabhängig von der
  Array-/Anzeige-Reihenfolge der Liste; Sortier-Header ändern nur die Anzeige.
- `recalc()` darf die Liste NICHT per `renderList()` neu bauen (zerstört Fokus beim Tippen) —
  daher der gezielte Zeilen-Sync.

## Offene Ideen (siehe IDEAS.md)
Erledigt: alle-inaktiv, JSON Export/Import, sortierbare Header (inkl. Aktiv/Stapelbar),
Paletten↔Zeile-Highlight (beide Richtungen), Hover-Lückenmaße, Umsortier-Optimierung,
Gratis-Lückenfüllung, Anzahl überstehender Paletten, aktive Zeilen hervorgehoben.
Möglich künftig: echte global-optimale 2D-Packung, Druck/PDF-Export, Verteilung auf mehrere LKW.
