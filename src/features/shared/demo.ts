import type { Player } from '../../domain/players/model.ts';
import type { TeamPlan } from '../../domain/team-rules/model.ts';
import type { Tournament } from '../../domain/tournament/model.ts';
import { addParticipants, createTournament } from '../../domain/tournament/workflow.ts';
import { readClickTtXml } from '../../imports/clickTtXml.ts';
import { applyClickTtRegistration, parseClickTtRegistration } from '../team-planner/clickTtImport.ts';
import { defaultSeason, newPlan } from '../team-planner/state.ts';

export const DEMO_FILES = {
  registration: './sample-data/fiktive_clicktt_meldung_kopiert.txt',
  tournament: './sample-data/fiktives_tt-race_clicktt_teilnehmer.xml',
};

/** Fictional demo set (club registration as copied from click-TT + TTVN-Race), built through the regular import code. */
export function buildDemo(registrationText: string, xml: string): { players: Player[]; plan: TeamPlan; tournament: Tournament } {
  const s = defaultSeason();
  const base = newPlan({ name: 'Herren (Beispiel)', season: s.season, halfSeason: s.half, ageClass: 'erwachsene', contest: 'Erwachsene', teamCount: 0, teamPrefix: 'Herren', sollstaerke: 4 });
  const parsed = parseClickTtRegistration(registrationText, [], base);
  if (!parsed.recognized) throw new Error(parsed.reason);
  const { players, plan } = applyClickTtRegistration([], base, parsed, { adoptHeading: true });

  const imp = readClickTtXml(xml, { fileName: 'Beispiel-Teilnehmende (fiktiv)' });
  let tournament = createTournament({ name: 'TTVN-Race Musterhausen (Beispiel)', date: new Date().toISOString().slice(0, 10), organizer: 'TSV Musterhausen (fiktiv)', seed: 20261113 });
  tournament = addParticipants(tournament, imp.candidates.flatMap((c) => (c.player ? [c.player] : [])));
  if (imp.tournament) tournament = { ...tournament, clickTt: { tournament: imp.tournament, competitionIndex: 0 } };
  return { players, plan, tournament };
}
