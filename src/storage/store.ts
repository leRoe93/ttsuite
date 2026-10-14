import type { Player } from '../domain/players/model.ts';
import type { TeamPlan } from '../domain/team-rules/model.ts';
import type { LineupRuleSet } from '../domain/team-rules/ruleSets.ts';
import type { Tournament } from '../domain/tournament/model.ts';

/**
 * Local-first persistence. All data stays in this browser (localStorage) unless the user
 * explicitly exports a backup file. Each feature owns its own slice; slices are versioned so
 * future tools can add theirs without touching existing ones.
 */

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'ttsuite:v1';

export interface AppData {
  schemaVersion: number;
  /** Shared player pool (Spielerpool) used by all tools. */
  players: Player[];
  teamPlans: TeamPlan[];
  customRuleSets: LineupRuleSet[];
  tournaments: Tournament[];
  /** Slices of future tools, keyed by feature id. */
  extensions: Record<string, unknown>;
}

export function emptyData(): AppData {
  return { schemaVersion: SCHEMA_VERSION, players: [], teamPlans: [], customRuleSets: [], tournaments: [], extensions: {} };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export type LoadResult = { ok: true; data: AppData; recovered?: boolean } | { ok: false; error: string; raw: string };

export function load(kv: KeyValueStore): LoadResult {
  let raw: string | null;
  try {
    raw = kv.getItem(STORAGE_KEY);
  } catch {
    return { ok: true, data: emptyData() };
  }
  if (!raw) return { ok: true, data: emptyData() };
  try {
    const parsed = JSON.parse(raw);
    const v = validateAppData(parsed);
    if (!v.ok) return { ok: false, error: v.errors.join('; '), raw };
    return { ok: true, data: v.data };
  } catch {
    return { ok: false, error: 'Gespeicherte Daten sind beschädigt (kein gültiges JSON).', raw };
  }
}

export type SaveResult = { ok: true; bytes: number } | { ok: false; error: string };

export function save(kv: KeyValueStore, data: AppData): SaveResult {
  const json = JSON.stringify(data);
  try {
    kv.setItem(STORAGE_KEY, json);
    return { ok: true, bytes: json.length * 2 };
  } catch (e) {
    const quota = e instanceof Error && /quota/i.test(e.name + e.message);
    return { ok: false, error: quota ? 'Browser-Speicher voll – bitte eine Sicherung exportieren und alte Turniere löschen.' : 'Speichern im Browser nicht möglich (privater Modus?).' };
  }
}

/** Upgrade older data shapes. Add a step here whenever SCHEMA_VERSION increases. */
export function migrate(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  if (!('extensions' in out)) out['extensions'] = {};
  if (!('customRuleSets' in out)) out['customRuleSets'] = [];
  return out;
}

export function validateAppData(input: unknown): { ok: true; data: AppData } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, errors: ['Kein gültiges Datenobjekt.'] };
  const d = migrate(input as Record<string, unknown>);
  const v = d['schemaVersion'];
  if (typeof v !== 'number') errors.push('schemaVersion fehlt.');
  else if (v > SCHEMA_VERSION) errors.push(`Daten stammen aus einer neueren Version (Schema ${v}).`);
  for (const key of ['players', 'teamPlans', 'customRuleSets', 'tournaments'] as const) {
    if (!Array.isArray(d[key])) errors.push(`Feld „${key}“ fehlt oder ist keine Liste.`);
  }
  if (Array.isArray(d['players'])) {
    (d['players'] as unknown[]).forEach((p, i) => {
      const o = p as Partial<Player>;
      if (!o || typeof o.id !== 'string' || typeof o.lastName !== 'string' || typeof o.rules !== 'object') errors.push(`Spieler ${i + 1} ist unvollständig.`);
    });
  }
  if (Array.isArray(d['tournaments'])) {
    (d['tournaments'] as unknown[]).forEach((t, i) => {
      const o = t as Partial<Tournament>;
      if (!o || typeof o.id !== 'string' || !Array.isArray(o.participants) || !Array.isArray(o.rounds) || typeof o.config !== 'object') errors.push(`Turnier ${i + 1} ist unvollständig.`);
    });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { ...(d as unknown as AppData), schemaVersion: SCHEMA_VERSION } };
}

// ---- Backup files -------------------------------------------------------------------------

export const BACKUP_FORMAT = 'ttsuite-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  kind: 'full' | 'tournament';
  exportedAt: string;
  appVersion: string;
  data: AppData | Tournament;
}

export function makeBackup(data: AppData, appVersion: string): string {
  const b: BackupFile = { format: BACKUP_FORMAT, kind: 'full', exportedAt: new Date().toISOString(), appVersion, data };
  return JSON.stringify(b, null, 1);
}

export function makeTournamentBackup(t: Tournament, appVersion: string): string {
  const b: BackupFile = { format: BACKUP_FORMAT, kind: 'tournament', exportedAt: new Date().toISOString(), appVersion, data: t };
  return JSON.stringify(b, null, 1);
}

export type ParsedBackup =
  | { ok: true; kind: 'full'; data: AppData; exportedAt: string; summary: string }
  | { ok: true; kind: 'tournament'; tournament: Tournament; exportedAt: string; summary: string }
  | { ok: false; error: string };

export function parseBackup(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Datei ist kein gültiges JSON.' };
  }
  const b = parsed as Partial<BackupFile>;
  if (!b || b.format !== BACKUP_FORMAT) return { ok: false, error: 'Keine TTSuite-Sicherungsdatei.' };
  if (b.kind === 'tournament') {
    const t = b.data as Tournament;
    const check = validateAppData({ schemaVersion: SCHEMA_VERSION, players: [], teamPlans: [], customRuleSets: [], tournaments: [t] });
    if (!check.ok) return { ok: false, error: check.errors.join(' ') };
    return { ok: true, kind: 'tournament', tournament: t, exportedAt: b.exportedAt ?? '', summary: `Turnier „${t.name}“ mit ${t.participants.length} Teilnehmern, ${t.rounds.length} Runde(n)` };
  }
  const check = validateAppData(b.data);
  if (!check.ok) return { ok: false, error: check.errors.join(' ') };
  const d = check.data;
  return {
    ok: true,
    kind: 'full',
    data: d,
    exportedAt: b.exportedAt ?? '',
    summary: `${d.players.length} Spieler, ${d.teamPlans.length} Mannschaftsplanung(en), ${d.tournaments.length} Turnier(e)`,
  };
}
