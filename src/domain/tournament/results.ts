import type { MatchResult, SetScore, Side } from './model.ts';

/**
 * Result entry & validation per the ITTF/DTTB table rules: a game is won by the player who first
 * reaches 11 points, unless both reach 10 – then a lead of 2 points is required.
 * A match is best of N games (3, 5 or 7).
 */

export function validateSet(s: SetScore): string | undefined {
  const { a, b } = s;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Punkte müssen ganze Zahlen ≥ 0 sein';
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < 11) return `${a}:${b} – ein Satz endet frühestens bei 11 Punkten`;
  if (lo <= 9 && hi !== 11) return `${a}:${b} – bei weniger als 10 Punkten des Gegners endet der Satz mit 11`;
  if (lo >= 10 && hi - lo !== 2) return `${a}:${b} – ab 10:10 muss der Satz mit genau 2 Punkten Vorsprung enden`;
  return undefined;
}

export interface ParsedResult {
  result?: MatchResult;
  errors: string[];
  warnings: string[];
}

/**
 * Accepts:
 *  - set scores: "11:7 9:11 11:5 11:8" (separated by space, comma or semicolon)
 *  - short notation: "7 -9 5 8" or "7,-9,5,8" (positive = A won the set, number = opponent's points)
 *  - set count only: "3:1" (allowed, but flagged – click-TT needs set scores)
 *  - walkover: "wo A" / "w.o. B" (winner side)
 */
export function parseResult(input: string, bestOf: 3 | 5 | 7): ParsedResult {
  const s = input.trim().toLowerCase();
  const errors: string[] = [];
  const warnings: string[] = [];
  const need = Math.ceil(bestOf / 2);
  if (s === '') return { errors: ['Kein Ergebnis eingegeben'], warnings };

  const wo = /^w\.?\s?o\.?\s*([ab])$/.exec(s);
  if (wo) {
    const winner = wo[1]!.toUpperCase() as Side;
    return {
      result: { kind: 'walkover', winner, setsA: winner === 'A' ? need : 0, setsB: winner === 'B' ? need : 0, sets: [] },
      errors,
      warnings: ['Kampflos gewertet (w.o.)'],
    };
  }

  const countOnly = /^(\d)\s*:\s*(\d)$/.exec(s);
  if (countOnly) {
    const a = Number(countOnly[1]);
    const b = Number(countOnly[2]);
    if (Math.max(a, b) !== need || Math.min(a, b) >= need) {
      return { errors: [`Bei Best of ${bestOf} braucht der Sieger genau ${need} Gewinnsätze`], warnings };
    }
    return {
      result: { kind: 'played', winner: a > b ? 'A' : 'B', setsA: a, setsB: b, sets: [] },
      errors,
      warnings: ['Nur Satzverhältnis erfasst – für den click-TT-Export werden die Satzergebnisse benötigt'],
    };
  }

  const tokens = s.split(/[\s,;]+/).filter(Boolean);
  const sets: SetScore[] = [];
  for (const tok of tokens) {
    const pair = /^(\d{1,2})[:\-](\d{1,2})$/.exec(tok);
    const short = /^([+-]?)(\d{1,2})$/.exec(tok);
    if (pair) sets.push({ a: Number(pair[1]), b: Number(pair[2]) });
    else if (short) {
      const loserPts = Number(short[2]);
      const winnerPts = loserPts >= 10 ? loserPts + 2 : 11;
      // "-9" = B won 11:9, "9" = A won 11:9, "-0" = B won 11:0
      sets.push(short[1] === '-' ? { a: loserPts, b: winnerPts } : { a: winnerPts, b: loserPts });
    } else {
      errors.push(`„${tok}“ nicht erkannt`);
    }
  }
  if (errors.length) return { errors, warnings };
  return evaluateSets(sets, bestOf);
}

export function evaluateSets(sets: SetScore[], bestOf: 3 | 5 | 7): ParsedResult {
  const errors: string[] = [];
  const need = Math.ceil(bestOf / 2);
  let setsA = 0;
  let setsB = 0;
  sets.forEach((st, i) => {
    if (setsA === need || setsB === need) {
      errors.push(`Satz ${i + 1}: Das Spiel war bereits entschieden`);
      return;
    }
    const err = validateSet(st);
    if (err) errors.push(`Satz ${i + 1}: ${err}`);
    if (st.a > st.b) setsA++;
    else setsB++;
  });
  if (!errors.length && setsA < need && setsB < need) errors.push(`Spiel nicht beendet (${setsA}:${setsB}) – bei Best of ${bestOf} sind ${need} Gewinnsätze nötig`);
  if (errors.length) return { errors, warnings: [] };
  return { result: { kind: 'played', winner: setsA > setsB ? 'A' : 'B', setsA, setsB, sets }, errors, warnings: [] };
}

export function formatResult(r: MatchResult | undefined): string {
  if (!r) return '';
  if (r.kind === 'walkover') return `w.o. ${r.winner === 'A' ? '(A)' : '(B)'}`;
  const sets = r.sets.length ? ` (${r.sets.map((x) => `${x.a}:${x.b}`).join(', ')})` : '';
  return `${r.setsA}:${r.setsB}${sets}`;
}

/** Swap perspective (used when displaying a result from B's side). */
export function flip(r: MatchResult): MatchResult {
  return { ...r, winner: r.winner === 'A' ? 'B' : 'A', setsA: r.setsB, setsB: r.setsA, sets: r.sets.map((s) => ({ a: s.b, b: s.a })) };
}
