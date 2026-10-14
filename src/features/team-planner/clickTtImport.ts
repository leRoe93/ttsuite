import { fullName, type Player } from '../../domain/players/model.ts';
import { normalizeName } from '../../domain/players/normalize.ts';
import type { LineupRole, TeamPlan } from '../../domain/team-rules/model.ts';
import { parseRegistrationHeading } from '../../imports/clickTtWeb.ts';
import { guessMapping, mapRows, readTable, TABLE_PRESETS } from '../../imports/tabular.ts';
import type { LineupHints } from '../../imports/types.ts';
import { newTeam } from './state.ts';

/**
 * One-step import of a copied click-TT page into a plan. Two page types are recognised automatically:
 *  - 'qttr-list':    "Q-TTR-Liste pro Verein" – ALL players of the club with Q-TTR (Name, Vorname | Q-TTR).
 *                    Players go into the pool; the lineup is not touched.
 *  - 'registration': "Mannschaftsmeldungen …" – players plus teams, positions, RES/WES/NES/SES, SPV, SBEM.
 * Pure: text + current data in, preview / new data out. No React, no storage.
 */

export interface ClickTtRow {
  incoming: Player;
  hints: LineupHints;
  /** Player already in the pool (matched by name, and club if both are known). */
  existing?: Player;
}

export interface ClickTtPreview {
  recognized: true;
  kind: 'registration' | 'qttr-list';
  rows: ClickTtRow[];
  teamCount: number;
  club?: string;
  heading: { season?: string; half?: 'VR' | 'RR'; contest?: string };
  /** Plan settings that differ from the pasted registration. */
  mismatch: { season?: [string, string]; half?: [string, string]; contest?: [string, string] };
  warnings: string[];
}

export type ClickTtParse = ClickTtPreview | { recognized: false; reason: string };

/** Name key for matching; academic titles are ignored ("Dr. Tschirch, Jessica" = "Tschirch, Dr. Jessica"). */
const stripTitles = (s: string) => normalizeName(s).replace(/\b(dr|prof|dipl)\b/g, ' ').replace(/\s+/g, ' ').trim();
export const nameKey = (p: Pick<Player, 'firstName' | 'lastName'>) => `${stripTitles(p.lastName)}|${stripTitles(p.firstName)}`;
const key = nameKey;

