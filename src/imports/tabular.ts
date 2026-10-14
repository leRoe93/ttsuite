import type { Player, SourceId } from '../domain/players/model.ts';
import { newId } from '../domain/players/model.ts';
import { parseGender, parseRating, parseYear, splitFullName } from '../domain/players/normalize.ts';
import { detectDelimiter, parseDelimited, type Delimiter } from './csv.ts';
import type { ImportCandidate, ImportIssue, ImportPreview } from './types.ts';

/**
 * Generic table import (CSV/TSV file or pasted table) with a user-correctable column mapping.
 *
 * Neither click-TT nor myTischtennis publish a documented player-list export format for clubs,
 * so the "presets" below only provide header-name aliases that commonly appear when such tables
 * are exported or copied. The user always sees and can correct the mapping before importing.
 */

export type FieldKey =
  | 'ignore'
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'club'
  | 'clubNr'
  | 'qttr'
  | 'ttr'
  | 'gender'
  | 'birthYear'
  | 'licenceNr'
  | 'internalNr'
  | 'team'
  | 'position'
  | 'flags';

export const FIELD_LABELS: Record<FieldKey, string> = {
  ignore: '– ignorieren –',
  fullName: 'Name (komplett)',
  firstName: 'Vorname',
  lastName: 'Nachname',
  club: 'Verein',
  clubNr: 'Vereinsnummer',
  qttr: 'Q-TTR',
  ttr: 'TTR (aktuell)',
  gender: 'Geschlecht',
  birthYear: 'Geburtsjahr/-datum',
  licenceNr: 'Lizenz-/Spieler-Nr.',
  internalNr: 'click-TT Personen-Nr.',
  team: 'Mannschaft',
  position: 'Position/Rang',
  flags: 'Kennzeichen (RES, SPV, WES, NES …)',
};

const BASE_ALIASES: Record<Exclude<FieldKey, 'ignore'>, string[]> = {
  fullName: ['name', 'spieler', 'spielerin', 'spieler/in', 'spieler(in)', 'person'],
  firstName: ['vorname', 'firstname', 'first name'],
  lastName: ['nachname', 'familienname', 'lastname', 'last name', 'name, vorname'],
  club: ['verein', 'club', 'vereinsname'],
  clubNr: ['vereinsnr', 'vereinsnummer', 'vereins-nr', 'club-nr'],
  qttr: ['q-ttr', 'qttr', 'q-ttr-wert', 'q ttr', 'quartals-ttr'],
  ttr: ['ttr', 'ttr-wert', 'ttr wert', 'aktueller ttr', 'live-pz', 'livepz'],
  gender: ['geschlecht', 'sex', 'g'],
  birthYear: ['geburtsjahr', 'jahrgang', 'jg', 'jg.', 'geburtsdatum', 'geb.', 'geboren'],
  licenceNr: ['lizenz', 'lizenznr', 'lizenz-nr', 'lizenznummer', 'spielerlizenz', 'spieler-nr', 'spielernr', 'licence-nr'],
  internalNr: ['personennr', 'personen-nr', 'person-nr', 'internal-nr', 'nu-id'],
  team: ['mannschaft', 'team', 'mannsch.'],
  position: ['position', 'pos', 'pos.', 'rang', 'nr', 'nr.', 'platz'],
  flags: ['status', 'kennzeichen', 'vermerk', 'bemerkung', 'spv', 'res', 'kz'],
};

export interface TablePreset {
  id: SourceId;
  label: string;
  hint: string;
  extraAliases?: Partial<Record<Exclude<FieldKey, 'ignore'>, string[]>>;
}

export const TABLE_PRESETS: TablePreset[] = [
  {
    id: 'click-tt-table',
    label: 'click-TT Mannschaftsmeldung',
    hint:
      'Öffentliche Seite „Mannschaftsmeldungen“ des Vereins in click-TT öffnen, alles markieren (Strg+A / ⌘A), kopieren und hier einfügen. Rang (z. B. 2.3), Q-TTR, Name und Status werden erkannt.',
    extraAliases: { flags: ['spv', 'res', 'status'], position: ['rang', 'pos.'] },
  },
  {
    id: 'mytischtennis-table',
    label: 'myTischtennis (TTR-Rangliste kopiert)',
    hint:
      'TTR-Rangliste des Vereins in myTischtennis öffnen (Login erforderlich), Tabelle markieren, kopieren und hier einfügen. Es gibt keine offizielle Exportfunktion/API – nur selbst kopierte Daten verwenden.',
    extraAliases: { ttr: ['ttr', 'ttr-punkte', 'punkte'], position: ['rang', '#'] },
  },
  {
    id: 'generic-table',
    label: 'Eigene Tabelle (CSV/Excel)',
    hint: 'Beliebige Tabelle mit Kopfzeile, z. B. aus Excel als „CSV (Trennzeichen-getrennt)“ gespeichert. Siehe Vorlage in sample-data/.',
  },
];

function normHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, ' ').replace(/[:]/g, '').trim();
}

export function guessMapping(headers: string[], preset?: TablePreset): FieldKey[] {
  const used = new Set<FieldKey>();
  return headers.map((raw) => {
    const h = normHeader(raw);
    for (const key of Object.keys(BASE_ALIASES) as Exclude<FieldKey, 'ignore'>[]) {
      const aliases = [...BASE_ALIASES[key], ...(preset?.extraAliases?.[key] ?? [])];
      if (aliases.includes(h) && !used.has(key)) {
        // "Name" together with a separate "Vorname" column means last name.
        used.add(key);
        return key;
      }
    }
    return 'ignore';
  }).map((k, _i, arr) => (k === 'fullName' && arr.includes('firstName') ? 'lastName' : k));
}

/** Heuristic: first row is a header if it contains no plausible rating and at least one known alias. */
export function looksLikeHeader(row: string[]): boolean {
  const known = guessMapping(row).filter((k) => k !== 'ignore').length;
  const hasNumber = row.some((c) => /^\d{3,4}$/.test(c.trim()));
  return known > 0 && !hasNumber;
}

export interface TableParseResult {
  delimiter: Delimiter;
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
  /** 1-based line of the header row in the pasted text (0 = no header). */
  headerLine: number;
  /** Club name found above the table in a full-page copy of click-TT ("<Verein>" followed by "Mannschaftsmeldungen …"). */
  contextClub?: string;
}

export function readTable(text: string): TableParseResult {
  const delimiter = detectDelimiter(text);
  const all = parseDelimited(text, delimiter);
  if (all.length === 0) return { delimiter, headers: [], rows: [], hasHeader: false, headerLine: 0 };
  // A full-page copy (e.g. Strg+A on click-TT) has title lines before the table: look for the header row.
  let headerIdx = all.slice(0, 40).findIndex((r) => r.length >= 2 && looksLikeHeader(r));
  if (headerIdx < 0 && looksLikeHeader(all[0]!)) headerIdx = 0;
  const hasHeader = headerIdx >= 0;
  const body = hasHeader ? all.slice(headerIdx + 1) : all;
  let contextClub: string | undefined;
  if (headerIdx > 0) {
    const pre = all.slice(0, headerIdx).map((r) => r.filter(Boolean).join(' ').trim());
    const i = pre.findIndex((l) => /^Mannschaftsmeldungen\b/i.test(l));
    if (i > 0 && pre[i - 1] && pre[i - 1]!.length < 80) contextClub = pre[i - 1];
  }
  // Drop trailing non-table lines (fewer than 2 cells), common in page copies.
  const rows = hasHeader ? body.filter((r) => r.filter((c) => c !== '').length >= 2) : body;
  const head = hasHeader ? all[headerIdx]! : [];
  const width = Math.max(head.length, ...rows.map((r) => r.length));
  const headers = hasHeader ? head.concat(Array(Math.max(0, width - head.length)).fill('')) : Array.from({ length: width }, (_, i) => `Spalte ${i + 1}`);
  return { delimiter, headers, rows, hasHeader, headerLine: hasHeader ? headerIdx + 1 : 0, contextClub };
}

// Short tokens and the full status texts shown on TTVN click-TT registration pages
// (verified 10/2026: "SBEM", "Reservespieler", "Weiblicher Ergänzungsspieler", "Sperrvermerk", "Nachmeldung ab …").
const FLAG_RE = /\b(RES|SPV|WES|NES|SES|JES|SBEM|D-?KADER)\b|(Reservespieler|Sperrvermerk|Weiblicher Ergänzungsspieler|Nachwuchs-?Ergänzungsspieler|Senioren-?Ergänzungsspieler)/gi;
const FLAG_WORDS: Record<string, string> = {
  RESERVESPIELER: 'RES',
  SPERRVERMERK: 'SPV',
  'WEIBLICHER ERGÄNZUNGSSPIELER': 'WES',
  'NACHWUCHS-ERGÄNZUNGSSPIELER': 'NES',
  NACHWUCHSERGÄNZUNGSSPIELER: 'NES',
  'SENIOREN-ERGÄNZUNGSSPIELER': 'SES',
  SENIORENERGÄNZUNGSSPIELER: 'SES',
};

export function parseFlags(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set([...raw.matchAll(FLAG_RE)].map((m) => {
    if (m[2]) return FLAG_WORDS[m[2].toUpperCase()] ?? m[2].toUpperCase();
    return m[1]!.toUpperCase().replace('-', '');
  }))];
}

