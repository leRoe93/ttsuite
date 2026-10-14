import { seedingRating } from '../players/model.ts';
import { hashSeed, mulberry32, shuffle } from '../../lib/rng.ts';
import type { Tournament } from './model.ts';

/**
 * Standings for TT-Race (BTTV "Infos Spielsystem", WO D 7.6):
 *  1. wins (a Freilos counts as a win)
 *  2. Buchholz = sum of the wins of all opponents; a Freilos counts with the wins of the last-placed player
 *  3. direct comparison
 *  4. lot (BTTV TT-Race page) – or, configurable, lower rating ranks higher (BTTV presentation / BEMSen-L)
 * Withdrawn players keep their wins; each round they no longer play counts as a loss (kampflos).
 */

export interface StandingRow {
  participantId: string;
  rank: number;
  wins: number;
  losses: number;
  played: number;
  byes: number;
  walkoverLosses: number;
  buchholz: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  opponents: string[];
  /** Which criterion separated this player from the next one. */
  decidedBy?: 'wins' | 'buchholz' | 'direct' | 'lot' | 'rating';
  withdrawn: boolean;
}

export function computeStandings(t: Tournament, uptoRound = Number.POSITIVE_INFINITY): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const p of t.participants) {
    rows.set(p.id, {
      participantId: p.id,
      rank: 0,
      wins: 0,
      losses: 0,
      played: 0,
      byes: 0,
      walkoverLosses: 0,
      buchholz: 0,
      setsWon: 0,
      setsLost: 0,
      pointsWon: 0,
      pointsLost: 0,
      opponents: [],
      withdrawn: p.withdrawnAfterRound !== undefined,
    });
  }
  const head = new Map<string, Map<string, number>>(); // wins of x against y
  const addHead = (w: string, l: string) => {
    const m = head.get(w) ?? new Map<string, number>();
    m.set(l, (m.get(l) ?? 0) + 1);
    head.set(w, m);
  };
  const byeHolders: string[] = [];

  for (const round of t.rounds) {
    if (round.number > uptoRound) break;
    const inRound = new Set<string>();
    if (round.bye) {
      const r = rows.get(round.bye);
      if (r) {
        r.wins++;
        r.byes++;
        byeHolders.push(round.bye);
      }
      inRound.add(round.bye);
    }
    for (const m of round.matches) {
      inRound.add(m.a);
      inRound.add(m.b);
      if (!m.result) continue;
      const ra = rows.get(m.a)!;
      const rb = rows.get(m.b)!;
      const res = m.result;
      ra.opponents.push(m.b);
      rb.opponents.push(m.a);
      const [w, l] = res.winner === 'A' ? [ra, rb] : [rb, ra];
      w.wins++;
      l.losses++;
      if (res.kind === 'walkover') l.walkoverLosses++;
      else {
        ra.played++;
        rb.played++;
      }
      addHead(w.participantId, l.participantId);
      ra.setsWon += res.setsA;
      ra.setsLost += res.setsB;
      rb.setsWon += res.setsB;
      rb.setsLost += res.setsA;
      for (const s of res.sets) {
        ra.pointsWon += s.a;
        ra.pointsLost += s.b;
        rb.pointsWon += s.b;
        rb.pointsLost += s.a;
      }
    }
    // Withdrawn players: a kampflose Niederlage for every round they are not part of.
    for (const p of t.participants) {
      if (p.withdrawnAfterRound !== undefined && round.number > p.withdrawnAfterRound && !inRound.has(p.id)) {
        const r = rows.get(p.id)!;
        r.losses++;
        r.walkoverLosses++;
      }
    }
  }

  const all = [...rows.values()];
  const minWins = all.length ? Math.min(...all.map((r) => r.wins)) : 0;
  for (const r of all) {
    r.buchholz = r.opponents.reduce((sum, o) => sum + (rows.get(o)?.wins ?? 0), 0) + r.byes * minWins;
  }

  // Sort by wins, Buchholz; then resolve ties.
  const ratingOf = new Map(t.participants.map((p) => [p.id, seedingRating(p.player)]));
  const rng = mulberry32(hashSeed(t.config.rngSeed, 'standings-lot'));
  const lotOrder = new Map(shuffle(t.participants.map((p) => p.id), rng).map((id, i) => [id, i]));

  all.sort((x, y) => y.wins - x.wins || y.buchholz - x.buchholz);
  const result: StandingRow[] = [];
  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j < all.length && all[j]!.wins === all[i]!.wins && all[j]!.buchholz === all[i]!.buchholz) j++;
    const group = all.slice(i, j);
    result.push(...resolveTie(group, head, t.config.finalTieBreak, ratingOf, lotOrder));
    i = j;
  }
  // Assign ranks and the criterion that separated each row from the next one.
  result.forEach((r, idx) => {
    r.rank = idx + 1;
    const next = result[idx + 1];
    if (!next) return;
    if (r.wins !== next.wins) r.decidedBy = 'wins';
    else if (r.buchholz !== next.buchholz) r.decidedBy = 'buchholz';
  });
  return result;
}

