import { newId, seedingRating, type Player } from '../players/model.ts';
import { pairSwissRound, roundRobinSchedule, type PairingPlayer } from '../pairing/ttRace.ts';
import { hashSeed, mulberry32, randomSeed, shuffle } from '../../lib/rng.ts';
import { activeIn, DEFAULT_CONFIG, effectiveSystem, plannedRounds, type Match, type MatchResult, type Participant, type Round, type Tournament } from './model.ts';
import { computeStandings } from './standings.ts';

/** Tournament state transitions. All functions are pure: they return a new Tournament or an error. */

export type Outcome = { ok: true; tournament: Tournament; notes?: string[] } | { ok: false; error: string; notes?: string[] };

const now = () => new Date().toISOString();
const touch = (t: Tournament): Tournament => ({ ...t, updatedAt: now() });

export function createTournament(init: { name: string; date: string; organizer: string; venue?: string; seed?: number }): Tournament {
  const ts = now();
  return {
    id: newId('t'),
    name: init.name,
    date: init.date,
    organizer: init.organizer,
    venue: init.venue,
    config: { ...DEFAULT_CONFIG, rngSeed: init.seed ?? randomSeed() },
    participants: [],
    confirmed: false,
    rounds: [],
    finished: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function addParticipants(t: Tournament, players: Player[]): Tournament {
  if (t.rounds.length) throw new Error('Nach Turnierbeginn können keine Teilnehmer hinzugefügt werden.');
  return touch({ ...t, confirmed: false, participants: [...t.participants, ...players.map((player) => ({ id: newId('tp'), player }))] });
}

export function removeParticipant(t: Tournament, participantId: string): Tournament {
  if (t.rounds.length) throw new Error('Nach Turnierbeginn bitte „Zurückziehen“ verwenden.');
  return touch({ ...t, confirmed: false, participants: t.participants.filter((p) => p.id !== participantId) });
}

export function updateParticipant(t: Tournament, participantId: string, player: Player): Tournament {
  return touch({ ...t, participants: t.participants.map((p) => (p.id === participantId ? { ...p, player } : p)) });
}

export interface SetupIssue {
  severity: 'error' | 'warning';
  message: string;
}

/** Checks before the participant list can be confirmed / the first round generated. */
export function checkSetup(t: Tournament): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const n = t.participants.length;
  const system = effectiveSystem(t);
  if (!t.name.trim()) issues.push({ severity: 'error', message: 'Turniername fehlt.' });
  if (n < 2) issues.push({ severity: 'error', message: 'Mindestens 2 Teilnehmer erforderlich.' });
  if (system === 'swiss') {
    const minRounds = Math.ceil(Math.log2(Math.max(n, 2)));
    if (t.config.rounds < minRounds)
      issues.push({ severity: 'warning', message: `WO D 7.6: Die Rundenzahl sollte mindestens der eines K.-o.-Systems entsprechen (${minRounds} Runden bei ${n} Teilnehmern), ideal ${minRounds + 2}.` });
    if (t.config.rounds > n - 1) issues.push({ severity: 'error', message: `Bei ${n} Teilnehmern sind ohne Wiederholungen höchstens ${n - 1} Runden möglich.` });
    if (n < 9) issues.push({ severity: 'warning', message: 'Das BTTV-TT-Race sieht das Schweizer System für 9–16 Teilnehmer vor; bei 7–8 Teilnehmern „Jeder gegen Jeden“.' });
  }
  if (system === 'round-robin' && n > 10) issues.push({ severity: 'warning', message: `„Jeder gegen Jeden“ mit ${n} Teilnehmern ergibt ${plannedRounds(t)} Runden.` });
  const noRating = t.participants.filter((p) => seedingRating(p.player) === undefined);
  if (noRating.length) issues.push({ severity: 'warning', message: `${noRating.length} Teilnehmer ohne TTR – sie werden in Runde 1 nicht gesetzt.` });
  const keys = new Map<string, number>();
  for (const p of t.participants) {
    const k = p.player.licenceNr ?? `${p.player.lastName.toLowerCase()}|${p.player.firstName.toLowerCase()}|${p.player.birthYear ?? ''}`;
    keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  const dups = [...keys.values()].filter((c) => c > 1).length;
  if (dups) issues.push({ severity: 'error', message: `${dups} mögliche(r) Doppeleintrag/-einträge in der Teilnehmerliste.` });
  return issues;
}

export function confirmParticipants(t: Tournament): Outcome {
  const errors = checkSetup(t).filter((i) => i.severity === 'error');
  if (errors.length) return { ok: false, error: errors.map((e) => e.message).join(' ') };
  return { ok: true, tournament: touch({ ...t, confirmed: true }) };
}

export function roundComplete(r: Round): boolean {
  return r.matches.every((m) => m.result);
}

export function canGenerateNextRound(t: Tournament): { ok: boolean; reason?: string } {
  if (!t.confirmed) return { ok: false, reason: 'Teilnehmerliste zuerst bestätigen.' };
  if (t.finished) return { ok: false, reason: 'Turnier ist abgeschlossen.' };
  const last = t.rounds[t.rounds.length - 1];
  if (last && !roundComplete(last)) return { ok: false, reason: `In Runde ${last.number} fehlen noch Ergebnisse.` };
  if (t.rounds.length >= plannedRounds(t)) return { ok: false, reason: 'Alle geplanten Runden sind ausgelost.' };
  return { ok: true };
}

function ratingOrder(t: Tournament): string[] {
  const lot = new Map(shuffle(t.participants.map((p) => p.id), mulberry32(hashSeed(t.config.rngSeed, 'rr-order'))).map((id, i) => [id, i]));
  return [...t.participants]
    .sort((a, b) => (seedingRating(b.player) ?? -1) - (seedingRating(a.player) ?? -1) || lot.get(a.id)! - lot.get(b.id)!)
    .map((p) => p.id);
}

export function generateNextRound(t: Tournament): Outcome {
  const check = canGenerateNextRound(t);
  if (!check.ok) return { ok: false, error: check.reason! };
  const number = t.rounds.length + 1;
  const system = effectiveSystem(t);
  let pairs: [string, string][];
  let bye: string | undefined;
  let notes: string[];

  if (system === 'round-robin') {
    const schedule = roundRobinSchedule(ratingOrder(t));
    const r = schedule[number - 1]!;
    // Withdrawn players: their scheduled match is a walkover win for the opponent (entered below).
    pairs = r.pairs;
    bye = r.bye;
    notes = ['Jeder gegen Jeden (WO D 7.5): fester Spielplan nach dem Rundenschema.'];
  } else {
    const standings = computeStandings(t);
    const byId = new Map(standings.map((s) => [s.participantId, s]));
    const active: PairingPlayer[] = t.participants
      .filter((p) => activeIn(p, number))
      .map((p) => {
        const s = byId.get(p.id)!;
        return {
          id: p.id,
          rating: seedingRating(p.player),
          wins: s.wins,
          buchholz: s.buchholz,
          opponents: s.opponents,
          hadBye: t.rounds.some((r) => r.bye === p.id),
        };
      });
    const out = pairSwissRound(active, {
      round: number,
      seed: t.config.rngSeed,
      withinGroupPairing: t.config.withinGroupPairing,
      allowRepeatsIfUnavoidable: t.config.allowRepeatsIfUnavoidable,
    });
    if (!out.ok) return { ok: false, error: out.reason, notes: out.notes };
    pairs = out.pairs;
    bye = out.bye;
    notes = out.notes;
  }

  const isOut = (id: string) => !activeIn(t.participants.find((p) => p.id === id)!, number);
  // Round robin: a match between two withdrawn players is dropped entirely.
  const matches: Match[] = pairs
    .filter(([a, b]) => !(isOut(a) && isOut(b)))
    .map(([a, b], i) => ({ id: newId('m'), a, b, table: t.config.tables ? (i % t.config.tables) + 1 : undefined }));
  // Round robin with a withdrawn player: the opponent wins kampflos (w.o.).
  const need = Math.ceil(t.config.bestOf / 2);
  for (const m of matches) {
    const outA = isOut(m.a);
    const outB = isOut(m.b);
    if (outA !== outB) m.result = { kind: 'walkover', winner: outA ? 'B' : 'A', setsA: outA ? 0 : need, setsB: outA ? need : 0, sets: [] };
  }
  if (bye && isOut(bye)) bye = undefined;
  const round: Round = { number, system, matches, bye, createdAt: now(), notes };
  return { ok: true, tournament: touch({ ...t, rounds: [...t.rounds, round] }), notes };
}

export function setResult(t: Tournament, roundNumber: number, matchId: string, result: MatchResult | undefined): Outcome {
  const round = t.rounds.find((r) => r.number === roundNumber);
  if (!round) return { ok: false, error: `Runde ${roundNumber} nicht gefunden.` };
  if (!round.matches.some((m) => m.id === matchId)) return { ok: false, error: 'Spiel nicht gefunden.' };
  const rounds = t.rounds.map((r) => (r.number !== roundNumber ? r : { ...r, matches: r.matches.map((m) => (m.id === matchId ? { ...m, result } : m)) }));
  const later = t.rounds.filter((r) => r.number > roundNumber);
  const notes = later.length
    ? [`Achtung: Runde ${later.map((r) => r.number).join(', ')} wurde(n) auf Basis des alten Ergebnisses ausgelost. Tabelle ist aktualisiert; ggf. Folgerunden neu auslosen (nur möglich, solange dort keine Ergebnisse vorliegen).`]
    : undefined;
  return { ok: true, tournament: touch({ ...t, rounds, finished: false }), notes };
}

/** Remove rounds after `keepUpTo` – only if they contain no entered results (protects data). */
export function discardRoundsAfter(t: Tournament, keepUpTo: number): Outcome {
  const drop = t.rounds.filter((r) => r.number > keepUpTo);
  if (drop.some((r) => r.matches.some((m) => m.result && !(m.result.kind === 'walkover' && autoWalkover(t, r, m))))) {
    return { ok: false, error: 'In den späteren Runden sind bereits Ergebnisse erfasst. Bitte diese zuerst löschen.' };
  }
  return { ok: true, tournament: touch({ ...t, rounds: t.rounds.filter((r) => r.number <= keepUpTo), finished: false }) };
}

function autoWalkover(t: Tournament, r: Round, m: Match): boolean {
  const pa = t.participants.find((p) => p.id === m.a);
  const pb = t.participants.find((p) => p.id === m.b);
  return !!pa && !!pb && (!activeIn(pa, r.number) || !activeIn(pb, r.number));
}

export function regenerateRound(t: Tournament, roundNumber: number): Outcome {
  const cleared = discardRoundsAfter(t, roundNumber - 1);
  if (!cleared.ok) return cleared;
  return generateNextRound(cleared.tournament);
}

/** Withdraw a participant after the given round (BTTV: keeps wins; remaining rounds count as kampflose Niederlage). */
export function withdraw(t: Tournament, participantId: string, afterRound: number): Tournament {
  return touch({ ...t, participants: t.participants.map((p): Participant => (p.id === participantId ? { ...p, withdrawnAfterRound: afterRound } : p)) });
}

export function undoWithdraw(t: Tournament, participantId: string): Tournament {
  return touch({ ...t, participants: t.participants.map((p): Participant => (p.id === participantId ? { ...p, withdrawnAfterRound: undefined } : p)) });
}

export function finishTournament(t: Tournament): Outcome {
  const last = t.rounds[t.rounds.length - 1];
  if (!last) return { ok: false, error: 'Es wurde noch keine Runde gespielt.' };
  if (!roundComplete(last)) return { ok: false, error: `In Runde ${last.number} fehlen noch Ergebnisse.` };
  return { ok: true, tournament: touch({ ...t, finished: true }) };
}

export function reopenTournament(t: Tournament): Tournament {
  return touch({ ...t, finished: false });
}