export function parseClickTtRegistration(text: string, pool: readonly Player[], plan: TeamPlan): ClickTtParse {
  let table;
  try {
    table = readTable(text);
  } catch (e) {
    return { recognized: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (!table.hasHeader) return { recognized: false, reason: 'Keine Tabelle mit den Spalten „Name, Vorname“ und „Q-TTR“ gefunden.' };
  const mapping = guessMapping(table.headers, TABLE_PRESETS[0]);
  if (!mapping.includes('qttr') || !(mapping.includes('lastName') || mapping.includes('fullName'))) {
    return { recognized: false, reason: 'Die Tabelle hat keine Spalten „Name, Vorname“ und „Q-TTR“ wie die click-TT-Seiten.' };
  }
  const preview = mapRows(table, mapping, 'click-tt-table', { fileName: 'click-TT' });
  const valid = preview.candidates.filter((c) => c.player && !c.issues.some((i) => i.severity === 'error'));
  const ranked = valid.filter((c) => c.hints?.teamNumber);
  const kind: ClickTtPreview['kind'] = mapping.includes('position') && ranked.length > 0 ? 'registration' : 'qttr-list';
  if (mapping.includes('position') && ranked.length === 0) return { recognized: false, reason: 'In der Spalte „Rang“ stehen keine Werte wie „1.1“, „2.3“.' };
  const used = kind === 'registration' ? ranked : valid;
  if (used.length === 0) return { recognized: false, reason: 'Keine Spieler in der Tabelle gefunden.' };

  const byKey = new Map<string, Player[]>();
  for (const p of pool) byKey.set(key(p), [...(byKey.get(key(p)) ?? []), p]);
  const club = table.contextClub;
  const rows: ClickTtRow[] = used.map((c) => {
    const same = byKey.get(key(c.player!)) ?? [];
    const existing = same.find((p) => !p.club || !club || normalizeName(p.club) === normalizeName(club)) ?? undefined;
    return { incoming: c.player!, hints: c.hints ?? { flags: [] }, existing };
  });

  const heading = parseRegistrationHeading(text);
  const mismatch: ClickTtPreview['mismatch'] = {};
  if (heading.season && heading.season !== plan.season) mismatch.season = [plan.season, heading.season];
  if (heading.half && heading.half !== plan.halfSeason) mismatch.half = [plan.halfSeason, heading.half];
  const planContest = plan.ageClass === 'nachwuchs' ? 'Nachwuchs' : plan.contest ?? 'Erwachsene';
  if (heading.contest && normalizeName(heading.contest) !== normalizeName(planContest) && !(planContest === 'Nachwuchs' && /jugend|schueler|mini/i.test(normalizeName(heading.contest)))) {
    mismatch.contest = [planContest, heading.contest];
  }
  const warnings: string[] = [];
  const skipped = preview.candidates.length - used.length;
  if (skipped > 0) warnings.push(`${skipped} Zeile(n) ohne gültigen Rang oder Namen übersprungen.`);
  const noQttr = rows.filter((r) => r.incoming.rules.qttr === undefined).length;
  if (noQttr) warnings.push(`${noQttr} Spieler ohne Q-TTR (z. B. Nachmeldungen) – der Spielleiter ordnet sie ein.`);
  const star = rows.filter((r) => r.incoming.rules.qttrProvisional).length;
  if (star) warnings.push(`${star} Spieler mit Q-TTR* (weniger als 10 Einzel) – nicht vergleichbar, der Spielleiter ordnet sie ein.`);
  const teamCount = Math.max(0, ...rows.map((r) => r.hints.teamNumber ?? 0));
  return { recognized: true, kind, rows, teamCount, club, heading, mismatch, warnings };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];

/**
 * Applies a parsed registration: creates/updates players and replaces the plan's lineup by the
 * registration (teams, positions, RES/WES/NES/SES, SPV). Teams that already exist keep their name,
 * league and Sollstärke; missing ones are created.
 */
export function applyClickTtRegistration(
  pool: readonly Player[],
  plan: TeamPlan,
  preview: ClickTtPreview,
  opts: { adoptHeading: boolean; now?: Date; clubName?: string },
): { players: Player[]; plan: TeamPlan; added: number; updated: number } {
  if (preview.kind === 'qttr-list') return applyQttrList(pool, plan, preview, opts);
  const target: TeamPlan = opts.adoptHeading
    ? {
        ...plan,
        season: preview.heading.season ?? plan.season,
        halfSeason: preview.heading.half ?? plan.halfSeason,
        contest: /damen/i.test(preview.heading.contest ?? '') ? 'Damen' : /erwachsene|herren/i.test(preview.heading.contest ?? '') ? 'Erwachsene' : plan.contest,
      }
    : plan;
  const importedAt = (opts.now ?? new Date()).toISOString();
  const byId = new Map(pool.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;
  const finalIds: { id: string; hints: LineupHints }[] = [];
  for (const row of preview.rows) {
    const i = row.incoming;
    const spvFlag = row.hints.flags.includes('SPV');
    const spv = spvFlag ? { teamNumber: row.hints.teamNumber!, season: target.season, half: target.halfSeason, source: 'click-tt' as const, note: `click-TT ${target.halfSeason} ${target.season}` } : undefined;
    if (row.existing) {
      const e = byId.get(row.existing.id) ?? row.existing;
      const keepManualSpv = e.rules.sperrvermerk && e.rules.sperrvermerk.source !== 'click-tt' ? e.rules.sperrvermerk : undefined;
      byId.set(e.id, {
        ...e,
        club: e.club ?? i.club,
        rules: {
          ...e.rules,
          qttr: i.rules.qttr,
          qttrProvisional: i.rules.qttrProvisional,
          nachwuchs: i.rules.nachwuchs ?? e.rules.nachwuchs,
          sperrvermerk: spv ?? keepManualSpv,
        },
        meta: { ...e.meta, source: 'click-tt-table', importedAt, fileName: 'click-TT Mannschaftsmeldung' },
      });
      updated++;
      finalIds.push({ id: e.id, hints: row.hints });
    } else {
      const p: Player = { ...i, rules: { ...i.rules, sperrvermerk: spv }, meta: { ...i.meta, importedAt } };
      byId.set(p.id, p);
      added++;
      finalIds.push({ id: p.id, hints: row.hints });
    }
  }

  // Replace the lineup: keep team objects by position, create missing ones.
  const prefix = target.name || (target.contest === 'Damen' ? 'Damen' : 'Herren');
  const defaultSoll = target.contest === 'Damen' || target.ageClass === 'nachwuchs' ? 4 : 6;
  const teams = Array.from({ length: Math.max(preview.teamCount, target.teams.length) }, (_, idx) => {
    const t = target.teams[idx] ?? newTeam(`${prefix} ${ROMAN[idx] ?? idx + 1}`, target.teams[0]?.sollstaerke ?? defaultSoll);
    return { ...t, slots: [] as { playerId: string; role: LineupRole }[] };
  });
  finalIds
    .sort((a, b) => a.hints.teamNumber! - b.hints.teamNumber! || (a.hints.position ?? 0) - (b.hints.position ?? 0))
    .forEach(({ id, hints }) => {
      const role: LineupRole = (['RES', 'WES', 'NES', 'SES'] as const).find((r) => hints.flags.includes(r)) ?? 'stamm';
      teams[hints.teamNumber! - 1]!.slots.push({ playerId: id, role });
    });
  const inPlan = new Set(finalIds.map((f) => f.id));
  return {
    players: [...byId.values()],
    plan: { ...target, teams, spvRequested: target.spvRequested.filter((id) => inPlan.has(id)), updatedAt: importedAt },
    added,
    updated,
  };
}

export function describeRow(r: ClickTtRow): string {
  return `${r.hints.teamNumber}.${r.hints.position} ${fullName(r.incoming)}`;
}

/** Q-TTR list: add new players to the pool, update Q-TTR of known ones. The lineup stays as it is. */
function applyQttrList(
  pool: readonly Player[],
  plan: TeamPlan,
  preview: ClickTtPreview,
  opts: { now?: Date; clubName?: string },
): { players: Player[]; plan: TeamPlan; added: number; updated: number } {
  const importedAt = (opts.now ?? new Date()).toISOString();
  const byId = new Map(pool.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;
  for (const row of preview.rows) {
    const i = row.incoming;
    const meta = { ...i.meta, source: 'click-tt-table' as const, importedAt, fileName: 'click-TT Q-TTR-Liste' };
    if (row.existing) {
      const e = byId.get(row.existing.id) ?? row.existing;
      byId.set(e.id, { ...e, club: e.club ?? opts.clubName, rules: { ...e.rules, qttr: i.rules.qttr, qttrProvisional: i.rules.qttrProvisional }, meta });
      updated++;
    } else {
      byId.set(i.id, { ...i, club: i.club ?? opts.clubName, meta });
      added++;
    }
  }
  return { players: [...byId.values()], plan, added, updated };
}

/**
 * Suggestion for a lineup: the strongest players by Q-TTR fill team 1 up to its size, then team 2 …
 * Players without comparable Q-TTR are left unassigned (the Spielleiter places them).
 */
export function distributeByQttr(plan: TeamPlan, players: readonly Player[], teamCount: number, size: number): TeamPlan {
  const ranked = [...players]
    .filter((p) => p.rules.qttr !== undefined && !p.rules.qttrProvisional && p.rules.eligible !== false)
    .sort((a, b) => b.rules.qttr! - a.rules.qttr!);
  const prefix = plan.name || 'Mannschaft';
  const teams = Array.from({ length: teamCount }, (_, i) => {
    const t = plan.teams[i] ?? newTeam(`${prefix} ${ROMAN[i] ?? i + 1}`, size);
    return { ...t, sollstaerke: size, slots: ranked.slice(i * size, (i + 1) * size).map((p) => ({ playerId: p.id, role: 'stamm' as LineupRole })) };
  });
  return { ...plan, teams, spvRequested: [] };
}
