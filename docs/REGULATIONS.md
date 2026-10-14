# Regelwerke: belegt, konfigurierbar, offen

Stand der Recherche: Oktober 2026. Maßgeblich sind immer die aktuelle Wettspielordnung (WO) des DTTB, die Durchführungsbestimmungen des jeweiligen Landesverbands und die Turnierausschreibung. Die App ersetzt nicht die Genehmigung durch Spielleiter oder Turnierreferenten.

Legende: **belegt** = in einer amtlichen bzw. Verbandsquelle gefunden · **Interpretation** = Regel ist belegt, die Umsetzung im Detail nicht vorgegeben · **Annahme** = nicht abschließend belegt, deshalb konfigurierbar oder als Hinweis statt Fehler.

## 1. Mannschaftsmeldung (Mannschaftsplaner)

Ebene: national (DTTB-WO Abschnitt H) mit regionalen Abweichungen. Umgesetzt im Regelwerk `dttb-wo-h-2026` (`src/domain/team-rules/ruleSets.ts`), Prüfung in `validate.ts`.

| Regel | Umsetzung | Status | Quelle |
|---|---|---|---|
| Reihenfolge nach Q-TTR; Stichtag 11.05. (VR) bzw. 11.12. (RR) | Q-TTR ist der einzige Wert für Reihenfolgeprüfungen; aktueller TTR wird nicht stillschweigend ersetzt | belegt | HTTV-Infoblatt VR 2026/27; HTTV-Richtlinien Spielleiter |
| Innerhalb einer Mannschaft max. 35 Punkte, über die gesamte Meldung max. 50 Punkte (Erwachsene) | Paarweiser Vergleich jedes Spielers mit allen vor ihm gemeldeten | belegt | HTTV 2026, BeTTV 2023/24 |
| Nachwuchs (SBEM/JES) in Erwachsenen-Meldung: 70/85; Altersklasse Nachwuchs: 70/85; D-Kader und höher: 105/120 | Toleranz richtet sich nach dem *hinten* gemeldeten (stärkeren) Spieler | belegt / Interpretation (wessen Status zählt) | HTTV-Richtlinien, BeTTV |
| Spieler ohne vergleichbaren Q-TTR ordnet der Spielleiter ein | Hinweis, keine Reihenfolgeprüfung für diesen Spieler | belegt | WO H 2.2 (zit. BeTTV) |
| Abweichung > Toleranz über Mannschaften nur zur Vorrunde, auf Antrag, mit Sperrvermerk (SPV) | VR: Fehler, bis „Abweichung mit SPV beantragen“ gesetzt ist, dann Hinweis + abgeleiteter SPV. RR: Fehler | belegt | WO H 2.4 (zit. HTTV/BeTTV) |
| SPV-Folge: alle in derselben Mannschaft *davor* gemeldeten Spieler erhalten ebenfalls einen SPV | abgeleitete SPV „Folge“ | belegt | HTTV 2026, BeTTV |
| SPV gilt längstens bis Saisonende | Alter SPV in einer neuen Vorrunde → Hinweis „prüfen“ | belegt | HTTV 2026, BeTTV |
| Spieler mit SPV dürfen nicht als Ersatz in höheren Mannschaften spielen | Info-Hinweis (Einsatzplanung ist nicht Teil der Meldung) | belegt | WO I 4.3 (myTischtennis-Regelecke) |
| In der Rückrunde kein Aufrücken in eine höhere Mannschaft, auch wenn der SPV auf Antrag entfällt | Fehler bei Meldung in höherer Mannschaft als der SPV-Mannschaft | belegt | WO H 2.4 (Regelecke) |
| Ergänzungsspieler (WES/NES/SES) nach Spielstärke melden; dürfen keinen SPV erhalten oder auslösen | Fehler, wenn ein Ergänzungsspieler eine Abweichung auslöst oder einen Folge-SPV bekäme | belegt | HTTV-Richtlinien, BeTTV (WO H 1.4) |
| Reservespieler (RES) nur in Erwachsenen-Meldungen; RES/Ergänzungsspieler zählen nicht zur Sollstärke | Fehler RES bei Nachwuchs; Zählung Stammspieler | belegt | WO A 5.3 (STTV-WO-Fassung) |
| Mindestens Sollstärke an Stammspielern je Mannschaft | Hinweis (konfigurierbar: Fehler/Hinweis/aus) | **Annahme** | – |
| RES-Status (weniger als 3 Einzel in der Vorhalbserie) | wird nicht automatisch berechnet; RES wird manuell oder per Import gesetzt | belegt, nicht automatisiert | WO H 1.3.1 (HTTV 2026) |

