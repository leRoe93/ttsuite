import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateSets, parseResult, validateSet } from '../src/domain/tournament/results.ts';
import { byeOrder, pairRound, roundRobinSchedule, type PairingPlayer } from '../src/domain/pairing/ttRace.ts';
import { computeStandings } from '../src/domain/tournament/standings.ts';
import {
  addParticipants,
  canGenerateNextRound,
  checkSetup,
  confirmParticipants,
  createTournament,
  discardRoundsAfter,
  finishTournament,
  generateNextRound,
  regenerateRound,
  setResult,
  withdraw,
} from '../src/domain/tournament/workflow.ts';
import type { MatchResult, Tournament } from '../src/domain/tournament/model.ts';
import { effectiveSystem, plannedRounds } from '../src/domain/tournament/model.ts';
import { buildClickTtResultXml } from '../src/exports/clickTtResults.ts';
import { readClickTtXml } from '../src/imports/clickTtXml.ts';
import { children, child, parseXml } from '../src/lib/xml.ts';
import { hashSeed, mulberry32 } from '../src/lib/rng.ts';
import { player } from './helpers.ts';

// ---- results ----------------------------------------------------------------------------

test('set validation per table tennis rules', () => {
  assert.equal(validateSet({ a: 11, b: 9 }), undefined);
  assert.equal(validateSet({ a: 12, b: 10 }), undefined);
  assert.equal(validateSet({ a: 15, b: 13 }), undefined);
  assert.ok(validateSet({ a: 11, b: 10 }));
  assert.ok(validateSet({ a: 12, b: 9 }));
  assert.ok(validateSet({ a: 10, b: 8 }));
  assert.ok(validateSet({ a: 14, b: 11 }));
});

test('result parsing: full scores, short notation, set count, walkover', () => {
  const full = parseResult('11:7 9:11 11:5 11:8', 5);
  assert.deepEqual([full.result?.setsA, full.result?.setsB, full.result?.winner], [3, 1, 'A']);
  const short = parseResult('7,-9,5,8', 5);
  assert.deepEqual(short.result?.sets, [{ a: 11, b: 7 }, { a: 9, b: 11 }, { a: 11, b: 5 }, { a: 11, b: 8 }]);
  const deuce = parseResult('-12 10 -0 -3', 5);
  assert.deepEqual(deuce.result?.sets, [{ a: 12, b: 14 }, { a: 12, b: 10 }, { a: 0, b: 11 }, { a: 3, b: 11 }]);
  assert.equal(deuce.result?.winner, 'B');
  const count = parseResult('2:1', 3);
  assert.equal(count.result?.sets.length, 0);
  assert.ok(count.warnings.length);
  assert.ok(parseResult('3:1', 3).errors.length);
  const wo = parseResult('w.o. B', 5);
  assert.equal(wo.result?.kind, 'walkover');
  assert.equal(wo.result?.setsB, 3);
});

test('result parsing rejects unfinished or over-played matches', () => {
  assert.match(parseResult('11:5 11:5', 5).errors[0]!, /nicht beendet/);
  assert.match(evaluateSets([{ a: 11, b: 1 }, { a: 11, b: 1 }, { a: 11, b: 1 }, { a: 11, b: 1 }], 5).errors[0]!, /bereits entschieden/);
  assert.ok(parseResult('11:10 11:5 11:5', 5).errors.length);
  assert.ok(parseResult('abc', 5).errors.length);
});

// ---- pairing ----------------------------------------------------------------------------
// Fixtures follow the TTVN document "TTVN_Race_MKTT_Cup_System.pdf" (examples 1–9, 2–10; 1–8, 2–7; 1–4, 2–3, 5–12 …).

function pp(id: string, rank: number, wins = 0, opponents: string[] = [], hadBye = false, rating?: number): PairingPlayer {
  return { id, rank, rating: rating ?? 2000 - rank * 10, wins, opponents, hadBye };
}
const P = (n: number) => `p${n}`;
const opt = (round: number) => ({ round, seed: 1, allowRepeatsIfUnavoidable: false });

