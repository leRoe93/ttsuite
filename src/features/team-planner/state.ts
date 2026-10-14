import { useCallback, useEffect, useState } from 'react';
import { newId } from '../../domain/players/model.ts';
import { movePlayer, type AgeClass, type HalfSeason, type LineupRole, type Team, type TeamPlan } from '../../domain/team-rules/model.ts';
import { normalizeName } from '../../domain/players/normalize.ts';
import type { LineupHints } from '../../imports/types.ts';
import { BUILTIN_RULE_SETS, type LineupRuleSet } from '../../domain/team-rules/ruleSets.ts';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];

export function defaultSeason(now = new Date()): { season: string; half: HalfSeason } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  // Season starts 1 July. Rückrunde registrations are prepared from ~December.
  const start = m >= 7 ? y : y - 1;
  const half: HalfSeason = m >= 11 || m <= 5 ? 'RR' : 'VR';
  return { season: `${start}/${String((start + 1) % 100).padStart(2, '0')}`, half };
}

export function newTeam(name: string, sollstaerke = 6): Team {
  return { id: newId('team'), name, sollstaerke, slots: [] };
}

export function newPlan(init: { name: string; ageClass: AgeClass; halfSeason: HalfSeason; season: string; teamCount: number; teamPrefix: string; sollstaerke: number; contest?: 'Erwachsene' | 'Damen' }): TeamPlan {
  return {
    contest: init.contest,
    id: newId('plan'),
    name: init.name,
    season: init.season,
    ageClass: init.ageClass,
    halfSeason: init.halfSeason,
    ruleSetId: BUILTIN_RULE_SETS[0]!.id,
    teams: Array.from({ length: init.teamCount }, (_, i) => newTeam(`${init.teamPrefix} ${ROMAN[i] ?? i + 1}`, init.sollstaerke)),
    spvRequested: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Apply team/position/flag hints from an import to a plan: creates missing teams (matched by name),
 * places players in position order and takes over RES/WES/NES/SES. Returns player ids with an SPV flag
 * and the team number they were placed in.
 */
export function applyLineupHints(plan: TeamPlan, hints: Map<string, LineupHints>): { plan: TeamPlan; spv: Map<string, number>; count: number } {
  let next: TeamPlan = { ...plan, teams: [...plan.teams] };
  const withTeam = [...hints.entries()]
    .filter(([, h]) => h.team || h.teamNumber)
    .sort((a, b) => (a[1].teamNumber ?? 0) - (b[1].teamNumber ?? 0) || (a[1].position ?? 0) - (b[1].position ?? 0));
  const spv = new Map<string, number>();
  const soll = next.teams[0]?.sollstaerke ?? 6;
  for (const [pid, h] of withTeam) {
    let team: Team | undefined;
    if (h.teamNumber) {
      // click-TT rank "n.m": team n of this registration; create missing teams in order.
      while (next.teams.length < h.teamNumber) next = { ...next, teams: [...next.teams, newTeam(`${plan.name} ${ROMAN[next.teams.length] ?? next.teams.length + 1}`, soll)] };
      team = next.teams[h.teamNumber - 1];
    } else {
      team = next.teams.find((t) => normalizeName(t.name) === normalizeName(h.team!));
      if (!team) {
        team = newTeam(h.team!, soll);
        next = { ...next, teams: [...next.teams, team] };
      }
    }
    const role: LineupRole = (['RES', 'WES', 'NES', 'SES'] as const).find((r) => h.flags.includes(r)) ?? 'stamm';
    const t = next.teams.find((x) => x.id === team!.id)!;
    next = movePlayer(next, pid, t.id, t.slots.filter((s) => s.playerId !== pid).length, role);
    if (h.flags.includes('SPV')) spv.set(pid, next.teams.findIndex((x) => x.id === team!.id) + 1);
  }
  return { plan: next, spv, count: withTeam.length };
}

export function resolveRuleSet(id: string, custom: readonly LineupRuleSet[]): LineupRuleSet {
  return [...BUILTIN_RULE_SETS, ...custom].find((r) => r.id === id) ?? BUILTIN_RULE_SETS[0]!;
}

/** Undo/redo history for one plan (in memory; the plan itself is persisted). */
export function usePlanHistory(plan: TeamPlan | undefined, commit: (p: TeamPlan) => void) {
  const [past, setPast] = useState<TeamPlan[]>([]);
  const [future, setFuture] = useState<TeamPlan[]>([]);
  const planId = plan?.id;
  useEffect(() => {
    setPast([]);
    setFuture([]);
  }, [planId]);

  const apply = useCallback(
    (next: TeamPlan) => {
      if (!plan) return;
      setPast((p) => [...p.slice(-49), plan]);
      setFuture([]);
      commit({ ...next, updatedAt: new Date().toISOString() });
    },
    [plan, commit],
  );
  const undo = useCallback(() => {
    if (!plan || past.length === 0) return;
    const prev = past[past.length - 1]!;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [plan, ...f]);
    commit(prev);
  }, [plan, past, commit]);
  const redo = useCallback(() => {
    if (!plan || future.length === 0) return;
    const next = future[0]!;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, plan]);
    commit(next);
  }, [plan, future, commit]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [undo, redo]);

  return { apply, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