Regional abweichend bekannt: STTV nutzt LivePZ statt Q-TTR (WO A 17.2 der STTV-Fassung). Für solche Fälle gibt es „Für meinen Verband anpassen…“ (eigenes Regelwerk mit editierbaren Toleranzen, als „Eigene Anpassung“ gekennzeichnet).

## 2. TT-Race (Turnierplaner)

Ebene: Turnierserie des BTTV („Bavarian TT-Race“) auf Basis WO D 7.6 (Schweizer System) bzw. WO D 7.5 (Jeder gegen Jeden). Umsetzung: `src/domain/pairing/ttRace.ts`, `src/domain/tournament/standings.ts`.

| Regel | Umsetzung | Status | Quelle |
|---|---|---|---|
| Schweizer System über 6 Runden (ideal 9–16 Teilnehmer); 7–8 Teilnehmer „Jeder gegen Jeden“ | `system: auto`, Schwelle 8 konfigurierbar; Rundenzahl editierbar | belegt | BTTV „Infos Spielsystem“ |
| Rundenzahl mindestens wie K.-o.-System, ideal +2 | Warnung bei zu wenigen Runden | belegt | WO D 7.6 (zit. BTTV/BEMSen-L) |
| Runde 1: stärkste Spieler gesetzt, Rest gelost | Obere Hälfte nach TTR gesetzt, gegen geloste Gegner aus der unteren Hälfte | belegt / **Interpretation** (Anzahl Gesetzter) | BTTV, BEMSen-L 2025 |
| Folgerunden: nach Siegen sortiert, innerhalb gleicher Siege so viele neue Paarungen wie möglich, beginnend oben; wer keinen Gegner in der Gruppe hat, erhält einen aus der nächsttieferen Gruppe; Sieglose zuletzt | Deterministisches Backtracking: höchster ungepaarter Spieler wählt zuerst, Kandidaten zuerst aus eigener Gruppe, dann tiefere Gruppen | belegt / Interpretation (Backtracking statt globaler Optimierung) | BTTV |
| Gleichstand in der Siegesgruppe wird vor der Auslosung über Buchholz sortiert | Reihenfolge Siege → Buchholz → Los | belegt | BTTV, BEMSen-L |
| Gegner innerhalb der Gruppe gelost | Standard „gelost“ (reproduzierbar per Startwert), Option „nach Tabellenplatz“ | belegt / Interpretation | BTTV-Präsentation („jede Runde neu gelost“) |
| Keine Paarung zweimal | harte Bedingung; ist keine Auslosung möglich, wird der Konflikt erklärt. Option „Wiederholung nur wenn unvermeidbar“ als Ausrichter-Entscheidung | belegt (BTTV-Seite: „bevorzugt“, Präsentation: „keine“) | BTTV, BEMSen-L |
| Freilos bei ungerader Zahl, zählt als Sieg, niemand zweimal | Freilos an den tiefstplatzierten Spieler ohne Freilos, für den der Rest paarbar ist; Runde 1: unter der unteren Hälfte gelost | belegt / Interpretation (wer genau) | BTTV, BEMSen-L |
| Wertung: Siege → Buchholz (Summe der Siege der Gegner; Freilos zählt mit den Siegen des Tabellenletzten) → direkter Vergleich → Los | so umgesetzt; direkter Vergleich nur, wenn alle Gleichplatzierten gegeneinander gespielt haben (Mini-Tabelle), sonst nächstes Kriterium | belegt / Interpretation (Mehrfachgleichstand) | BTTV „Infos Spielsystem“ |
| Letztes Kriterium „niedrigerer Q-TTR vorne“ | Option, Standard ist „Los“ | widersprüchliche Quellen (BTTV-Seite: Los; BTTV-Präsentation/BEMSen: niedrigerer Q-TTR) | – |
| Aufgabe/Abmeldung: Siege bleiben, jede weitere Runde = kampflose Niederlage | umgesetzt (Abmeldung nach Runde n) | belegt | BTTV |
| Spielmodus (Gewinnsätze) | konfigurierbar 3/5/7, Standard Best of 5 | nicht auf der TT-Race-Seite geregelt | – |
| Satzregeln (11 Punkte, ab 10:10 zwei Punkte Vorsprung) | Validierung jeder Satzeingabe | belegt (ITTF/DTTB-Tischtennisregeln) | – |

## 3. Datenformate (siehe FORMATS.md)