test('round 1: upper half vs same position of lower half (1–9 … 8–16); odd → middle player has the Freilos', () => {
  const r16 = pairRound(Array.from({ length: 16 }, (_, i) => pp(P(i + 1), 0, 0, [], false, 2000 - i * 10)), opt(1));
  assert.ok(r16.ok);
  if (!r16.ok) return;
  assert.deepEqual(r16.pairs, Array.from({ length: 8 }, (_, i) => [P(i + 1), P(i + 9)]));
  const r13 = pairRound(Array.from({ length: 13 }, (_, i) => pp(P(13 - i), 0, 0, [], false, 2000 - (12 - i) * 10)), opt(1));
  assert.ok(r13.ok);
  if (!r13.ok) return;
  assert.equal(r13.bye, 'p7');
  assert.deepEqual(r13.pairs, [['p1', 'p8'], ['p2', 'p9'], ['p3', 'p10'], ['p4', 'p11'], ['p5', 'p12'], ['p6', 'p13']]);
});

test('rounds 2–4: first vs last inside each result group (round 2: 1–8, 2–7 … 9–16)', () => {
  // After round 1 (1–9 … 8–16, upper half won): table 1–8 have 1 win, 9–16 none.
  const players = Array.from({ length: 16 }, (_, i) => pp(P(i + 1), i + 1, i < 8 ? 1 : 0, [i < 8 ? P(i + 9) : P(i - 7)]));
  const r = pairRound(players, opt(2));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.pairs, [['p1', 'p8'], ['p2', 'p7'], ['p3', 'p6'], ['p4', 'p5'], ['p9', 'p16'], ['p10', 'p15'], ['p11', 'p14'], ['p12', 'p13']]);
});

test('round 3 example: groups 2/1/0 wins → 1–4, 2–3, 5–12, 6–11, 7–10, 8–9, 13–16, 14–15', () => {
  const wins = (n: number) => (n <= 4 ? 2 : n <= 12 ? 1 : 0);
  const players = Array.from({ length: 16 }, (_, i) => pp(P(i + 1), i + 1, wins(i + 1), []));
  const r = pairRound(players, opt(3));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.pairs, [['p1', 'p4'], ['p2', 'p3'], ['p5', 'p12'], ['p6', 'p11'], ['p7', 'p10'], ['p8', 'p9'], ['p13', 'p16'], ['p14', 'p15']]);
});

test('odd result group is filled from below; already played → next candidate', () => {
  // Group with 2 wins: p1..p3 (odd) → p4 (top of the 1-win group) is added: 1–4, 2–3.
  const r = pairRound([pp('p1', 1, 2), pp('p2', 2, 2), pp('p3', 3, 2), pp('p4', 4, 1), pp('p5', 5, 1), pp('p6', 6, 0)], opt(3));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.pairs, [['p1', 'p4'], ['p2', 'p3'], ['p5', 'p6']]);
  // p1 already played p4 → plays p3 (next from the end), p2 then plays p4.
  const r2 = pairRound([pp('p1', 1, 2, ['p4']), pp('p2', 2, 2), pp('p3', 3, 2), pp('p4', 4, 1, ['p1']), pp('p5', 5, 1), pp('p6', 6, 0)], opt(3));
  assert.ok(r2.ok);
  if (!r2.ok) return;
  assert.deepEqual(r2.pairs, [['p1', 'p3'], ['p2', 'p4'], ['p5', 'p6']]);
});

test('rounds 5–6: direct neighbours in the table (1–2, 3–4 …), skipping played pairings', () => {
  const players = Array.from({ length: 8 }, (_, i) => pp(P(i + 1), i + 1, 4 - Math.floor(i / 2)));
  const r = pairRound(players, opt(5));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.pairs, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6'], ['p7', 'p8']]);
  players[0] = pp('p1', 1, 4, ['p2']);
  players[1] = pp('p2', 2, 4, ['p1']);
  const r2 = pairRound(players, opt(6));
  assert.ok(r2.ok);
  if (!r2.ok) return;
  assert.deepEqual(r2.pairs, [['p1', 'p3'], ['p2', 'p4'], ['p5', 'p6'], ['p7', 'p8']]);
});