export function mapRows(
  table: TableParseResult,
  mapping: FieldKey[],
  source: SourceId,
  opts: { fileName?: string; now?: Date; defaultClub?: string } = {},
): ImportPreview {
  const importedAt = (opts.now ?? new Date()).toISOString();
  const globalIssues: ImportIssue[] = [];
  const has = (k: FieldKey) => mapping.includes(k);
  if (!has('fullName') && !has('lastName')) globalIssues.push({ severity: 'error', message: 'Keine Spalte für den Namen zugeordnet.' });
  if (!has('qttr') && !has('ttr')) globalIssues.push({ severity: 'warning', message: 'Keine TTR-/Q-TTR-Spalte zugeordnet – Spielstärke-Prüfungen sind dann nicht möglich.' });
  if (has('ttr') && !has('qttr'))
    globalIssues.push({
      severity: 'warning',
      message: 'Nur „TTR“ zugeordnet. Für Mannschaftsmeldungen zählt der Q-TTR-Wert des Stichtags (WO H 2). Werte als Q-TTR übernehmen? (Option unten)',
    });

  const candidates: ImportCandidate[] = table.rows.map((cells, idx) => {
    const row = idx + (table.hasHeader ? table.headerLine + 1 : 1);
    const get = (k: FieldKey) => {
      const i = mapping.indexOf(k);
      return i >= 0 ? (cells[i] ?? '').trim() : undefined;
    };
    const issues: ImportIssue[] = [];
    let firstName = get('firstName') ?? '';
    let lastName = get('lastName') ?? '';
    const full = get('fullName');
    if (full && !lastName) ({ firstName, lastName } = splitFullName(full));
    else if (lastName && !firstName && lastName.includes(',')) ({ firstName, lastName } = splitFullName(lastName));
    if (!lastName) {
      issues.push({ severity: 'error', field: 'name', message: 'Name fehlt' });
      return { row, issues };
    }
    const rating = (k: 'qttr' | 'ttr') => {
      const raw = get(k);
      const v = parseRating(raw);
      if (Number.isNaN(v)) {
        issues.push({ severity: 'warning', field: k, message: `${FIELD_LABELS[k]} „${raw}“ ist keine gültige Zahl – ignoriert` });
        return undefined;
      }
      return v;
    };
    const qttr = rating('qttr');
    const qttrProvisional = /\*/.test(get('qttr') ?? '') || undefined;
    const ttr = rating('ttr');
    const genderRaw = get('gender');
    const gender = parseGender(genderRaw);
    if (genderRaw && !gender) issues.push({ severity: 'warning', field: 'gender', message: `Geschlecht „${genderRaw}“ nicht erkannt` });
    const flags = parseFlags(get('flags'));
    const posRaw = get('position');
    // click-TT rank "2.3" = team 2, position 3
    const rank = posRaw ? /^(\d{1,2})\.(\d{1,2})$/.exec(posRaw) : null;
    const teamNumber = rank ? Number(rank[1]) : undefined;
    const position = rank ? Number(rank[2]) : posRaw && /^\d+$/.test(posRaw) ? Number(posRaw) : undefined;

    const player: Player = {
      id: newId(),
      firstName,
      lastName,
      club: get('club') || opts.defaultClub || table.contextClub || undefined,
      clubNr: get('clubNr') || undefined,
      ttr,
      gender,
      birthYear: parseYear(get('birthYear')),
      licenceNr: get('licenceNr') || undefined,
      internalNr: get('internalNr') || undefined,
      rules: {
        qttr,
        qttrProvisional: qttr !== undefined ? qttrProvisional : undefined,
        nachwuchs: flags.some((f) => f === 'SBEM' || f === 'JES') || undefined,
        kader: flags.includes('DKADER') ? 'd-kader-plus' : undefined,
      },
      meta: { source, importedAt, fileName: opts.fileName },
    };
    if (qttr === undefined && ttr === undefined) issues.push({ severity: 'warning', field: 'qttr', message: 'Kein TTR-Wert' });
    const team = get('team') || undefined;
    return { row, player, issues, hints: { team, teamNumber: team ? undefined : teamNumber, position, flags } };
  });

  if (candidates.length === 0) globalIssues.push({ severity: 'error', message: 'Keine Datenzeilen gefunden.' });
  return { source, fileName: opts.fileName, candidates, globalIssues };
}

/** Use the current TTR as Q-TTR where Q-TTR is missing (explicit user choice in the UI). */
export function adoptTtrAsQttr(preview: ImportPreview): ImportPreview {
  return {
    ...preview,
    candidates: preview.candidates.map((c) =>
      c.player && c.player.rules.qttr === undefined && c.player.ttr !== undefined
        ? { ...c, player: { ...c.player, rules: { ...c.player.rules, qttr: c.player.ttr } } }
        : c,
    ),
  };
}
