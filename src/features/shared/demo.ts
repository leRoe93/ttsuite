import type { Player } from '../../domain/players/model.ts';
import type { TeamPlan } from '../../domain/team-rules/model.ts';
import type { Tournament } from '../../domain/tournament/model.ts';
import { addParticipants, createTournament } from '../../domain/tournament/workflow.ts';
import { readClickTtXml } from '../../imports/clickTtXml.ts';
import { guessMapping, mapRows, readTable, TABLE_PRESETS } from '../../imports/tabular.ts';
import type { LineupHints } from '../../imports/types.ts';
import { applyLineupHints, defaultSeason, newPlan } from '../team-planner/state.ts';

export const DEMO_FILES = {
  players: './sample-data/fiktive_spieler_mannschaftsmeldung.csv',
  tournament: './sample-data/fiktives_tt-race_clicktt_teilnehmer.xml',
};

/** Builds a fictional demo set (club roster + lineup plan + TT-Race) through the regular import adapters. */
export function buildDemo(csv: string, xml: string): { players: Player[]; plan: TeamPlan; tournament: Tournament } {
  const table = readTable(csv);
  const preview = mapRows(table, guessMapping(table.headers, TABLE_PRESETS[0]), 'click-tt-table', { fileName: 'Beispieldaten (fiktiv)' });
  const players: Player[] = [];
  const hints = new Map<string, LineupHints>();
  for (const c of preview.candidates) {
    if (!c.player) continue;
    players.push(c.player);
    if (c.hints) hints.set(c.player.id, c.hints);
  }
  const s = defaultSeason();
  const base = newPlan({ name: 'Herren (Beispiel)', season: s.season, halfSeason: 'VR', ageClass: 'erwachsene', teamCount: 0, teamPrefix: 'Herren', sollstaerke: 6 });
  const plan = applyLineupHints(base, hints).plan;

  const imp = readClickTtXml(xml, { fileName: 'Beispiel-Teilnehmer (fiktiv)' });
  let tournament = createTournament({ name: 'TT-Race Musterhausen (Beispiel)', date: new Date().toISOString().slice(0, 10), organizer: 'TSV Musterhausen (fiktiv)', seed: 20261113 });
  tournament = addParticipants(tournament, imp.candidates.flatMap((c) => (c.player ? [c.player] : [])));
  if (imp.tournament) tournament = { ...tournament, clickTt: { tournament: imp.tournament, competitionIndex: 0 } };
  return { players, plan, tournament };
}
