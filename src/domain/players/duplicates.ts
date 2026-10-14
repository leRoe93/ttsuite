import type { Player } from './model.ts';
import { normalizeName } from './normalize.ts';

export type MatchReason = 'licence' | 'internal-nr' | 'name-birthyear' | 'name-club' | 'name';

export interface DuplicateMatch {
  existing: Player;
  reason: MatchReason;
  /** Strong = identifier match; weak = name-based guess that needs human review. */
  strength: 'strong' | 'weak';
  /** Field-level differences between the existing and the incoming record. */
  conflicts: FieldConflict[];
}

export interface FieldConflict {
  field: 'club' | 'ttr' | 'qttr' | 'birthYear' | 'gender' | 'licenceNr';
  existing: string | number | undefined;
  incoming: string | number | undefined;
}

const nameKey = (p: Pick<Player, 'firstName' | 'lastName'>) => `${normalizeName(p.lastName)}|${normalizeName(p.firstName)}`;

export function findDuplicate(incoming: Player, pool: readonly Player[]): DuplicateMatch | undefined {
  const byId = (reason: MatchReason, pred: (p: Player) => boolean): DuplicateMatch | undefined => {
    const existing = pool.find(pred);
    return existing ? { existing, reason, strength: 'strong', conflicts: diff(existing, incoming) } : undefined;
  };
  if (incoming.licenceNr) {
    const m = byId('licence', (p) => p.licenceNr === incoming.licenceNr);
    if (m) return m;
  }
  if (incoming.internalNr) {
    const m = byId('internal-nr', (p) => p.internalNr === incoming.internalNr);
    if (m) return m;
  }
  const key = nameKey(incoming);
  const sameName = pool.filter((p) => nameKey(p) === key);
  if (sameName.length === 0) return undefined;
  const withYear = sameName.find((p) => p.birthYear && incoming.birthYear && p.birthYear === incoming.birthYear);
  if (withYear) return { existing: withYear, reason: 'name-birthyear', strength: 'weak', conflicts: diff(withYear, incoming) };
  const withClub = sameName.find((p) => p.club && incoming.club && normalizeName(p.club) === normalizeName(incoming.club));
  if (withClub) return { existing: withClub, reason: 'name-club', strength: 'weak', conflicts: diff(withClub, incoming) };
  const first = sameName[0]!;
  // A differing birth year is a strong hint that these are different people.
  if (first.birthYear && incoming.birthYear && first.birthYear !== incoming.birthYear) return undefined;
  return { existing: first, reason: 'name', strength: 'weak', conflicts: diff(first, incoming) };
}

export function diff(a: Player, b: Player): FieldConflict[] {
  const out: FieldConflict[] = [];
  const cmp = (field: FieldConflict['field'], x: string | number | undefined, y: string | number | undefined) => {
    if (x !== undefined && y !== undefined && x !== '' && y !== '' && x !== y) out.push({ field, existing: x, incoming: y });
  };
  cmp('club', a.club, b.club);
  cmp('ttr', a.ttr, b.ttr);
  cmp('qttr', a.rules.qttr, b.rules.qttr);
  cmp('birthYear', a.birthYear, b.birthYear);
  cmp('gender', a.gender, b.gender);
  cmp('licenceNr', a.licenceNr, b.licenceNr);
  return out;
}

/** Merge an incoming record into an existing one: incoming non-empty values win, local id and local rule flags are kept. */
export function mergePlayer(existing: Player, incoming: Player): Player {
  const pick = <T>(a: T | undefined, b: T | undefined) => (b !== undefined && b !== ('' as unknown) ? b : a);
  return {
    ...existing,
    firstName: incoming.firstName || existing.firstName,
    lastName: incoming.lastName || existing.lastName,
    club: pick(existing.club, incoming.club),
    clubNr: pick(existing.clubNr, incoming.clubNr),
    ttr: pick(existing.ttr, incoming.ttr),
    gender: pick(existing.gender, incoming.gender),
    birthYear: pick(existing.birthYear, incoming.birthYear),
    licenceNr: pick(existing.licenceNr, incoming.licenceNr),
    internalNr: pick(existing.internalNr, incoming.internalNr),
    clickTtPerson: incoming.clickTtPerson ?? existing.clickTtPerson,
    rules: {
      ...existing.rules,
      qttr: pick(existing.rules.qttr, incoming.rules.qttr),
      eligible: pick(existing.rules.eligible, incoming.rules.eligible),
      nachwuchs: pick(existing.rules.nachwuchs, incoming.rules.nachwuchs),
      sperrvermerk: pick(existing.rules.sperrvermerk, incoming.rules.sperrvermerk),
    },
    meta: incoming.meta,
  };
}
