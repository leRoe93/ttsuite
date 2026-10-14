import type { Player } from '../players/model.ts';
import type { ClickTtTournamentRef } from '../../imports/clickTtXml.ts';

export type Side = 'A' | 'B';

export interface SetScore {
  a: number;
  b: number;
}

export interface MatchResult {
  /** played = regular match; walkover = kampflos ("w.o.") */
  kind: 'played' | 'walkover';
  winner: Side;
  setsA: number;
  setsB: number;
  /** Individual set scores. May be empty if only the set count was entered (not sufficient for click-TT). */
  sets: SetScore[];
}

export interface Match {
  id: string;
  a: string; // participant id
  b: string; // participant id
  table?: number;
  result?: MatchResult;
}

export type PairingSystem = 'swiss' | 'round-robin';

export interface Round {
  number: number;
  system: PairingSystem;
  matches: Match[];
  /** Participant with a Freilos in this round (counts as a win). */
  bye?: string;
  createdAt: string;
  /** Human-readable explanation of how the pairing was made. */
  notes: string[];
}

export interface Participant {
  id: string;
  player: Player;
  /** Withdrawn after this round number (0 = before round 1). Not paired afterwards. */
  withdrawnAfterRound?: number;
}

export interface TournamentConfig {
  format: 'tt-race';
  /** 'auto' = round robin up to `roundRobinMax` participants, otherwise Swiss system. */
  system: 'auto' | PairingSystem;
  roundRobinMax: number;
  /** Number of rounds for the Swiss system. */
  rounds: number;
  bestOf: 3 | 5 | 7;
  /** Last tie-break after wins, Buchholz and direct comparison. */
  finalTieBreak: 'lot' | 'lower-rating';
  /** Round 1 pairing (see PairingOptions.round1). Missing in tournaments created before 10/2026 → 'seeded-draw'. */
  round1Pairing?: 'slide' | 'seeded-draw';
  /** How opponents are chosen inside a group of equal wins. */
  withinGroupPairing: 'draw' | 'adjacent';
  /** Allow a repeat pairing only if no repeat-free pairing exists (organiser decision). */
  allowRepeatsIfUnavoidable: boolean;
  /** Seed for all draws – stored so every draw is reproducible. */
  rngSeed: number;
  tables?: number;
}

export interface Tournament {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  organizer: string;
  venue?: string;
  config: TournamentConfig;
  participants: Participant[];
  /** Participant list confirmed → rounds may be generated. */
  confirmed: boolean;
  rounds: Round[];
  finished: boolean;
  clickTt?: { tournament: ClickTtTournamentRef; competitionIndex: number };
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_CONFIG: Omit<TournamentConfig, 'rngSeed'> = {
  format: 'tt-race',
  system: 'auto',
  roundRobinMax: 8,
  rounds: 6,
  bestOf: 5,
  finalTieBreak: 'lot',
  round1Pairing: 'slide',
  withinGroupPairing: 'adjacent',
  allowRepeatsIfUnavoidable: false,
};

export function activeIn(p: Participant, roundNumber: number): boolean {
  return p.withdrawnAfterRound === undefined || roundNumber <= p.withdrawnAfterRound;
}

export function effectiveSystem(t: Tournament): PairingSystem {
  if (t.config.system !== 'auto') return t.config.system;
  return t.participants.length <= t.config.roundRobinMax ? 'round-robin' : 'swiss';
}

/** Total rounds of the tournament. Round robin: everybody plays everybody once. */
export function plannedRounds(t: Tournament): number {
  const n = t.participants.length;
  if (effectiveSystem(t) === 'round-robin') return n % 2 === 0 ? n - 1 : n;
  return t.config.rounds;
}
