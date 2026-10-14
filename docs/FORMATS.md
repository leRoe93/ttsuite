# Import- und Exportformate

Alle Dateien werden ausschließlich im Browser gelesen und erzeugt. Nichts wird hochgeladen.

## Import

### click-TT-Teilnehmerdatei (XML) – für das TTVN-Race
Download im click-TT-Turnierportal (Teilnehmer als XML). Im Turnierplaner per Dateiauswahl oder Drag & Drop direkt übernommen (ohne Assistent); spontane Teilnehmende über die Schnelleingabe. Adapter: `src/imports/clickTtXml.ts`.

```xml
<!DOCTYPE tournament SYSTEM "http://liga.nu/dtd/TournamentPortal.dtd">
<tournament name="…" tournament-id="…" start-date="2026-11-13" end-date="2026-11-13">
  <competition age-group="Damen/Herren" type="Einzel" start-date="2026-11-13 19:30">
    <players>
      <player type="single" id="PLAYER1">
        <person lastname="…" firstname="…" club-name="…" club-nr="…" licence-nr="…"
                internal-nr="NU…" sex="1" birthyear="1990" ttr="1534" ttr-match-count="…"/>
      </player>
```

- Unterstützt: Einzel-Konkurrenzen; bei mehreren Konkurrenzen wird ausgewählt.
- `sex`: 1 = männlich, 2 = weiblich. `ttr` wird als Setzwert verwendet.
- Alle `<person>`-Attribute und die `<tournament>`/`<competition>`-Attribute werden unverändert aufbewahrt (für den Rückexport).
- Sicherheit: eigener XML-Parser ohne Entity-Expansion/DTD-Abruf; Größenlimit 5 MB.

### click-TT (TTVN), kopierte Seiten – Standard im Mannschaftsplaner
Geführter Import (`src/features/team-planner/ClickTtQuickImport.tsx`, Logik in `clickTtImport.ts`, Links in `src/imports/clickTtWeb.ts`). TTSuite lädt keine Seite selbst, es erzeugt nur Links. Erkannt wird automatisch, welche der beiden Seiten eingefügt wurde.

**Verein einmalig festlegen:** TTVN-Vereinssuche öffnen (`ttvn.click-tt.de/…/clubSearch?federation=TTVN&searchFor=…`), Adresse der Vereinsseite (`…clubInfoDisplay?club=1234`) einfügen. Gilt für alle Planungen (`extensions.club`).

**A) Q-TTR-Liste pro Verein – empfohlen.** Alle Spieler des Vereins mit Q-TTR, unabhängig von einer Meldung, ohne Login:
`ttvn.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/ttrFilter?federation=TTVN&filterType=club&clubId=<ID>&date=YYYY-MM-DD&ttrFilter=suchen&WOSubmitAction=ttrFilter`
- Stichtag aus der Planung: 11.05. (Vorrunde) bzw. 11.12. (Rückrunde). Nur Stichtage, die click-TT anbietet, liefern Daten (10/2026: 11.05.2026 und 11.08.2026); vor dem 11.12. verlinkt TTSuite für die Rückrunde die Werte vom 11.05.
- Kopierte Tabelle: `Name, Vorname` und `Q-TTR`. Der Vereinsname und der Stichtag werden von click-TT nicht mitkopiert.
- Wirkung: neue Spieler in den Spielerpool, bekannte Spieler bekommen den neuen Q-TTR. Die Aufstellung bleibt unverändert. Danach „Vorschlag nach Q-TTR“: Mannschaftszahl und -größe wählen, die stärksten Spieler füllen Mannschaft 1, dann 2 … (Q-TTR mit `*` bzw. ohne Wert bleiben im Pool).

**B) Aktuelle Mannschaftsmeldung – optional.** `clubPools?displayTyp=vorrunde|rueckrunde&club=<ID>&contestType=Erwachsene|Damen&seasonName=2026/27` (Nachwuchs → Übersicht `clubPools?club=<ID>`). Übernimmt zusätzlich die gemeldete Aufstellung: Überschrift „Mannschaftsmeldungen 2026/27 - Erwachsene (VR)“, Vereinsname, `Rang` „2.3“, `Q-TTR` (`1234`, `1234*`, `-`), `Status` (SBEM, Reservespieler, Weiblicher Ergänzungsspieler, Nachwuchs-/Senioren-Ergänzungsspieler, Sperrvermerk). Die Aufstellung der Planung wird ersetzt (rückgängig machbar).

