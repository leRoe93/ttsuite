import { fullName, type Player } from '../domain/players/model.ts';
import { ROLE_LABELS, type TeamPlan } from '../domain/team-rules/model.ts';
import type { LineupValidation } from '../domain/team-rules/validate.ts';
import type { Tournament } from '../domain/tournament/model.ts';
import { formatResult } from '../domain/tournament/results.ts';
import { computeStandings, DECIDED_LABEL } from '../domain/tournament/standings.ts';
import { toCsv } from '../imports/csv.ts';

/** General-purpose exports. The internal models stay independent of these formats. */

export function lineupToCsv(plan: TeamPlan, players: readonly Player[], validation?: LineupValidation): string {
  const byId = new Map(players.map((p) => [p.id, p]));
  const spv = new Set(validation?.derivedSpv.map((d) => d.playerId) ?? []);
  const rows: unknown[][] = [['Mannschaft', 'Nr.', 'Position', 'Nachname', 'Vorname', 'Q-TTR', 'Status', 'Sperrvermerk', 'Lizenz-Nr.']];
  plan.teams.forEach((team, ti) =>
    team.slots.forEach((s, si) => {
      const p = byId.get(s.playerId);
      if (!p) return;
      const spvText = spv.has(p.id) ? 'SPV (neu)' : p.rules.sperrvermerk && plan.halfSeason === 'RR' ? `SPV (aus Mannschaft ${p.rules.sperrvermerk.teamNumber})` : '';
      rows.push([team.name, ti + 1, `${ti + 1}.${si + 1}`, p.lastName, p.firstName, p.rules.qttr ?? '', s.role === 'stamm' ? '' : s.role, spvText, p.licenceNr ?? '']);
    }),
  );
  return toCsv(rows);
}

export function lineupToJson(plan: TeamPlan, players: readonly Player[]): string {
  const byId = new Map(players.map((p) => [p.id, p]));
  return JSON.stringify(
    {
      format: 'ttsuite-lineup',
      version: 1,
      plan: { name: plan.name, season: plan.season, ageClass: plan.ageClass, halfSeason: plan.halfSeason },
      teams: plan.teams.map((t, i) => ({
        number: i + 1,
        name: t.name,
        league: t.league,
        sollstaerke: t.sollstaerke,
        players: t.slots.map((s, j) => {
          const p = byId.get(s.playerId);
          return { position: `${i + 1}.${j + 1}`, role: s.role, roleLabel: ROLE_LABELS[s.role], name: p ? fullName(p) : '?', qttr: p?.rules.qttr, licenceNr: p?.licenceNr };
        }),
      })),
    },
    null,
    2,
  );
}

export function standingsToCsv(t: Tournament): string {
  const byId = new Map(t.participants.map((p) => [p.id, p]));
  const rows: unknown[][] = [['Platz', 'Name', 'Verein', 'TTR', 'Siege', 'Niederlagen', 'Buchholz', 'Sätze', 'Bälle', 'entschieden durch']];
  for (const s of computeStandings(t)) {
    const p = byId.get(s.participantId)!.player;
    rows.push([s.rank, fullName(p), p.club ?? '', p.rules.qttr ?? p.ttr ?? '', s.wins, s.losses, s.buchholz, `${s.setsWon}:${s.setsLost}`, `${s.pointsWon}:${s.pointsLost}`, s.decidedBy ? DECIDED_LABEL[s.decidedBy] : '']);
  }
  return toCsv(rows);
}

export function matchesToCsv(t: Tournament): string {
  const byId = new Map(t.participants.map((p) => [p.id, p]));
  const name = (id: string) => (byId.get(id) ? fullName(byId.get(id)!.player) : '?');
  const rows: unknown[][] = [['Runde', 'Tisch', 'Spieler A', 'Spieler B', 'Ergebnis', 'Sätze A', 'Sätze B', 'Satzergebnisse', 'kampflos']];
  for (const r of t.rounds) {
    for (const m of r.matches) {
      rows.push([r.number, m.table ?? '', name(m.a), name(m.b), formatResult(m.result), m.result?.setsA ?? '', m.result?.setsB ?? '', m.result?.sets.map((s) => `${s.a}:${s.b}`).join(' ') ?? '', m.result?.kind === 'walkover' ? 'ja' : '']);
    }
    if (r.bye) rows.push([r.number, '', name(r.bye), 'Freilos', '', '', '', '', '']);
  }
  return toCsv(rows);
}
