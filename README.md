# TTSuite – Tischtennis-Toolkit

Rein clientseitige Web-App für Tischtennisvereine im **Tischtennis-Verband Niedersachsen (TTVN)**.

> **Nur für den TTVN gemacht.** Regeln, click-TT-Links (ttvn.click-tt.de) und das Turniersystem (MKTT Cup-System des TTVN-Race) folgen den Vorgaben des TTVN. In anderen Verbänden sind die Werkzeuge nicht zwingend kompatibel.

Werkzeuge:

- **Mannschaftsplaner** – Mannschaftsmeldung des Vereins in click-TT öffnen, ganze Seite kopieren, einfügen: Spieler, Q-TTR (inkl. `*`), Mannschaften, Positionen, RES/WES/SBEM und Sperrvermerke sind in einem Schritt da (auch per Strg+V irgendwo auf der Seite). Danach per Drag & Drop umstellen und nach TTVN-Regeln prüfen: Q-TTR-Reihenfolge 35/50 (Nachwuchs 70/85, Landeskader 105/120), Sperrvermerk zur Vor- und Rückrunde inkl. Folge-SPV, Ergänzungsspieler. Erwachsene, Damen, Nachwuchs. Undo/Redo, Export CSV/JSON/Druck.
- **Turnierplaner (TTVN-Race)** – click-TT-Teilnehmerdatei per Auswahl oder Drag & Drop, Schnelleingabe für spontane Teilnehmende, Auslosung nach MKTT Cup-System (Runde 1 obere gegen untere Hälfte, Runden 2–4 Erster gegen Letzten der Ergebnisgruppe, ab Runde 5 Tabellennachbarn), Wertung Siege → Buchholz → Feinbuchholz → Satzdifferenz → Sätze, Ergebnisexport für click-TT, Sicherung.

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

- `sample-data/fiktive_clicktt_meldung_kopiert.txt` – erfundene Mannschaftsmeldung, so wie sie beim Kopieren der click-TT-Seite entsteht.
- `sample-data/fiktive_spieler_mannschaftsmeldung.csv` – 22 erfundene Spieler als CSV-Liste.
- `sample-data/fiktives_tt-race_clicktt_teilnehmer.xml` – 13 erfundene Teilnehmer im Aufbau der click-TT-Teilnehmerdatei.

## Dokumentation

- [docs/REGULATIONS.md](docs/REGULATIONS.md) – umgesetzte Regeln mit Quellen, Interpretationen, offene/unbelegte Punkte
- [docs/FORMATS.md](docs/FORMATS.md) – Import- und Exportformate
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – Aufbau, Erweiterung um neue Werkzeuge, Technologie-Abwägungen

## Wichtige Einschränkungen

- click-TT und myTischtennis bieten keine offene API. TTSuite verlinkt die öffentliche click-TT-Mannschaftsmeldung; die Tabelle wird dort kopiert und eingefügt. Es gibt keinen automatischen Abruf.
- Das click-TT-Ergebnis-XML ist nach öffentlich verfügbaren Beispieldateien nachgebildet, nicht offiziell spezifiziert. Kampflose Spiele werden nicht exportiert. Vor dem ersten Echteinsatz mit dem click-TT-Ergebnis-Importer testen.
- Nur für den TTVN; Regeln ohne Gewähr. Die Prüfung ersetzt nicht den Spielleiter.
- Browser-Speicher kann beim Löschen der Browserdaten verloren gehen – regelmäßig sichern.

## Erweiterungspunkte

- Neues Werkzeug: `registerFeature()` in `src/features/<tool>/index.tsx` + eine Importzeile (siehe ARCHITECTURE.md).
- Neue Datenquelle: Adapter nach `ImportAdapter`-Muster in `src/imports/`, liefert `ImportPreview`.
- Neues Regelwerk: `LineupRuleSet` in `src/domain/team-rules/ruleSets.ts`.
- Weitere Turnierformate: neues Pairing-Modul in `src/domain/pairing/`, `PairingSystem` erweitern.
- Speicher-Backend: `KeyValueStore`-Implementierung (z. B. IndexedDB).
- Weitere Exporte: Funktionen in `src/exports/` auf Basis der Domänenmodelle.