test('Freilos: from the middle downwards, then from the middle upwards; never twice', () => {
  assert.deepEqual(byeOrder(7), [3, 4, 5, 6, 2, 1, 0]);
  const players = Array.from({ length: 7 }, (_, i) => pp(P(i + 1), i + 1, 1, [], i >= 3)); // p4..p7 already had a bye
  const r = pairRound(players, opt(2));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.bye, 'p3');
  const fresh = pairRound(Array.from({ length: 7 }, (_, i) => pp(P(i + 1), i + 1, 1)), opt(2));
  assert.ok(fresh.ok && fresh.bye === 'p4');
});

test('pairing is deterministic', () => {
  const players = Array.from({ length: 12 }, (_, i) => pp(P(i + 1), i + 1, i % 3, []));
  assert.deepEqual(pairRound(players, opt(3)), pairRound(players, opt(3)));
});

test('no repeat pairing and at most one bye over 6 rounds (9–16 players, random results)', () => {
  for (let n = 9; n <= 16; n++) {
    for (const seed of [1, 2, 3]) {
      let t = mkTournament(n, seed);
      const rng = mulberry32(hashSeed('results', n, seed));
      for (let r = 1; r <= 6; r++) {
        const g = generateNextRound(t);
        assert.ok(g.ok, `n=${n} seed=${seed} round=${r}: ${!g.ok ? g.error : ''}`);
        if (!g.ok) return;
        t = g.tournament;
        t = playRound(t, r, () => (rng() < 0.5 ? 'A' : 'B'));
      }
      const seen = new Set<string>();
      const byes = new Map<string, number>();
      for (const round of t.rounds) {
        const inRound = new Set<string>();
        for (const m of round.matches) {
          const key = [m.a, m.b].sort().join('-');
          assert.ok(!seen.has(key), `repeat ${key} (n=${n}, seed=${seed})`);
          seen.add(key);
          assert.ok(!inRound.has(m.a) && !inRound.has(m.b), 'player twice in a round');
          inRound.add(m.a);
          inRound.add(m.b);
        }
        if (round.bye) byes.set(round.bye, (byes.get(round.bye) ?? 0) + 1);
        assert.equal(inRound.size + (round.bye ? 1 : 0), n, 'everybody plays or has a bye');
      }
      assert.ok([...byes.values()].every((c) => c === 1), 'no second bye');
      assert.equal(byes.size, n % 2 === 1 ? 6 : 0);
    }
  }
});

test('impossible pairing is explained instead of silently repeating', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const players = ids.map((id, i) => pp(id, i + 1, i % 2, ids.filter((x) => x !== id)));
  const r = pairRound(players, opt(4));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /bisherigen Gegner/);
  const allowed = pairRound(players, { ...opt(4), allowRepeatsIfUnavoidable: true });
  assert.ok(allowed.ok && allowed.repeats.length === 2);
});

test('second bye is never assigned', () => {
  const players = [pp('a', 1, 1, ['b'], true), pp('b', 2, 1, ['a', 'c'], true), pp('c', 3, 1, ['b'], true)];
  const r = pairRound(players, { ...opt(3), allowRepeatsIfUnavoidable: true });
  assert.equal(r.ok, false);
});

test('round robin schedule: everybody meets everybody exactly once; odd → bye rotates', () => {
  for (const n of [2, 3, 4, 7, 8]) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const sched = roundRobinSchedule(ids);
    const pairs = new Set<string>();
    const byes = new Set<string>();
    for (const r of sched) {
      for (const [a, b] of r.pairs) pairs.add([a, b].sort().join('-'));
      if (r.bye) byes.add(r.bye);
    }
    assert.equal(pairs.size, (n * (n - 1)) / 2, `n=${n}`);
    assert.equal(byes.size, n % 2 === 1 ? n : 0);
  }
});

