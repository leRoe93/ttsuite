# TTSuite – Tischtennis-Toolkit

Rein clientseitige Web-App für deutsche Tischtennisvereine. Erste Werkzeuge:

- **Mannschaftsplaner** – Spieler über einen Link zur öffentlichen click-TT-Mannschaftsmeldung des Vereins holen (kopieren & einfügen) oder per CSV importieren, per Drag & Drop (oder Tastatur/Menü) auf Mannschaften verteilen, Prüfung der Mannschaftsmeldung nach DTTB-WO Abschnitt H: Q-TTR-Reihenfolge, Toleranzen 35/50 (70/85, 105/120), Sperrvermerk inkl. Folge-SPV, RES/WES/NES/SES, Rückrunden-Regeln. Undo/Redo, Export CSV/JSON/Druck.
- **Turnierplaner (TT-Race)** – Teilnehmer aus der click-TT-XML (oder CSV/Spielerpool) importieren, Schweizer System nach BTTV-TT-Race-Regeln bzw. „Jeder gegen Jeden“, Ergebniserfassung mit Satzprüfung, Tabelle mit Buchholz/direktem Vergleich, Korrekturen, Abmeldungen, Export der Ergebnisse als click-TT-Schnittstellendatei, Sicherung/Wiederherstellung.

Keine Anmeldung, kein Server, keine Datenübertragung. Daten liegen im Browser (localStorage); Sicherungen als JSON-Datei.

## Schnellstart

Voraussetzung: Node.js ≥ 22.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Unit-/Regeltests (node:test)
npm run typecheck
npm run build      # statische Dateien in dist/
```

Optionaler Browser-Durchlauf beider Workflows (benötigt `npm i -D playwright && npx playwright install chromium`):

```bash
npm run build && node scripts/e2e-smoke.mjs --shots screenshots
```

## Deployment

`dist/` ist eine statische Website (relative Pfade, Hash-Routing). Einfach auf beliebigen Static Host kopieren: GitHub Pages, Netlify, Cloudflare Pages, Vereins-Webspace (Unterordner funktioniert). Für den Offline-Modus (Service Worker) ist HTTPS nötig.

## Testdaten (fiktiv)

- `sample-data/fiktive_spieler_mannschaftsmeldung.csv` – 22 erfundene Spieler eines erfundenen Vereins mit Mannschaft, Rang, Q-TTR und Kennzeichen.
- `sample-data/fiktives_tt-race_clicktt_teilnehmer.xml` – 13 erfundene Teilnehmer im Aufbau der click-TT-Teilnehmerdatei.

## Dokumentation

- [docs/REGULATIONS.md](docs/REGULATIONS.md) – umgesetzte Regeln mit Quellen, Interpretationen, offene/unbelegte Punkte
- [docs/FORMATS.md](docs/FORMATS.md) – Import- und Exportformate
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – Aufbau, Erweiterung um neue Werkzeuge, Technologie-Abwägungen

## Wichtige Einschränkungen

- click-TT und myTischtennis bieten keine offene API. TTSuite verlinkt die öffentliche click-TT-Mannschaftsmeldung; die Tabelle wird dort kopiert und eingefügt. Es gibt keinen automatischen Abruf.
- Das click-TT-Ergebnis-XML ist nach öffentlich verfügbaren Beispieldateien nachgebildet, nicht offiziell spezifiziert. Kampflose Spiele werden nicht exportiert. Vor dem ersten Echteinsatz mit dem click-TT-Ergebnis-Importer testen.
- Regelwerke ohne Gewähr; regionale Abweichungen über „Für meinen Verband anpassen…“. Die Prüfung ersetzt nicht den Spielleiter.
- Browser-Speicher kann beim Löschen der Browserdaten verloren gehen – regelmäßig sichern.

## Erweiterungspunkte

- Neues Werkzeug: `registerFeature()` in `src/features/<tool>/index.tsx` + eine Importzeile (siehe ARCHITECTURE.md).
- Neue Datenquelle: Adapter nach `ImportAdapter`-Muster in `src/imports/`, liefert `ImportPreview`.
- Neues Regelwerk: `LineupRuleSet` in `src/domain/team-rules/ruleSets.ts`.
- Weitere Turnierformate: neues Pairing-Modul in `src/domain/pairing/`, `PairingSystem` erweitern.
- Speicher-Backend: `KeyValueStore`-Implementierung (z. B. IndexedDB).
- Weitere Exporte: Funktionen in `src/exports/` auf Basis der Domänenmodelle.
