import type { Gender } from './model.ts';

/** Normalise a name for duplicate detection: lowercase, no diacritics, single spaces. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse a rating like "1.534", "1534", " 1534 *" → 1534. Returns undefined if not a plausible TTR. */
export function parseRating(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const cleaned = raw.replace(/\*/g, '').replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '');
  if (cleaned === '' || cleaned === '-') return undefined;
  if (!/^\d{1,4}$/.test(cleaned)) return NaN;
  const n = Number(cleaned);
  return n >= 0 && n <= 3500 ? n : NaN;
}

export function parseGender(raw: string | undefined): Gender | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (['m', 'männlich', 'maennlich', 'herr', 'herren', 'male', '1'].includes(v)) return 'm';
  if (['w', 'weiblich', 'f', 'frau', 'damen', 'dame', 'female', '2'].includes(v)) return 'w';
  if (['d', 'divers', 'x'].includes(v)) return 'd';
  return undefined;
}

export function parseYear(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(19|20)\d{2}/);
  if (!m) return undefined;
  return Number(m[0]);
}

/** Split "Mustermann, Max" or "Max Mustermann" into parts. */
export function splitFullName(raw: string): { firstName: string; lastName: string } {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s.includes(',')) {
    const [last, ...rest] = s.split(',');
    return { lastName: (last ?? '').trim(), firstName: rest.join(',').trim() };
  }
  const parts = s.split(' ');
  if (parts.length === 1) return { firstName: '', lastName: parts[0] ?? '' };
  const lastName = parts.pop() ?? '';
  return { firstName: parts.join(' '), lastName };
}