// ---- standings --------------------------------------------------------------------------

test('Buchholz incl. Freilos valued with the wins of the last-placed player', () => {
  let t = mkTournament(3, 5);
  t = gen(t);
  // Round 1: one match + one bye
  t = playRound(t, 1, () => 'A');
  t = gen(t);
  t = playRound(t, 2, () => 'A');
  const s = computeStandings(t);
  const total = s.reduce((x, r) => x + r.wins, 0);
  assert.equal(total, 4, '2 matches + 2 byes');
  const minWins = Math.min(...s.map((r) => r.wins));
  for (const row of s) {
    const exp = row.opponents.reduce((x, o) => x + s.find((y) => y.participantId === o)!.wins, 0) + row.byes * minWins;
    assert.equal(row.buchholz, exp);
  }
});

test('ranking: wins → Buchholz → Feinbuchholz → set difference → sets won → lot', () => {
  // Circular: A beats B, B beats C, C beats A → equal wins, Buchholz, Feinbuchholz; sets decide.
  let t = mkTournament(3, 9);
  const [A, B, C] = t.participants.map((p) => p.id) as [string, string, string];
  t = withRounds(t, [[[A, B, 'A', 3, 0]], [[B, C, 'A', 3, 2]], [[C, A, 'A', 3, 1]]]);
  const st = computeStandings(t);
  assert.ok(st.every((r) => r.wins === 1 && r.buchholz === 2 && r.feinbuchholz === 4));
  // set diff: A 3:0 won, 1:3 lost → +1 ; B 0:3, 3:2 → -2 ; C 2:3, 3:1 → +1 ; A vs C: sets won A 4, C 5
  assert.deepEqual(st.map((r) => r.participantId), [C, A, B]);
  assert.equal(st[0]!.decidedBy, 'sets');
  assert.equal(st[1]!.decidedBy, 'setdiff');
  // Buchholz decides between equal wins
  let t2 = mkTournament(4, 3);
  const [a, b, c, d] = t2.participants.map((p) => p.id) as [string, string, string, string];
  t2 = withRounds(t2, [[[a, b, 'B'], [c, d, 'A']], [[a, c, 'A'], [b, d, 'A']]]);
  const s2 = computeStandings(t2);
  assert.equal(s2[0]!.participantId, b);
  assert.equal(s2[1]!.participantId, a);
  assert.equal(s2[1]!.decidedBy, 'buchholz');
});

test('withdrawn player keeps wins, unplayed rounds are losses, not paired anymore', () => {
  let t = mkTournament(10, 4);
  t = gen(t);
  t = playRound(t, 1, () => 'A');
  const leaver = t.rounds[0]!.matches[0]!.a; // a winner
  t = withdraw(t, leaver, 1);
  t = gen(t);
  assert.ok(!t.rounds[1]!.matches.some((m) => m.a === leaver || m.b === leaver));
  assert.ok(t.rounds[1]!.bye !== leaver);
  t = playRound(t, 2, () => 'A');
  const row = computeStandings(t).find((r) => r.participantId === leaver)!;
  assert.equal(row.wins, 1);
  assert.equal(row.losses, 1);
  assert.equal(row.walkoverLosses, 1);
});

// ---- workflow ---------------------------------------------------------------------------