| Thema | Status |
|---|---|
| click-TT-Teilnehmerdatei (XML, `TournamentPortal.dtd`) | Struktur an echten, öffentlich veröffentlichten Dateien verifiziert (Open-Source-Projekt ttSchweizer, Bavarian TT-Race 2015). Keine offizielle Spezifikation von nuLiga gefunden. |
| click-TT-Ergebnisdatei (gleiche Struktur + `<matches>`) | Wie oben verifiziert; Kennzeichnung kampfloser Spiele **nicht** verifiziert → werden nicht exportiert, sondern als „manuell in click-TT erfassen“ gemeldet. In der UI als „Format nachgebildet“ gekennzeichnet. |
| Ablauf: Teilnehmer aus click-TT laden → Turniersoftware → Ergebnis-Importer | belegt (HTTV-Anleitung Turniermodul, TTT2020-FAQ, TTC-Handbuch) |
| Spieler-IDs (`PLAYERn`) ändern sich bei jedem Download | belegt (TTT2020-FAQ) → Teilnehmerdatei vor dem Export ggf. neu laden |
| Spielerlisten aus click-TT | Die Mannschaftsmeldung eines Vereins (Rang, Q-TTR, Name, Status) ist öffentlich ohne Login einsehbar (geprüft 10/2026). Kein CORS-Zugriff von fremden Domains, keine veröffentlichten Bedingungen für automatisierten Abruf → TTSuite verlinkt die Seite, der Nutzer kopiert und fügt ein. Kein Scraping. |
| Spielerlisten aus myTischtennis | TTR-Ranglisten nur mit Login; keine öffentliche API → nur selbst kopierte Tabellen. |
| nuLiga-API | existiert, nur mit Zugangsdaten des Verbands; liefert nach verfügbaren Informationen Mannschaften/Ergebnisse, keine Spieler mit TTR. |

## 4. Offene Punkte / nicht umgesetzt

- Mindestanzahl Stammspieler je Mannschaft (Sollstärke-Regel) und ligaspezifische Sollstärken.
- Automatische Ermittlung des RES-Status aus Einsatzdaten.
- Einsatzplanung von Ersatzspielern (Festspielen, WO I) – nur als Hinweis zum SPV abgebildet.
- Regionale Sonderregeln einzelner Landesverbände außer per eigenem Regelwerk.
- Kennzeichnung von w.o.-Spielen im click-TT-Ergebnis-XML.
- Doppel-Konkurrenzen, Mannschaftsturniere, Gruppen- und K.-o.-Systeme.

## Quellen

- HTTV – Infoblatt Mannschaftsmeldung Vorrunde 2026/27: https://www.httv.de/media/000/News/2026/Juni/Newsletter_MM_Infoblatt_VR_2026.pdf
- HTTV – Richtlinien für Spielleiter: https://www.httv.de/media/000/Handbuch/2023-2024/HTTV-Richtlinien-Spielleiter.pdf
- BeTTV – Wichtige Informationen zur Mannschaftsmeldung 2023/24: https://www.bettv.de/news/wichtige-informationen-zur-mannschaftsmeldung-2023-2024/
- myTischtennis Regelecke – Aufrücken nach Sperrvermerk-Wegfall: https://www.mytischtennis.de/training-service/regelecke/regelecke-zur-ruckrunde-nach-sperrvermerk-wegfall-aufrucken
- STTV – Wettspielordnung (Stand 01.07.2025): https://www.global.hs-mittweida.de/~sttv0/sttv/images/files/Handbuch%20des%20STTV/03_WO_Stand_01.07.25_08.07.2025_STTV_angepasst_Farbe.pdf
- BTTV – Bavarian TT-Race, Infos Spielsystem: https://www.bttv.de/sport/bavarian-tt-race/infos-spielsystem/
- BTTV – Präsentation Schweizer System: https://unterallgaeu-west.bttv.de/fileadmin/bttv/media/303/Datei%20pdf/Praesentation_Schweizer_System.pdf
- BTTV – BEMSen-L Schweizer System (2025): https://www.bttv.de/fileadmin/bttv/media/000/senioren/es/2025_BEMSenL/BEMSenL-SchweizerSystem.pdf
- HTTV – Anleitung Junior-Cup Turniermodul (Ergebnis-Importer): https://www.httv.de/media/000/Junior-Cup/Anleitung-Junior-Cup_Turniermodul_Final.pdf
- TTT2020 – FAQ Export/Import mit click-TT: https://www.hesowa.de/support/faq/click-tt/
- Turnierservice (TTC) – ClickTT Import/Export: https://turnier-service.org/handbook/handbooktt_std/clicktt/
- ttSchweizer (Open Source, Beispieldateien click-TT-XML): https://github.com/tgfuellner/ttSchweizer
