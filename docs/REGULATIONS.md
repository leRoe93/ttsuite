# Regelwerke: belegt, interpretiert, offen

**TTSuite ist für den Tischtennis-Verband Niedersachsen (TTVN) gemacht.** Regeln, click-TT-Links und das Turniersystem folgen den Vorgaben des TTVN. In anderen Verbänden sind die Werkzeuge nicht zwingend kompatibel (z. B. andere Toleranzen, andere Auslosung beim TT-Race).

Stand der Recherche: Oktober 2026. Maßgeblich sind die Wettspielordnung (WO) mit den Ausführungsbestimmungen des TTVN und die Vorgaben zum TTVN-Race. Die App ersetzt nicht die Genehmigung durch Spielleiter oder Turnierleitung.

Legende: **belegt** = in einer TTVN-Quelle gefunden · **Interpretation** = Regel ist belegt, das Detail nicht · **Annahme** = nicht belegt, deshalb als Hinweis statt Fehler.

## 1. Mannschaftsmeldung (Mannschaftsplaner)

Regelwerk `ttvn-wo-h-2026` (`src/domain/team-rules/ruleSets.ts`), Prüfung in `validate.ts`.

| Regel | Umsetzung | Status | Quelle |
|---|---|---|---|
| Reihenfolge nach Q-TTR; Stichtag 11.05. (VR) bzw. 11.12. (RR) | Nur Q-TTR zählt; der aktuelle TTR ersetzt ihn nicht | belegt | TTVN Termine & Infos 2026/27 |
| Innerhalb einer Mannschaft max. 35, über die gesamte Meldung max. 50 Punkte (WO H 2.3) | Paarweiser Vergleich mit allen davor Gemeldeten | belegt | dto. |
| Nachwuchs (inkl. Jugend 19) +35 → 70/85 | gilt für Nachwuchs-Meldungen und SBEM-Spieler in Erwachsenen-Meldungen | belegt / Interpretation (SBEM) | dto. |
| Landeskader oder höher +70 → 105/120, **nur Erwachsene** | Kennzeichen am Spieler; wirkt nur in Erwachsenen-/Damen-Meldungen | belegt | dto. |
| Q-TTR mit `*` (weniger als 10 Einzel) bzw. ohne Wert: Spielleiter ordnet ein, Vereinsvorschlag | Hinweis; Spieler wird in keiner Reihenfolge-Prüfung verglichen | belegt | dto. (WO H 2.2) |
| Sperrvermerk zu Beginn der **Vorrunde oder Rückrunde** (Verbleib in der bisherigen Mannschaft statt Aufrücken, Wiederherstellung der Sollstärke) bzw. auf Antrag bei Meldung in tieferer Mannschaft (WO H 2.4) | Abweichung > Toleranz = Fehler, bis „Abweichung mit Sperrvermerk beantragen“ gesetzt ist; in der Rückrunde mit Hinweis auf die Bedingung | belegt | dto. |
| SPV-Folge: alle in derselben Mannschaft davor Gemeldeten erhalten ebenfalls einen SPV | abgeleitete SPV „Folge“ | belegt | dto. |
| Ergänzungsspieler (WES/NES/SES) erhalten und verursachen keinen SPV | Fehler | belegt | dto. (WO H 1.4) |
| SPV gilt längstens bis Saisonende; Aufheben zur RR nur auf Antrag, kein Aufrücken in höhere Mannschaft | SPV aus click-TT gilt für genau die importierte Meldung; alter SPV in neuer Vorrunde → Hinweis; RR: Meldung in höherer Mannschaft → Fehler | belegt | dto., myTischtennis-Regelecke |
| Spieler mit SPV nicht als Ersatz in höheren Mannschaften | Info | belegt | WO I 4.3 (Regelecke) |
| Reservespieler (RES) nur bei Erwachsenen; RES/Ergänzungsspieler zählen nicht zur Sollstärke | Fehler bzw. Zählung | belegt | WO A 5.3, H 1.3 |
| Damen-Meldung getrennt von Erwachsenen | eigene Planungsart „Damen“, Link mit `contestType=Damen` | belegt (click-TT TTVN) | ttvn.click-tt.de |
| Mindestens Sollstärke an Stammspielern | Hinweis | **Annahme** | – |
| RES-Status (weniger als 3 Einzel) | wird aus click-TT übernommen, nicht berechnet | belegt, nicht automatisiert | TTVN Termine & Infos |

## 2. TTVN-Race (Turnierplaner) – MKTT Cup-System

Quelle: TTVN „Infos Spielsystem“ und das Dokument „TTVN_Race_MKTT_Cup_System.pdf“. Umsetzung: `src/domain/pairing/ttRace.ts`, `src/domain/tournament/standings.ts`.

