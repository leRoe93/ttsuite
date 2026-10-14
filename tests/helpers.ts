import type { Player } from '../src/domain/players/model.ts';
import type { LineupRole, TeamPlan } from '../src/domain/team-rules/model.ts';

let n = 0;
export function player(lastName: string, qttr: number | undefined, extra: Partial<Player> & { rules?: Partial<Player['rules']> } = {}): Player {
  n++;
  return {
    id: extra.id ?? `pl${n}`,
    firstName: extra.firstName ?? 'Test',
    lastName,
    ...extra,
    rules: { qttr, ...(extra.rules ?? {}) },
    meta: extra.meta ?? { source: 'manual', importedAt: '2026-01-01T00:00:00.000Z' },
  };
}

/** teams: [[player, role?], ...] per team, in registration order. */
export function plan(teams: (Player | [Player, LineupRole])[][], opts: Partial<TeamPlan> = {}): TeamPlan {
  return {
    id: 'plan1',
    name: 'Test',
    season: '2026/27',
    ageClass: 'erwachsene',
    halfSeason: 'VR',
    ruleSetId: 'dttb-wo-h-2026',
    spvRequested: [],
    updatedAt: '',
    ...opts,
    teams: teams.map((slots, i) => ({
      id: `team${i + 1}`,
      name: `Herren ${i + 1}`,
      sollstaerke: opts.teams?.[i]?.sollstaerke ?? 2,
      slots: slots.map((s) => (Array.isArray(s) ? { playerId: s[0].id, role: s[1] } : { playerId: s.id, role: 'stamm' as const })),
    })),
  };
}
