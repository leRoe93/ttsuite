import { fullName } from '../domain/players/model.ts';
import type { Tournament } from '../domain/tournament/model.ts';
import { attrsToString } from '../lib/xml.ts';

/**
 * click-TT result file (Ergebnis-Importer im click-TT-Turnierportal).
 *
 * The structure mirrors the participant file downloaded from click-TT and adds a <matches> block:
 *   <match group nr player-a player-b matches-a matches-b sets-a sets-b set-a-1 … set-b-7 games-a games-b/>
 * Verified against real result files of the Bavarian TT-Race published in the open-source project
 * ttSchweizer. There is no public specification from nuLiga; the file is therefore labelled
 * "nachgebildet" in the UI and must be checked with the click-TT Ergebnis-Importer.
 *
 * Constraints taken from TTT2020/TTC documentation:
 *  - player ids (PLAYERn) and the tournament/competition must match the current click-TT download,
 *  - players not present in click-TT cannot be exported (their matches are skipped),
 *  - the file must be uploaded unchanged (UTF-8, no re-encoding by mail clients).
 */

export type CheckSeverity = 'error' | 'warning' | 'info';
export interface ExportCheck {
  severity: CheckSeverity;
  message: string;
}

export interface ClickTtExport {
  xml?: string;
  checks: ExportCheck[];
  exportedMatches: number;
  skippedMatches: number;
}

const MAX_SETS = 7;

export function buildClickTtResultXml(t: Tournament): ClickTtExport {
  const checks: ExportCheck[] = [];
  if (!t.clickTt) {
    return {
      checks: [
        {
          severity: 'error',
          message:
            'Dieses Turnier wurde nicht aus einer click-TT-Teilnehmerdatei erstellt. click-TT ordnet Ergebnisse über die Spieler-IDs der Teilnehmerdatei zu – bitte die Teilnehmer per click-TT-XML importieren oder den CSV-Export nutzen und die Ergebnisse manuell erfassen.',
        },
      ],
      exportedMatches: 0,
      skippedMatches: 0,
    };
  }
  const { tournament, competitionIndex } = t.clickTt;
  const comp = tournament.competitions[competitionIndex];
  if (!comp) return { checks: [{ severity: 'error', message: 'Konkurrenz aus der click-TT-Datei nicht gefunden.' }], exportedMatches: 0, skippedMatches: 0 };
  if (!tournament.attrs['tournament-id']) checks.push({ severity: 'error', message: 'Die click-TT-Datei enthält keine tournament-id.' });

  const clickParticipants = t.participants.filter((p) => p.player.meta.source === 'click-tt-xml' && p.player.meta.sourceRef);
  const refOf = new Map(clickParticipants.map((p) => [p.id, p.player.meta.sourceRef!]));
  const others = t.participants.filter((p) => !refOf.has(p.id));
  if (others.length)
    checks.push({
      severity: 'warning',
      message: `${others.length} Teilnehmer ohne click-TT-Zuordnung (${others.map((p) => fullName(p.player)).join(', ')}) – deren Spiele werden nicht exportiert. Spieler zuerst in click-TT nachmelden, Teilnehmerdatei neu laden.`,
    });

  const matchLines: string[] = [];
  let nr = 0;
  let skipped = 0;
  let walkovers = 0;
  let missingSets = 0;
  let open = 0;
  for (const round of t.rounds) {
    const group = `${round.system === 'swiss' ? 'Schweizer System' : 'Jeder gegen Jeden'} (Runde ${round.number})`;
    for (const m of round.matches) {
      const r = m.result;
      const a = refOf.get(m.a);
      const b = refOf.get(m.b);
      if (!r) {
        open++;
        skipped++;
        continue;
      }
      if (!a || !b) {
        skipped++;
        continue;
      }
      if (r.kind === 'walkover') {
        walkovers++;
        skipped++;
        continue;
      }
      if (r.sets.length === 0) {
        missingSets++;
        skipped++;
        continue;
      }
      nr++;
      const attrs: [string, string | number][] = [
        ['group', group],
        ['nr', nr],
        ['player-a', a],
        ['player-b', b],
        ['matches-a', r.winner === 'A' ? 1 : 0],
        ['matches-b', r.winner === 'B' ? 1 : 0],
        ['sets-a', r.setsA],
        ['sets-b', r.setsB],
      ];
      for (let i = 0; i < MAX_SETS; i++) {
        const s = r.sets[i];
        attrs.push([`set-a-${i + 1}`, s?.a ?? 0], [`set-b-${i + 1}`, s?.b ?? 0]);
      }
      attrs.push(['games-a', r.sets.reduce((x, s) => x + s.a, 0)], ['games-b', r.sets.reduce((x, s) => x + s.b, 0)]);
      matchLines.push(`      <match${attrsToString(attrs)}/>`);
    }
  }
  if (open) checks.push({ severity: 'warning', message: `${open} Spiel(e) ohne Ergebnis – nicht exportiert.` });
  if (missingSets) checks.push({ severity: 'error', message: `${missingSets} Spiel(e) nur mit Satzverhältnis erfasst. click-TT benötigt die Satzergebnisse – bitte nachtragen.` });
  if (walkovers) checks.push({ severity: 'warning', message: `${walkovers} kampflose(s) Spiel(e) (w.o.) – Kennzeichnung im Dateiformat nicht verifiziert, daher nicht exportiert. Bitte in click-TT manuell als w.o. erfassen.` });
  const byes = t.rounds.filter((r) => r.bye).length;
  if (byes) checks.push({ severity: 'info', message: `${byes} Freilos(e) werden nicht übertragen (kein Spiel, nicht TTR-relevant).` });
  if (nr === 0) checks.push({ severity: 'error', message: 'Keine exportierbaren Spiele vorhanden.' });
  checks.push({ severity: 'info', message: 'Format nachgebildet nach öffentlich verfügbaren click-TT-Dateien (keine offizielle Spezifikation). Nach dem Upload im Ergebnis-Importer die Satzergebnisse kontrollieren.' });

  const playerLines = clickParticipants.map((p) => {
    const person = p.player.clickTtPerson ?? {
      lastname: p.player.lastName,
      firstname: p.player.firstName,
      'club-name': p.player.club ?? '',
      'licence-nr': p.player.licenceNr ?? '',
      'internal-nr': p.player.internalNr ?? '',
    };
    return `      <player type="single" id="${p.player.meta.sourceRef}">\n        <person${attrsToString(Object.entries(person))}/>\n      </player>`;
  });

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!DOCTYPE tournament SYSTEM "http://liga.nu/dtd/TournamentPortal.dtd">',
    `<tournament${attrsToString(Object.entries(tournament.attrs))}>`,
    `  <competition${attrsToString(Object.entries(comp.attrs))}>`,
    '    <players>',
    ...playerLines,
    '    </players>',
    '    <matches>',
    ...matchLines,
    '    </matches>',
    '  </competition>',
    '</tournament>',
    '',
  ].join('\n');

  const blocking = checks.some((c) => c.severity === 'error');
  return { xml: blocking && nr === 0 ? undefined : xml, checks, exportedMatches: nr, skippedMatches: skipped };
}
