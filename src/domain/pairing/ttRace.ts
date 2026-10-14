import { hashSeed, mulberry32, shuffle, type Rng } from '../../lib/rng.ts';

/**
 * TT-Race pairing engine (Schweizer System nach WO D 7.6 / BTTV "Infos Spielsystem").
 *
 * Verified rules implemented:
 *  - Round 1: strongest players seeded where possible, the rest drawn.
 *  - Later rounds: standings by wins; inside a win group pair as many not-yet-played pairings
 *    as possible, starting with the group with most wins; a player who cannot be paired in his
 *    group gets an opponent from the next lower group he has not played yet; winless players last.
 *  - Players with equal wins are ordered by Buchholz before the draw.
 *  - No pairing twice (configurable fallback "repeat only if unavoidable").
 *  - Odd number of players: the remaining player gets a Freilos; nobody gets a second Freilos.
 *
 * Interpretations (documented in docs/REGULATIONS.md, configurable where it matters):
 *  - Round 1: the upper half by rating is seeded and meets a drawn opponent from the lower half;
 *    with an odd count the Freilos is drawn among the lower half.
 *  - Inside a win group opponents are drawn ('draw', default) or taken in ranking order ('adjacent').
 *  - Freilos in later rounds: lowest-ranked player without a previous Freilos for whom the rest can be paired.
 *
 * Pure & deterministic: same input + seed → same pairing.
 */

export interface PairingPlayer {
  id: string;
  rating?: number;
  wins: number;
  buchholz: number;
  opponents: readonly string[];
  hadBye: boolean;
}

export interface PairingOptions {
  round: number;
  seed: number;
  withinGroupPairing: 'draw' | 'adjacent';
  allowRepeatsIfUnavoidable: boolean;
  /** Search budget for the backtracking (protects the UI from pathological cases). */
  maxSteps?: number;
}

export type PairingOutcome =
  | { ok: true; pairs: [string, string][]; bye?: string; notes: string[]; repeats: [string, string][] }
  | { ok: false; reason: string; notes: string[] };

export function pairSwissRound(players: readonly PairingPlayer[], opts: PairingOptions): PairingOutcome {
  const rng = mulberry32(hashSeed(opts.seed, 'swiss', opts.round));
  if (players.length < 2) return { ok: false, reason: 'Mindestens 2 aktive Teilnehmer erforderlich.', notes: [] };
  if (opts.round === 1 || players.every((p) => p.opponents.length === 0 && !p.hadBye)) return firstRound(players, rng);

  const notes: string[] = [];
  const ordered = orderForDraw(players, rng);
  const attempt = (allowRepeats: boolean) => {
    const budget = { steps: opts.maxSteps ?? 200_000 };
    let bye: string | undefined;
    let rest = ordered;
    if (ordered.length % 2 === 1) {
      // Freilos: from the bottom up, first player without a previous Freilos for whom the rest is pairable.
      for (let i = ordered.length - 1; i >= 0; i--) {
        const cand = ordered[i]!;
        if (cand.hadBye) continue;
        const others = ordered.filter((p) => p.id !== cand.id);
        const pairs = pairList(others, opts, rng, allowRepeats, budget);
        if (pairs) return { pairs, bye: cand.id };
        if (budget.steps <= 0) return { exhausted: true as const };
      }
      return undefined;
    }
    const pairs = pairList(rest, opts, rng, allowRepeats, budget);
    if (pairs) return { pairs, bye };
    if (budget.steps <= 0) return { exhausted: true as const };
    return undefined;
  };

  let res = attempt(false);
  let usedRepeats = false;
  if ((!res || 'exhausted' in res) && opts.allowRepeatsIfUnavoidable) {
    res = attempt(true);
    usedRepeats = true;
  }
  if (!res || 'exhausted' in res) {
    const exhausted = res && 'exhausted' in res;
    const allByes = ordered.length % 2 === 1 && ordered.every((p) => p.hadBye);
    return {
      ok: false,
      reason: exhausted
        ? 'Die Suche nach einer gültigen Paarung wurde abgebrochen (zu viele Kombinationen).'
        : allByes
          ? 'Alle Teilnehmer hatten bereits ein Freilos – nach den Regeln darf niemand ein zweites Freilos erhalten.'
          : 'Es gibt keine Auslosung, bei der niemand erneut auf einen bisherigen Gegner trifft. Bei wenigen Teilnehmern ist die maximale Rundenzahl erreicht.',
      notes: [
        'Mögliche Lösungen: Turnier mit der aktuellen Runde beenden, Rundenzahl reduzieren, oder in den Einstellungen „Wiederholung nur wenn unvermeidbar“ als Ausrichter-Entscheidung erlauben.',
      ],
    };
  }
  const opp = new Map(players.map((p) => [p.id, new Set(p.opponents)]));
  const repeats = res.pairs.filter(([a, b]) => opp.get(a)!.has(b));
  if (usedRepeats && repeats.length) notes.push(`Achtung: ${repeats.length} Wiederholungspaarung(en) waren unvermeidbar (Ausrichter-Option).`);
  const groups = new Set(players.map((p) => p.wins));
  notes.push(`Auslosung nach Siegesgruppen (${[...groups].sort((a, b) => b - a).join(', ')} Siege), innerhalb gleicher Siege nach Buchholz sortiert.`);
  if (res.bye) notes.push('Freilos an den tiefstplatzierten Spieler ohne bisheriges Freilos, für den der Rest paarbar ist.');
  return { ok: true, pairs: res.pairs, bye: res.bye, notes, repeats };
}

