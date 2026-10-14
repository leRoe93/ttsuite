import { hashSeed, mulberry32, shuffle } from '../../lib/rng.ts';
import type { Tournament } from './model.ts';

/**
 * Standings for the TTVN-Race (MKTT Cup-System, TTVN "Infos Spielsystem"):
 *  1. wins (a Freilos counts as a win)
 *  2. Buchholz = sum of the wins of all opponents
 *  3. Feinbuchholz = sum of the Buchholz of all opponents
 *  4. set difference, 5. sets won, then lot (reproducible via the tournament seed)
 * Not specified by the TTVN document: how a Freilos enters the Buchholz. Implemented like the BTTV
 * convention (wins of the last-placed player) – see docs/REGULATIONS.md.
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
  /** Sum of the opponents' Buchholz. */
  feinbuchholz: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  opponents: string[];
  /** Which criterion separated this player from the next one. */
  decidedBy?: 'wins' | 'buchholz' | 'feinbuchholz' | 'setdiff' | 'sets' | 'lot';
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
      feinbuchholz: 0,
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
  for (const r of all) {
    r.feinbuchholz = r.opponents.reduce((sum, o) => sum + (rows.get(o)?.buchholz ?? 0), 0);
  }

  // MKTT Cup-System order: wins → Buchholz → Feinbuchholz → set difference → sets won → lot (reproducible).
  const rng = mulberry32(hashSeed(t.config.rngSeed, 'standings-lot'));
  const lotOrder = new Map(shuffle(t.participants.map((p) => p.id), rng).map((id, i) => [id, i]));
  const keys: [NonNullable<StandingRow['decidedBy']>, (r: StandingRow) => number][] = [
    ['wins', (r) => r.wins],
    ['buchholz', (r) => r.buchholz],
    ['feinbuchholz', (r) => r.feinbuchholz],
    ['setdiff', (r) => r.setsWon - r.setsLost],
    ['sets', (r) => r.setsWon],
  ];
  all.sort((x, y) => {
    for (const [, k] of keys) {
      const d = k(y) - k(x);
      if (d) return d;
    }
    return lotOrder.get(x.participantId)! - lotOrder.get(y.participantId)!;
  });
  all.forEach((r, idx) => {
    r.rank = idx + 1;
    const next = all[idx + 1];
    if (!next) return;
    r.decidedBy = keys.find(([, k]) => k(r) !== k(next))?.[0] ?? 'lot';
  });
  void head;
  return all;
}

export const DECIDED_LABEL: Record<NonNullable<StandingRow['decidedBy']>, string> = {
  wins: 'Siege',
  buchholz: 'Buchholz',
  feinbuchholz: 'Feinbuchholz',
  setdiff: 'Satzdifferenz',
  sets: 'gewonnene Sätze',
  lot: 'Los',
};
