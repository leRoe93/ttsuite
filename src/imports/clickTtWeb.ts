/**
 * Links into the public click-TT pages of the TTVN (Tischtennis-Verband Niedersachsen). The app never
 * fetches these pages itself (click-TT sends no CORS headers and automated retrieval is not covered by
 * any published terms); it only builds links the user opens in a new tab and copies the table from.
 *
 * Verified in October 2026 on ttvn.click-tt.de:
 *  - Club search:   /wa/clubSearch?federation=TTVN&searchFor=<Text>
 *  - Overview of all registrations of a club: /wa/clubPools?club=<ID>
 *  - Registration:  /wa/clubPools?displayTyp=vorrunde|rueckrunde&club=<ID>&contestType=Erwachsene|Damen&seasonName=2026%2F27
 *    (youth season names differ, e.g. "Jugend-Punktspiele VR 2026/27" → link to the overview instead)
 *  - Columns: Rang (team.position), Q-TTR ("1534", "1534*", "-"), Name, Vorname, A, Status
 *    ("SBEM", "Reservespieler", "Weiblicher Ergänzungsspieler", "Sperrvermerk", "Nachmeldung ab …").
 *  - Earlier seasons require a click-TT login.
 */

export const FEDERATION = { code: 'TTVN', name: 'Tischtennis-Verband Niedersachsen' } as const;
export const CLICKTT_BASE = 'https://ttvn.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa';

export type ContestType = 'Erwachsene' | 'Damen';

export interface ClickTtClubRef {
  clubId?: string;
  clubName?: string;
}

export function clubSearchUrl(query: string): string {
  const p = new URLSearchParams({ federation: FEDERATION.code });
  if (query.trim()) p.set('searchFor', query.trim());
  return `${CLICKTT_BASE}/clubSearch?${p}`;
}

export function clubOverviewUrl(clubId: string): string {
  return `${CLICKTT_BASE}/clubPools?club=${encodeURIComponent(clubId)}`;
}

/** Direct link to the registration (Erwachsene or Damen); null for youth (season names differ). */
export function registrationUrl(
  clubId: string,
  opts: { season: string; half: 'VR' | 'RR'; ageClass: 'erwachsene' | 'nachwuchs'; contest?: ContestType },
): string | null {
  if (opts.ageClass !== 'erwachsene' || !/^\d{4}\/\d{2}$/.test(opts.season)) return null;
  const p = new URLSearchParams({
    displayTyp: opts.half === 'VR' ? 'vorrunde' : 'rueckrunde',
    club: clubId,
    contestType: opts.contest ?? 'Erwachsene',
    seasonName: opts.season,
  });
  return `${CLICKTT_BASE}/clubPools?${p}`;
}

/** Accepts a club ID ("4763") or any click-TT link containing club=<ID>. */
export function parseClubInput(input: string): string | undefined {
  const s = input.trim();
  if (/^\d{1,9}$/.test(s)) return s;
  const m = /[?&]club=(\d{1,9})\b/.exec(s);
  return m?.[1];
}

/**
 * Reads the heading of a copied registration page, e.g. "Mannschaftsmeldungen 2026/27 - Erwachsene (VR)".
 */
export function parseRegistrationHeading(text: string): { season?: string; half?: 'VR' | 'RR'; contest?: string } {
  const m = /Mannschaftsmeldungen\s+(\d{4}\/\d{2})\s*-\s*([^(\n]+?)\s*\((VR|RR)\)/i.exec(text);
  if (!m) return {};
  return { season: m[1], contest: m[2]!.trim(), half: m[3]!.toUpperCase() as 'VR' | 'RR' };
}