| Regel | Umsetzung | Status |
|---|---|---|
| 6 Runden, ideal 9–16 Teilnehmende; bei 7–8 „Jeder gegen Jeden“ mit 7 Runden | automatisch | belegt |
| Runde 1: Setzung nach Q-TTR, jeder der oberen Hälfte gegen dieselbe Position der unteren Hälfte (1–9, 2–10 … 8–16); ungerade Zahl → Freilos für den Spieler in der Mitte | so umgesetzt; gleicher Q-TTR → Los; ohne Wert ganz unten | belegt |
| Runden 2–4: in jeder Ergebnisgruppe der Erste gegen den Letzten (1–8, 2–7, 3–6, 4–5); ungerade Gruppe bzw. „schon gegen alle gespielt“ → von unten ergänzt | Ergebnisgruppe = gleiche Siegzahl; Reihenfolge = aktuelle Tabelle; Backtracking, falls eine Paarung nicht aufgeht | belegt / Interpretation (Ergebnisgruppe = Siegzahl, Beispiele im Dokument) |
| Runden 5–6: direkte Tabellennachbarn (1–2, 3–4 …), abhängig von bereits gespielten Paarungen | nächster noch nicht gespielter Nachbar | belegt / Interpretation (Auflösung bei bereits gespielten Nachbarn) |
| Freilos höchstens einmal pro Spieler, Vergabe von der Mitte nach unten, sonst von der Mitte nach oben | so umgesetzt | belegt |
| Keine Paarung zweimal | harte Bedingung; Konflikt wird erklärt; Ausrichter kann „Wiederholung nur wenn unvermeidbar“ zulassen | belegt |
| Wertung: Siege → Buchholz → Feinbuchholz → Satzdifferenz → gewonnene Sätze | so umgesetzt; danach Los (reproduzierbar) | belegt (Los: Interpretation) |
| Freilos in der Buchholz | Freilos zählt mit den Siegen des Tabellenletzten (Praxis des BTTV); im TTVN-Dokument nicht geregelt | **offen** – bitte mit MKTT abgleichen |
| Aufgabe: Siege bleiben, jede weitere Runde kampflose Niederlage (nicht TTR-relevant) | so umgesetzt; kampflose Spiele nicht im click-TT-Export | belegt |
| Gewinnsätze | einstellbar (Standard Best of 5) | nicht im Dokument geregelt |

## 3. Datenformate (siehe FORMATS.md)

| Thema | Status |
|---|---|
| Öffentliche Q-TTR-Liste pro Verein (TTVN) | alle Spieler eines Vereins mit Q-TTR, ohne Login, eindeutig per `clubId` und Stichtag verlinkbar (geprüft 10/2026). Nur von click-TT angebotene Stichtage liefern Daten. |
| Öffentliche click-TT-Mannschaftsmeldung des TTVN | geprüft an 743 echten Zeilen (10/2026): Rang `n.m`, Q-TTR `1234`/`1234*`/`-`, Status „SBEM“, „Reservespieler“, „Weiblicher Ergänzungsspieler“, „Sperrvermerk“, „Nachmeldung ab …“. TTSuite verlinkt nur, kein automatischer Abruf. |
| click-TT-Teilnehmerdatei (XML) | Struktur an veröffentlichten Beispieldateien verifiziert; keine offizielle Spezifikation. |
| click-TT-Ergebnisdatei (XML) | nachgebildet; w.o.-Spiele werden nicht exportiert. Vor Echteinsatz mit dem Ergebnis-Importer testen. Im TTVN ist MKTT die übliche Turniersoftware. |
| myTischtennis | nur mit Login, keine API → nur selbst kopierte Tabellen. |

## 4. Offene Punkte

- Buchholz-Wertung eines Freiloses im MKTT Cup-System.
- Mindestanzahl Stammspieler und ligaabhängige Sollstärken im TTVN.
- Ersatzspieler-Einsatzplanung (WO I) nur als Hinweis.
- Doppel, Mannschaftsturniere, K.-o.-Systeme.

## Quellen

- TTVN – Termine und Infos zur neuen Spielzeit 2026/27 (Stand 22.05.26): https://www.ttvn.de/fileadmin/_gemeinsame/Dokumente/20260522_Termine_und_Infos_zur_neuen_Spielzeit_2026_27.pdf
- TTVN – Wettspielordnung und Ausführungsbestimmungen (Stand 11.04.2026): https://www.ttvn.de/fileadmin/_gemeinsame/Dokumente/Wettspielordnung_Ausfuehrungsbestimmungen.pdf
- TTVN – TTVN-Race, Infos Spielsystem: https://www.ttvn.de/turniere/ttvn-race/infos-spielsystem/
- TTVN – MKTT Cup-System (PDF): https://www.ttvn.de/fileadmin/_gemeinsame/Dokumente/TTVN_Race_MKTT_Cup_System.pdf
- myTischtennis Regelecke – Aufrücken nach Sperrvermerk-Wegfall: https://www.mytischtennis.de/training-service/regelecke/regelecke-zur-ruckrunde-nach-sperrvermerk-wegfall-aufrucken
- click-TT TTVN (öffentliche Vereinsseiten): https://ttvn.click-tt.de/