**Kopieren:** auf der click-TT-Seite alles markieren (Strg+A) und kopieren, dann einfügen – im Textfeld oder mit Strg+V irgendwo im Planer. Die Menüzeilen über der Tabelle stören nicht: Tabulatoren gewinnen als Trennzeichen, gesucht wird die erste Zeile mit mindestens zwei bekannten Spaltennamen.

**Abgleich:** Spieler werden über Nachname + Vorname erkannt (akademische Titel werden ignoriert: „Dr. Tschirch, Jessica“ = „Tschirch, Dr. Jessica“), bei bekanntem Verein zusätzlich über den Verein.

Beispiele (fiktiv, mit dem echten Seitenaufbau): `sample-data/fiktive_clicktt_qttr_liste_kopiert.txt`, `sample-data/fiktive_clicktt_meldung_kopiert.txt`.

### Tabellen (CSV, TSV, eingefügte Tabellen)
Adapter: `src/imports/tabular.ts`. Vorlagen: „click-TT Mannschaftsmeldung“, „myTischtennis (TTR-Rangliste kopiert)“, „Eigene Tabelle“. Weder click-TT noch myTischtennis bieten ein dokumentiertes Spielerlisten-Exportformat oder eine öffentliche API; die Vorlagen enthalten nur übliche Spaltennamen. Die Zuordnung wird immer angezeigt und ist korrigierbar.

- Trennzeichen automatisch (`;` `,` Tab), Anführungszeichen, BOM, Zeichensatz UTF-8 oder Windows-1252 (Excel).
- Erkannte Spalten (Groß-/Kleinschreibung egal): Name, Nachname, Vorname, Verein, Vereinsnummer, Q-TTR, TTR, Geschlecht, Geburtsjahr/Jahrgang/Geburtsdatum, Lizenz-Nr./Spieler-Nr., Personen-Nr., Mannschaft, Position/Rang, Kennzeichen.
- Kennzeichen-Spalte: `RES`, `SPV`, `WES`, `NES`, `SES`, `JES`, `SBEM`, `D-Kader` (mehrere möglich).
- Mannschaft + Position werden auf Wunsch als Aufstellung übernommen; `SPV` wird als bestehender Sperrvermerk dieser Mannschaft übernommen.
- Nur `TTR` vorhanden: Warnung; Übernahme als Q-TTR nur per ausdrücklicher Option.

Vorlage: `sample-data/fiktive_spieler_mannschaftsmeldung.csv` (fiktiv).

### Duplikate
`src/domain/players/duplicates.ts`: Lizenz-Nr. oder click-TT-Personen-Nr. = sicherer Treffer (Vorschlag „aktualisieren“); gleicher Name + Jahrgang/Verein = unsicherer Treffer (Vorschlag „überspringen“). Abweichende Felder werden angezeigt; Aktion je Zeile wählbar.

## Export

### click-TT-Ergebnisdatei (XML) – „Format nachgebildet“
`src/exports/clickTtResults.ts`. Gleiche Struktur wie die Teilnehmerdatei, ergänzt um:

```xml
<matches>
  <match group="Schweizer System (Runde 1)" nr="1" player-a="PLAYER3" player-b="PLAYER9"
         matches-a="1" matches-b="0" sets-a="3" sets-b="0"
         set-a-1="11" set-b-1="6" … set-a-7="0" set-b-7="0" games-a="33" games-b="11"/>
```

Prüfbericht vor dem Download:
- Fehler, wenn das Turnier nicht aus einer click-TT-Datei stammt (keine Spieler-IDs).
- Spiele nur mit Satzverhältnis → nicht exportiert (click-TT braucht Satzergebnisse).
- Kampflose Spiele → nicht exportiert (Kennzeichnung nicht verifiziert), manuell erfassen.
- Freilose → nicht exportiert (kein Spiel).
- Teilnehmer ohne click-TT-Zuordnung → deren Spiele nicht exportiert.

UTF-8, unverändert hochladen (nicht per E-Mail weiterleiten). Upload im click-TT-Turnierportal über den Ergebnis-Importer, danach Satzergebnisse kontrollieren.

### Weitere Exporte
- Mannschaftsmeldung: CSV (Excel, `;`, UTF-8 mit BOM), JSON (`ttsuite-lineup` v1), Druckansicht/PDF.
- Turnier: Tabelle (CSV), alle Spiele (CSV), Spielzettel/Tabelle drucken.
- Sicherungen (JSON, `format: "ttsuite-backup"`): `kind: "full"` (alle Daten) oder `kind: "tournament"` (ein Turnier). Beim Wiederherstellen wird validiert und vor dem Überschreiben gefragt; ein vorhandenes Turnier wird nie überschrieben, sondern als Kopie angelegt.