function resolveTie(
  group: StandingRow[],
  head: Map<string, Map<string, number>>,
  finalTieBreak: Tournament['config']['finalTieBreak'],
  ratingOf: Map<string, number | undefined>,
  lotOrder: Map<string, number>,
): StandingRow[] {
  if (group.length === 1) return group;
  const ids = group.map((g) => g.participantId);
  // Direct comparison only if every pair inside the group has met (otherwise not meaningful).
  const allMet = ids.every((a) => ids.every((b) => a === b || (head.get(a)?.get(b) ?? 0) + (head.get(b)?.get(a) ?? 0) > 0));
  if (allMet) {
    const mini = new Map(ids.map((a) => [a, ids.reduce((s, b) => s + (head.get(a)?.get(b) ?? 0), 0)]));
    const sorted = [...group].sort((x, y) => mini.get(y.participantId)! - mini.get(x.participantId)!);
    const out: StandingRow[] = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && mini.get(sorted[j]!.participantId) === mini.get(sorted[i]!.participantId)) j++;
      const sub = sorted.slice(i, j);
      if (sub.length === 1) {
        sub[0]!.decidedBy = 'direct';
        out.push(sub[0]!);
      } else if (sub.length < group.length) {
        out.push(...resolveTie(sub, head, finalTieBreak, ratingOf, lotOrder));
      } else {
        out.push(...finalBreak(sub, finalTieBreak, ratingOf, lotOrder));
      }
      i = j;
    }
    // The last member of each direct-separated block inherits 'direct' only if it was separated.
    return out;
  }
  return finalBreak(group, finalTieBreak, ratingOf, lotOrder);
}

function finalBreak(
  group: StandingRow[],
  mode: Tournament['config']['finalTieBreak'],
  ratingOf: Map<string, number | undefined>,
  lotOrder: Map<string, number>,
): StandingRow[] {
  const sorted = [...group].sort((x, y) => {
    if (mode === 'lower-rating') {
      const rx = ratingOf.get(x.participantId);
      const ry = ratingOf.get(y.participantId);
      if (rx !== undefined && ry !== undefined && rx !== ry) return rx - ry;
    }
    return lotOrder.get(x.participantId)! - lotOrder.get(y.participantId)!;
  });
  sorted.forEach((r, idx) => {
    if (idx === sorted.length - 1) return;
    const rx = ratingOf.get(r.participantId);
    const ry = ratingOf.get(sorted[idx + 1]!.participantId);
    r.decidedBy = mode === 'lower-rating' && rx !== undefined && ry !== undefined && rx !== ry ? 'rating' : 'lot';
  });
  return sorted;
}

export const DECIDED_LABEL: Record<NonNullable<StandingRow['decidedBy']>, string> = {
  wins: 'Siege',
  buchholz: 'Buchholz',
  direct: 'Direkter Vergleich',
  lot: 'Los',
  rating: 'niedrigerer TTR',
};
