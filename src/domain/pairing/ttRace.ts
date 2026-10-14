import { hashSeed, mulberry32, shuffle } from '../../lib/rng.ts';

/**
 * TTVN-Race pairing engine: MKTT Cup-System ("modifiziertes Schweizer System"), as published by the
 * TTVN in "TTVN_Race_MKTT_Cup_System.pdf" (ttvn.de → TTVN-Race → Infos Spielsystem).
 *
 *  - Round 1: seeding by Q-TTR; every player of the upper half plays the player at the same position of
 *    the lower half (1–9, 2–10 … 8–16). Odd number of players: the player in the middle gets the Freilos.
 *  - Rounds 2–4: within each result group (same number of wins) the first player plays the last
 *    (1–8, 2–7, 3–6, 4–5). An odd group is filled from below; likewise if a player has already played
 *    everybody in his group.
 *  - Rounds 5–6: "normales Schweizer System" – direct neighbours in the table (1–2, 3–4 …),
 *    depending on which matches have already been played.
 *  - Freilos: at most one per player; given "von der Mitte nach unten", if nobody below is eligible
 *    "von der Mitte nach oben".
 *  - No pairing twice. If no repeat-free pairing exists, the engine explains the conflict
 *    (organiser may explicitly allow an unavoidable repeat).
 *
 * The order of players (rank) comes from the standings: wins → Buchholz → Feinbuchholz →
 * Satzdifferenz → gewonnene Sätze → Los. Pure & deterministic.
 */

export interface PairingPlayer {
  id: string;
  rating?: number;
  /** Current table position (1 = best). Ignored in round 1 (seeding by rating). */
  rank: number;
  wins: number;
  opponents: readonly string[];
  hadBye: boolean;
}

export interface PairingOptions {
  round: number;
  seed: number;
  allowRepeatsIfUnavoidable: boolean;
  /** Search budget for the backtracking (protects the UI from pathological cases). */
  maxSteps?: number;
}

export type PairingOutcome =
  | { ok: true; pairs: [string, string][]; bye?: string; notes: string[]; repeats: [string, string][] }
  | { ok: false; reason: string; notes: string[] };

export type PairingPhase = 'seeding' | 'fold' | 'neighbours';

export function phaseOf(round: number): PairingPhase {
  if (round <= 1) return 'seeding';
  return round <= 4 ? 'fold' : 'neighbours';
}

export function pairRound(players: readonly PairingPlayer[], opts: PairingOptions): PairingOutcome {
  if (players.length < 2) return { ok: false, reason: 'Mindestens 2 aktive Teilnehmer erforderlich.', notes: [] };
  if (opts.round === 1) return firstRound(players, opts.seed);

  const phase = phaseOf(opts.round);
  const ordered = [...players].sort((a, b) => a.rank - b.rank);
  const attempt = (allowRepeats: boolean) => {
    const budget = { steps: opts.maxSteps ?? 200_000 };
    if (ordered.length % 2 === 0) {
      const pairs = pairList(ordered, phase, allowRepeats, budget);
      return pairs ? { pairs, bye: undefined } : budget.steps <= 0 ? ('exhausted' as const) : undefined;
    }
    for (const idx of byeOrder(ordered.length)) {
      const cand = ordered[idx]!;
      if (cand.hadBye) continue;
      const pairs = pairList(ordered.filter((p) => p.id !== cand.id), phase, allowRepeats, budget);
      if (pairs) return { pairs, bye: cand.id };
      if (budget.steps <= 0) return 'exhausted' as const;
    }
    return undefined;
  };

  let res = attempt(false);
  let usedRepeats = false;
  if ((!res || res === 'exhausted') && opts.allowRepeatsIfUnavoidable) {
    res = attempt(true);
    usedRepeats = true;
  }
  if (!res || res === 'exhausted') {
    const allByes = ordered.length % 2 === 1 && ordered.every((p) => p.hadBye);
    return {
      ok: false,
      reason:
        res === 'exhausted'
          ? 'Die Suche nach einer gültigen Paarung wurde abgebrochen (zu viele Kombinationen).'
          : allByes
            ? 'Alle Teilnehmer hatten bereits ein Freilos – niemand darf ein zweites Freilos erhalten.'
            : 'Es gibt keine Auslosung, bei der niemand erneut auf einen bisherigen Gegner trifft. Bei wenigen Teilnehmern ist die maximale Rundenzahl erreicht.',
      notes: ['Mögliche Lösungen: Turnier mit der aktuellen Runde beenden, Rundenzahl reduzieren, oder in den Einstellungen „Wiederholung nur wenn unvermeidbar“ erlauben.'],
    };
  }
  const opp = new Map(players.map((p) => [p.id, new Set(p.opponents)]));
  const repeats = res.pairs.filter(([a, b]) => opp.get(a)!.has(b));
  const notes: string[] = [];
  if (phase === 'fold') {
    notes.push(`Runde ${opts.round} (Runden 2–4): Innerhalb jeder Ergebnisgruppe (gleiche Siegzahl) spielt der Erste gegen den Letzten, der Zweite gegen den Vorletzten usw. Ungerade Gruppen werden von unten ergänzt.`);
  } else {
    notes.push(`Runde ${opts.round} (ab Runde 5): Direkte Tabellennachbarn spielen gegeneinander (1–2, 3–4 …), sofern sie noch nicht gegeneinander gespielt haben.`);
  }
  if (res.bye) notes.push('Freilos von der Tabellenmitte nach unten an den ersten Spieler ohne bisheriges Freilos (sonst von der Mitte nach oben).');
  if (usedRepeats && repeats.length) notes.push(`Achtung: ${repeats.length} Wiederholungspaarung(en) waren unvermeidbar (Ausrichter-Option).`);
  return { ok: true, pairs: res.pairs, bye: res.bye, notes, repeats };
}

