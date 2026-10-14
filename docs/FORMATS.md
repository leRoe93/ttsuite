# Import- und Exportformate

Alle Dateien werden ausschließlich im Browser gelesen und erzeugt. Nichts wird hochgeladen.

## Import

### click-TT-Teilnehmerdatei (XML) – empfohlen für TT-Races
Download im click-TT-Turnierportal (Teilnehmer → XML). Adapter: `src/imports/clickTtXml.ts`.

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

### click-TT Mannschaftsmeldung (öffentliche Seite, kopiert) – empfohlen für den Mannschaftsplaner
Im Mannschaftsplaner führt „click-TT ↗“ zur öffentlichen Seite „Mannschaftsmeldungen“ des Vereins (`src/imports/clickTtWeb.ts`, `src/features/team-planner/ClickTtLinks.tsx`). TTSuite lädt diese Seite nicht selbst (click-TT erlaubt keinen Abruf von fremden Domains, Nutzungsbedingungen für automatisierten Abruf unbekannt); es erzeugt nur Links.

- Landesverband wählen, Verein über die click-TT-Vereinssuche finden, Adresse der Vereinsseite (`…clubInfoDisplay?club=12345`) oder die Vereinsnummer einfügen. Verband und Verein werden in der Planung gespeichert.
- Erwachsene: direkter Link `clubPools?displayTyp=vorrunde|rueckrunde&club=<ID>&contestType=Erwachsene&seasonName=2026/27`. Nachwuchs: Link auf die Übersicht aller Meldungen (`clubPools?club=<ID>`), weil die Saisonnamen je Verband verschieden sind.
- Alle Verbände laufen auf derselben nuLiga-Instanz; Vereinsnummern sind bundesweit eindeutig. Geprüfte Verbandskürzel für die Suche: TTBW, ByTTV, BTTV (Berlin), TTVB, FTTB, HaTTV, HeTTV, TTVMV, TTVN, WTTV, PTTV, RTTVR, STTB, STTV, TTVSA, TTVSH, TTTV, DTTB.
- Auf der click-TT-Seite alles markieren und kopieren, im Import einfügen. Erkannt werden die Kopfzeile unterhalb der Titelzeilen, der Vereinsname, `Rang` „2.3“ = Mannschaft 2 / Position 3, `Q-TTR` („-“ = ohne Wert), `Name, Vorname` und `Status` (Reservespieler → RES, SBEM). Fehlende Mannschaften werden angelegt.
- Frühere Spielzeiten zeigt click-TT nur mit Login.

Beispiel (fiktiv): `sample-data/fiktive_clicktt_meldung_kopiert.txt`.

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