test('workflow: setup checks, confirm, rounds, correction with regeneration, finish', () => {
  let t = createTournament({ name: '', date: '2026-11-13', organizer: 'TTC', seed: 1 });
  assert.ok(checkSetup(t).some((i) => i.severity === 'error'));
  t = { ...t, name: 'Test' };
  t = addParticipants(t, Array.from({ length: 11 }, (_, i) => player(`P${i}`, 1500 + i * 10, { firstName: `F${i}`, licenceNr: `L${i}` })));
  assert.equal(effectiveSystem(t), 'swiss');
  assert.equal(plannedRounds(t), 6);
  assert.equal(canGenerateNextRound(t).ok, false, 'must confirm first');
  const c = confirmParticipants(t);
  assert.ok(c.ok);
  if (!c.ok) return;
  t = gen(c.tournament);
  assert.equal(canGenerateNextRound(t).ok, false, 'results missing');
  t = playRound(t, 1, () => 'A');
  t = gen(t);
  const before = JSON.stringify(t.rounds[1]!.matches.map((m) => [m.a, m.b]));
  // Correct a result of round 1 → notes warn about round 2
  const m0 = t.rounds[0]!.matches[0]!;
  const corr = setResult(t, 1, m0.id, res('B'));
  assert.ok(corr.ok && corr.notes?.length);
  if (!corr.ok) return;
  t = corr.tournament;
  const regen = regenerateRound(t, 2);
  assert.ok(regen.ok);
  if (!regen.ok) return;
  t = regen.tournament;
  assert.equal(t.rounds.length, 2);
  void before;
  // Discarding rounds with results is refused
  t = playRound(t, 2, () => 'A');
  assert.equal(discardRoundsAfter(t, 1).ok, false);
  for (let r = 3; r <= 6; r++) {
    t = gen(t);
    t = playRound(t, r, () => 'B');
  }
  assert.equal(canGenerateNextRound(t).ok, false);
  const fin = finishTournament(t);
  assert.ok(fin.ok);
});

test('auto system: ≤ 8 participants → round robin with n−1 rounds', () => {
  let t = mkTournament(8, 2);
  assert.equal(effectiveSystem(t), 'round-robin');
  assert.equal(plannedRounds(t), 7);
  for (let r = 1; r <= 7; r++) {
    t = gen(t);
    t = playRound(t, r, () => 'A');
  }
  assert.equal(canGenerateNextRound(t).ok, false);
  assert.equal(computeStandings(t).reduce((s, r) => s + r.wins, 0), 28);
});

// ---- click-TT export --------------------------------------------------------------------

test('click-TT export: round trip with ids, set scores, skipping walkovers and byes', () => {
  const xml = readFileSync('sample-data/fiktives_tt-race_clicktt_teilnehmer.xml', 'utf8');
  const imp = readClickTtXml(xml);
  let t = createTournament({ name: 'X', date: '2026-11-13', organizer: 'Y', seed: 11 });
  t = addParticipants(t, imp.candidates.map((c) => c.player!));
  t = { ...t, clickTt: { tournament: imp.tournament!, competitionIndex: 0 } };
  const c = confirmParticipants(t);
  assert.ok(c.ok);
  if (!c.ok) return;
  t = gen(c.tournament);
  t = playRound(t, 1, () => 'A');
  // make one walkover
  const wo = t.rounds[0]!.matches[1]!;
  const r = setResult(t, 1, wo.id, { kind: 'walkover', winner: 'B', setsA: 0, setsB: 3, sets: [] });
  assert.ok(r.ok);
  if (!r.ok) return;
  t = r.tournament;
  const out = buildClickTtResultXml(t);
  assert.ok(out.xml);
  assert.equal(out.exportedMatches, t.rounds[0]!.matches.length - 1);
  assert.ok(out.checks.some((x) => x.message.includes('w.o.')));
  assert.ok(out.checks.some((x) => x.message.includes('Freilos')));
  const root = parseXml(out.xml!);
  assert.equal(root.attrs['tournament-id'], 'FIKTIV0000000000000000000000000001');
  const comp = child(root, 'competition')!;
  assert.equal(children(child(comp, 'players')!, 'player').length, 13);
  const matches = children(child(comp, 'matches')!, 'match');
  const m = matches[0]!;
  assert.match(m.attrs['group']!, /Schweizer System \(Runde 1\)/);
  assert.match(m.attrs['player-a']!, /^PLAYER\d+$/);
  assert.equal(m.attrs['matches-a'], '1');
  assert.equal(m.attrs['sets-a'], '3');
  assert.equal(m.attrs['set-a-7'], '0');
  assert.equal(Number(m.attrs['games-a']), Number(m.attrs['set-a-1']) + Number(m.attrs['set-a-2']) + Number(m.attrs['set-a-3']));
  // export is re-readable as a participant file (same structure)
  assert.equal(readClickTtXml(out.xml!).candidates.length, 13);
});