/** Round 1: 1–(k+1), 2–(k+2) …; odd count → the middle player of the Q-TTR list gets the Freilos. */
function firstRound(players: readonly PairingPlayer[], seed: number): PairingOutcome {
  // Equal ratings are ordered by lot (reproducible via seed).
  const lot = new Map(shuffle(players.map((p) => p.id), mulberry32(hashSeed(seed, 'seeding'))).map((id, i) => [id, i]));
  const sorted = [...players].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || lot.get(a.id)! - lot.get(b.id)!);
  const n = sorted.length;
  const k = Math.floor(n / 2);
  let bye: string | undefined;
  let rest = sorted;
  if (n % 2 === 1) {
    bye = sorted[k]!.id;
    rest = sorted.filter((_, i) => i !== k);
  }
  const upper = rest.slice(0, k);
  const lower = rest.slice(k);
  const pairs: [string, string][] = upper.map((u, i) => [u.id, lower[i]!.id]);
  const off = bye ? 1 : 0;
  const notes = [`Runde 1, Setzung nach Q-TTR: jeder Spieler der oberen Hälfte gegen die gleiche Position der unteren Hälfte (1–${k + 1 + off}, 2–${k + 2 + off} …).`];
  if (bye) notes.push(`Freilos für den Spieler in der Mitte (Platz ${k + 1} von ${n} der Setzliste).`);
  if (players.some((p) => p.rating === undefined)) notes.push('Spieler ohne TTR-Wert stehen am Ende der Setzliste.');
  return { ok: true, pairs, bye, notes, repeats: [] };
}

/** Indices for the Freilos search: middle, then downwards, then from the middle upwards. */
export function byeOrder(n: number): number[] {
  const m = Math.floor(n / 2);
  const out: number[] = [];
  for (let i = m; i < n; i++) out.push(i);
  for (let i = m - 1; i >= 0; i--) out.push(i);
  return out;
}

/**
 * Backtracking over the table order. The highest unpaired player picks first; his candidate order
 * depends on the phase:
 *  - fold: his result group (same wins, filled from below to an even size) from the *last* member
 *    upwards, then the players below the group from the top;
 *  - neighbours: the next players in table order.
 */
function pairList(list: readonly PairingPlayer[], phase: PairingPhase, allowRepeats: boolean, budget: { steps: number }): [string, string][] | undefined {
  const opp = new Map(list.map((p) => [p.id, new Set(p.opponents)]));
  const rec = (remaining: PairingPlayer[]): [string, string][] | undefined => {
    if (remaining.length === 0) return [];
    if (--budget.steps <= 0) return undefined;
    const [p, ...rest] = remaining as [PairingPlayer, ...PairingPlayer[]];
    let candidates: PairingPlayer[];
    if (phase === 'fold') {
      const group = remaining.filter((q) => q.wins === p.wins);
      const below = remaining.filter((q) => q.wins < p.wins);
      const above = remaining.filter((q) => q.wins > p.wins); // only after earlier floats
      let fill = 0;
      if (group.length % 2 === 1 && below.length > 0) fill = 1;
      const groupFull = [...group, ...below.slice(0, fill)];
      const inGroup = groupFull.filter((q) => q.id !== p.id).reverse();
      const outside = [...below.slice(fill), ...above];
      candidates = [...inGroup, ...outside];
    } else {
      candidates = rest;
    }
    const freshC = candidates.filter((q) => !opp.get(p.id)!.has(q.id));
    const ordered = allowRepeats ? [...freshC, ...candidates.filter((q) => opp.get(p.id)!.has(q.id))] : freshC;
    for (const q of ordered) {
      const sub = rec(rest.filter((r) => r.id !== q.id));
      if (sub) return [[p.id, q.id], ...sub];
      if (budget.steps <= 0) return undefined;
    }
    return undefined;
  };
  return rec([...list]);
}

/**
 * Round robin ("Jeder gegen Jeden", used for 7–8 participants) via the circle method.
 * Players are numbered by rating; with an odd count a Freilos rotates through all players.
 */
export function roundRobinSchedule(ids: readonly string[]): { pairs: [string, string][]; bye?: string }[] {
  const list: (string | null)[] = [...ids];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: { pairs: [string, string][]; bye?: string }[] = [];
  const arr = [...list];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    let bye: string | undefined;
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      if (a === null) bye = b ?? undefined;
      else if (b === null) bye = a;
      else pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push({ pairs, bye });
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}
