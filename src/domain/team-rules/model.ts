/** Team lineup planning model (Mannschaftsmeldung). Independent of UI and file formats. */

/**
 * Role of a player in a team's registration (WO A 5.3):
 * stamm = Stammspieler (counts toward Sollstärke), RES = Reservespieler (adults only),
 * WES/NES/SES = weiblicher/Nachwuchs-/Senioren-Ergänzungsspieler (do not count toward Sollstärke).
 */
export type LineupRole = 'stamm' | 'RES' | 'WES' | 'NES' | 'SES';

export const ROLE_LABELS: Record<LineupRole, string> = {
  stamm: 'Stammspieler',
  RES: 'Reservespieler (RES)',
  WES: 'Weibl. Ergänzungsspieler (WES)',
  NES: 'Nachwuchs-Ergänzungsspieler (NES)',
  SES: 'Senioren-Ergänzungsspieler (SES)',
};

export const isErgaenzung = (r: LineupRole) => r === 'WES' || r === 'NES' || r === 'SES';

export interface LineupSlot {
  playerId: string;
  role: LineupRole;
}

export interface Team {
  id: string;
  /** Display name, e.g. "Herren II". Team number = position in TeamPlan.teams (1-based). */
  name: string;
  league?: string;
  /** Sollstärke (number of players in a match), e.g. 6 or 4 – depends on the league. */
  sollstaerke: number;
  slots: LineupSlot[];
}

export type AgeClass = 'erwachsene' | 'nachwuchs';
export type HalfSeason = 'VR' | 'RR';

export interface TeamPlan {
  id: string;
  name: string;
  /** e.g. "2026/27" */
  season: string;
  ageClass: AgeClass;
  halfSeason: HalfSeason;
  ruleSetId: string;
  teams: Team[];
  /**
   * Players for whom the club applies for a deviation from the strength order (WO H 2.4),
   * accepting a Sperrvermerk. Only possible for the Vorrunde.
   */
  spvRequested: string[];
  /** Club in click-TT, used only to build links to its public pages (optional). */
  clickTt?: { federation: string; clubId?: string; clubName?: string };
  updatedAt: string;
}

export function teamNumberOf(plan: TeamPlan, teamId: string): number {
  return plan.teams.findIndex((t) => t.id === teamId) + 1;
}

export function findSlot(plan: TeamPlan, playerId: string): { team: Team; teamIndex: number; index: number; slot: LineupSlot } | undefined {
  for (let ti = 0; ti < plan.teams.length; ti++) {
    const team = plan.teams[ti]!;
    const index = team.slots.findIndex((s) => s.playerId === playerId);
    if (index >= 0) return { team, teamIndex: ti, index, slot: team.slots[index]! };
  }
  return undefined;
}

/** Immutable move of a player to (teamId, index). teamId null = remove from all teams. */
export function movePlayer(plan: TeamPlan, playerId: string, teamId: string | null, index: number, role?: LineupRole): TeamPlan {
  const current = findSlot(plan, playerId);
  const keepRole = role ?? current?.slot.role ?? 'stamm';
  let teams = plan.teams.map((t) => ({ ...t, slots: t.slots.filter((s) => s.playerId !== playerId) }));
  if (teamId) {
    teams = teams.map((t) => {
      if (t.id !== teamId) return t;
      let target = index;
      // Moving down within the same team: the removal shifted indices.
      if (current && current.team.id === teamId && current.index < index) target = index - 1;
      const slots = [...t.slots];
      slots.splice(Math.max(0, Math.min(target, slots.length)), 0, { playerId, role: keepRole });
      return { ...t, slots };
    });
  }
  return { ...plan, teams, spvRequested: teamId ? plan.spvRequested : plan.spvRequested.filter((id) => id !== playerId) };
}

export function setRole(plan: TeamPlan, playerId: string, role: LineupRole): TeamPlan {
  return {
    ...plan,
    teams: plan.teams.map((t) => ({ ...t, slots: t.slots.map((s) => (s.playerId === playerId ? { ...s, role } : s)) })),
  };
}

export function assignedIds(plan: TeamPlan): Set<string> {
  return new Set(plan.teams.flatMap((t) => t.slots.map((s) => s.playerId)));
}