test('click-TT export: refused without click-TT origin; set-count-only results flagged', () => {
  let t = mkTournament(10, 1);
  assert.equal(buildClickTtResultXml(t).xml, undefined);
  const imp = readClickTtXml(readFileSync('sample-data/fiktives_tt-race_clicktt_teilnehmer.xml', 'utf8'));
  t = createTournament({ name: 'X', date: '2026-11-13', organizer: 'Y', seed: 11 });
  t = addParticipants(t, imp.candidates.map((c) => c.player!));
  t = { ...t, clickTt: { tournament: imp.tournament!, competitionIndex: 0 } };
  const c = confirmParticipants(t);
  if (!c.ok) throw new Error(c.error);
  t = gen(c.tournament);
  for (const m of t.rounds[0]!.matches) {
    const r = setResult(t, 1, m.id, { kind: 'played', winner: 'A', setsA: 3, setsB: 0, sets: [] });
    if (r.ok) t = r.tournament;
  }
  const out = buildClickTtResultXml(t);
  assert.ok(out.checks.some((x) => x.severity === 'error' && x.message.includes('Satzergebnisse')));
  assert.equal(out.exportedMatches, 0);
});

// ---- helpers ----------------------------------------------------------------------------

function mkTournament(n: number, seed: number): Tournament {
  let t = createTournament({ name: 'T', date: '2026-11-13', organizer: 'O', seed });
  t = addParticipants(t, Array.from({ length: n }, (_, i) => player(`P${i}`, 1800 - i * 37, { firstName: `F${i}`, licenceNr: `X${seed}-${i}` })));
  const c = confirmParticipants(t);
  if (!c.ok) throw new Error(c.error);
  return c.tournament;
}

function gen(t: Tournament): Tournament {
  const g = generateNextRound(t);
  if (!g.ok) throw new Error(g.error);
  return g.tournament;
}

function res(winner: 'A' | 'B'): MatchResult {
  const sets = winner === 'A' ? [{ a: 11, b: 5 }, { a: 11, b: 7 }, { a: 11, b: 9 }] : [{ a: 5, b: 11 }, { a: 7, b: 11 }, { a: 9, b: 11 }];
  return { kind: 'played', winner, setsA: winner === 'A' ? 3 : 0, setsB: winner === 'B' ? 3 : 0, sets };
}

function resSets(winner: 'A' | 'B', won: number, lost: number): MatchResult {
  const sets = [...Array(won).fill(winner === 'A' ? { a: 11, b: 5 } : { a: 5, b: 11 }), ...Array(lost).fill(winner === 'A' ? { a: 5, b: 11 } : { a: 11, b: 5 })];
  return { kind: 'played', winner, setsA: winner === 'A' ? won : lost, setsB: winner === 'A' ? lost : won, sets };
}

function playRound(t: Tournament, round: number, pick: () => 'A' | 'B'): Tournament {
  for (const m of t.rounds[round - 1]!.matches) {
    if (m.result) continue;
    const r = setResult(t, round, m.id, res(pick()));
    if (!r.ok) throw new Error(r.error);
    t = r.tournament;
  }
  return t;
}

function withRounds(t: Tournament, rounds: ([string, string, 'A' | 'B'] | [string, string, 'A' | 'B', number, number])[][]): Tournament {
  return {
    ...t,
    rounds: rounds.map((ms, i) => ({
      number: i + 1,
      system: 'swiss',
      createdAt: '',
      notes: [],
      matches: ms.map(([a, b, w, ws, ls], j) => ({ id: `m${i}-${j}`, a, b, result: ws === undefined ? res(w) : resSets(w, ws, ls!) })),
    })),
  };
}