function firstRound(players: readonly PairingPlayer[], rng: Rng): PairingOutcome {
  // Strongest first; unknown rating at the end; ties broken by lot.
  const lot = new Map(shuffle(players.map((p) => p.id), rng).map((id, i) => [id, i]));
  const sorted = [...players].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || lot.get(a.id)! - lot.get(b.id)!);
  const n = sorted.length;
  const half = Math.ceil(n / 2);
  let upper = sorted.slice(0, Math.floor(n / 2));
  let lower = sorted.slice(Math.floor(n / 2));
  let bye: string | undefined;
  if (n % 2 === 1) {
    const drawn = shuffle(lower, rng);
    bye = drawn[0]!.id;
    lower = drawn.slice(1);
  } else lower = shuffle(lower, rng);
  void half;
  upper = upper.slice();
  const pairs: [string, string][] = upper.map((u, i) => [u.id, lower[i]!.id]);
  const notes = [
    `Runde 1: die ${upper.length} stärksten Spieler (nach Q-TTR/TTR) sind gesetzt und erhalten einen gelosten Gegner aus der unteren Hälfte.`,
  ];
  if (bye) notes.push('Das Freilos wurde unter der unteren Hälfte ausgelost.');
  return { ok: true, pairs, bye, notes, repeats: [] };
}

/** Order: wins desc, Buchholz desc, then lot. */
function orderForDraw(players: readonly PairingPlayer[], rng: Rng): PairingPlayer[] {
  const lot = new Map(shuffle(players.map((p) => p.id), rng).map((id, i) => [id, i]));
  return [...players].sort((a, b) => b.wins - a.wins || b.buchholz - a.buchholz || lot.get(a.id)! - lot.get(b.id)!);
}

/**
 * Backtracking: take the highest unpaired player, try opponents of the same win group first
 * (drawn or in order), then lower groups top-down. Avoids repeats unless allowed (then as last resort).
 */
function pairList(
  list: readonly PairingPlayer[],
  opts: PairingOptions,
  rng: Rng,
  allowRepeats: boolean,
  budget: { steps: number },
): [string, string][] | undefined {
  const opp = new Map(list.map((p) => [p.id, new Set(p.opponents)]));
  // Pre-compute the draw order within each group once so the search is deterministic.
  const drawRank = new Map(shuffle(list.map((p) => p.id), rng).map((id, i) => [id, i]));

  const rec = (remaining: PairingPlayer[]): [string, string][] | undefined => {
    if (remaining.length === 0) return [];
    if (--budget.steps <= 0) return undefined;
    const [p, ...rest] = remaining as [PairingPlayer, ...PairingPlayer[]];
    const same = rest.filter((q) => q.wins === p.wins);
    const lower = rest.filter((q) => q.wins !== p.wins);
    const sameOrdered = opts.withinGroupPairing === 'draw' ? [...same].sort((a, b) => drawRank.get(a.id)! - drawRank.get(b.id)!) : same;
    let candidates = [...sameOrdered, ...lower];
    const fresh = candidates.filter((q) => !opp.get(p.id)!.has(q.id));
    const repeat = candidates.filter((q) => opp.get(p.id)!.has(q.id));
    candidates = allowRepeats ? [...fresh, ...repeat] : fresh;
    for (const q of candidates) {
      const sub = rec(rest.filter((r) => r.id !== q.id));
      if (sub) return [[p.id, q.id], ...sub];
      if (budget.steps <= 0) return undefined;
    }
    return undefined;
  };
  return rec([...list]);
}

/**
 * Round robin ("Jeder gegen Jeden", WO D 7.5) via the circle method. Players are numbered by rating;
 * with an odd count a Freilos rotates through all players.
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
    // rotate all but the first
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}
