# Architektur

Statische Single-Page-App (React 19 + TypeScript), gebaut mit esbuild. Kein Backend, keine Konten, keine Telemetrie, keine externen Laufzeitdienste.

```
src/
  app-shell/        Shell, Navigation, Hash-Router, Feature-Registry
  features/         Ein Ordner pro Werkzeug, registriert sich selbst
    team-planner/   Mannschaftsplaner (UI, Undo-Historie)
    tournament-planner/  TT-Race (Teilnehmer, System, Runden, Tabelle, Export)
    data-manager/   Sicherung, Wiederherstellung, Löschen
    shared/         Feature-übergreifende UI: Import-Assistent, Spieler-Editor
  domain/           Reine Fachlogik – kein React, kein DOM
    players/        Spielermodell, Normalisierung, Duplikate
    team-rules/     Meldungsmodell, Regelwerke, Prüf-Engine (inkl. Sperrvermerk)
    tournament/     Turniermodell, Ergebnisse, Tabelle, Workflow
    pairing/        TT-Race-Auslosung (Schweizer System, Jeder gegen Jeden)
  imports/          Quell-Adapter (CSV/Tabelle, click-TT-XML) → gemeinsames Modell
  exports/          click-TT-Ergebnis-XML, CSV/JSON
  storage/          localStorage-Persistenz, Migration, Sicherungen, Service Worker
  shared-ui/        Komponenten, Icons, Drag & Drop, Styles
  lib/              XML-Parser, deterministischer Zufall, Downloads
tests/              node:test – Fachlogik, Importe, Exporte, Speicher
scripts/            build.mjs (esbuild), e2e-smoke.mjs (Playwright, optional)
```

## Prinzipien

- **Fachlogik getrennt von UI.** `domain/`, `imports/`, `exports/`, `storage/store.ts` importieren nie React. Alle Zustandsübergänge sind reine Funktionen (`(Zustand, Eingabe) → neuer Zustand | Fehler mit Erklärung`) und direkt testbar.
- **Ein Spielermodell.** `Player` trennt Anzeigedaten, regelrelevante Attribute (`rules`) und Herkunft (`meta`). UI-Zustand liegt nie im Modell. Turnier-Teilnehmer sind Schnappschüsse, damit spätere Änderungen im Spielerpool laufende Turniere nicht verändern.
- **Adapter-Muster für Quellen.** Jeder Import liefert `ImportPreview` (Kandidaten + Probleme); Vorschau, Zuordnung und Duplikat-Entscheidung passieren danach einheitlich im Assistenten.
- **Regeln als Daten.** `LineupRuleSet` enthält Toleranzen, SPV-Zeitpunkt, Schweregrade, Quellen und Verifikationsstatus je Regel. Eigene Regelwerke sind Kopien mit Kennzeichnung.
- **Deterministische Auslosung.** Jede Auslosung hängt nur von Turnierzustand + gespeichertem Startwert ab (mulberry32). Gleiche Eingabe → gleiche Paarung; Ergebnisse sind nachvollziehbar und testbar.
- **Erklären statt still scheitern.** Die Prüf-Engine liefert Findings mit Schweregrad, Text, WO-Verweis und betroffenen Spielern; die Auslosung liefert bei Unmöglichkeit eine Begründung.

## Erweiterung um ein neues Werkzeug

1. `src/features/<werkzeug>/index.tsx` anlegen und `registerFeature({ id, path, title, description, icon, component, order })` aufrufen.
2. Eine Importzeile in `src/features/index.ts`.
3. Eigene Daten unter `AppData.extensions[<id>]` ablegen (oder ein eigenes Slice mit Migration in `storage/store.ts`).

Navigation, Startseite und Routing übernehmen das Werkzeug automatisch. Bestehende Features werden nicht angefasst.

## Technologieentscheidungen

| Entscheidung | Begründung / Trade-off |
|---|---|
| React + TypeScript | verbreitet, gut wartbar; Domain-Code ist framework-unabhängig |
| esbuild statt Vite | eine Build-Abhängigkeit, ~0,1 s Builds, eingebauter Dev-Server. Vite brächte HMR und Plugins, ist für diesen Umfang aber nicht nötig; ein Umstieg ist trivial (gleiche Struktur, `index.html` + `src/main.tsx`). |
| Eigenes Pointer-Drag-and-Drop | Maus, Touch und Stift ohne Bibliothek (~150 Zeilen); Tastaturalternative über Pfeil-Buttons und Menüs. Eine Bibliothek wie dnd-kit wäre bei komplexeren Interaktionen sinnvoll. |
| Hash-Routing | läuft auf jedem statischen Host ohne Rewrite-Regeln |
| localStorage statt IndexedDB | Datenmengen eines Vereins (Hunderte Spieler, einige Turniere) liegen weit unter 1 MB; synchrone API, einfache Mehr-Tab-Erkennung. Die Speicherschicht ist hinter `KeyValueStore` gekapselt; ein IndexedDB-Adapter kann sie ersetzen. |
| Node-Test-Runner + tsx | keine Testframework-Abhängigkeit |
| Eigener XML-Parser | sicher (kein XXE), identisch im Browser und in Tests |

## Persistenz und Zuverlässigkeit

- Speichern verzögert (400 ms) und beim Schließen/Verlassen der Seite.
- Beschädigte Daten werden nicht überschrieben; Rohdaten sind herunterladbar.
- Änderungen in einem anderen Tab werden erkannt; Hinweis zum Neuladen statt stillem Überschreiben.
- Speicher voll / nicht verfügbar → sichtbarer Hinweis.
- Schema-Version + `migrate()` für künftige Datenänderungen.
- Service Worker cacht nur die App-Dateien (offline nutzbar nach dem ersten Laden).
