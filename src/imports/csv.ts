/**
 * Small, dependency-free parser for delimited text (CSV with ; or , and TSV from copy & paste).
 * Handles quoted fields, escaped quotes, CRLF and a UTF-8 BOM. Never evaluates content.
 */

export type Delimiter = ';' | ',' | '\t';

export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const counts: Record<Delimiter, number> = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of sample) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === ';' || ch === ',' || ch === '\t')) counts[ch]++;
  }
  if (counts['\t'] >= counts[';'] && counts['\t'] >= counts[','] && counts['\t'] > 0) return '\t';
  return counts[';'] >= counts[','] ? ';' : ',';
}

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function parseDelimited(input: string, delimiter: Delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Zu viele Zeilen (max. ${MAX_IMPORT_ROWS}).`);
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

/** Decode file bytes: UTF-8 if valid, otherwise Windows-1252 (common for German Excel CSV exports). */
export function decodeText(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

/** Escape a value for CSV output with ';' (Excel-de default). */
export function csvCell(v: unknown, delimiter: Delimiter = ';'): string {
  const s = v == null ? '' : String(v);
  return /["\n\r]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][], delimiter: Delimiter = ';'): string {
  return '﻿' + rows.map((r) => r.map((c) => csvCell(c, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
}
