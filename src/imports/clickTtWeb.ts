/**
 * Links into the public click-TT pages (nuLiga). The app never fetches these pages itself
 * (click-TT sends no CORS headers and automated retrieval is not covered by any published terms);
 * it only builds links the user opens in a new tab and then copies the table from.
 *
 * Verified in October 2026 on the live system:
 *  - All associations run on the same nuLiga instance; the `federation` parameter selects the
 *    association for the club search. Club IDs are unique across Germany.
 *  - Club search:  /wa/clubSearch?federation=<KÜRZEL>&searchFor=<Text>
 *  - Overview of all registrations of a club: /wa/clubPools?club=<ID>
 *  - Adult registration: /wa/clubPools?displayTyp=vorrunde|rueckrunde&club=<ID>&contestType=Erwachsene&seasonName=2026%2F27
 *    (youth season names differ per association, e.g. "Jugend-Punktspiele VR 2026/27" → link to the overview)
 *  - The registration page shows Rang (team.position), Q-TTR, "Name, Vorname", A, Status
 *    (Reservespieler, SBEM, Nachmeldung …) without login. Earlier seasons require a click-TT login.
 */

export const CLICKTT_BASE = 'https://bttv.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa';

export interface Federation {
  code: string;
  name: string;
}

/** Federation codes accepted by the click-TT club search (each verified with a sample search). */
export const FEDERATIONS: Federation[] = [
  { code: 'TTBW', name: 'Tischtennis Baden-Württemberg' },
  { code: 'ByTTV', name: 'Bayerischer TTV' },
  { code: 'BTTV', name: 'Berliner TTV' },
  { code: 'TTVB', name: 'TTV Brandenburg' },
  { code: 'FTTB', name: 'Fachverband Tischtennis Bremen' },
  { code: 'HaTTV', name: 'Hamburger TTV' },
  { code: 'HeTTV', name: 'Hessischer TTV' },
  { code: 'TTVMV', name: 'TTV Mecklenburg-Vorpommern' },
  { code: 'TTVN', name: 'TTV Niedersachsen' },
  { code: 'WTTV', name: 'Westdeutscher TTV (NRW)' },
  { code: 'PTTV', name: 'Pfälzischer TTV' },
  { code: 'RTTVR', name: 'TTV Rheinland/Rheinhessen' },
  { code: 'STTB', name: 'Saarländischer TTB' },
  { code: 'STTV', name: 'Sächsischer TTV' },
  { code: 'TTVSA', name: 'TTV Sachsen-Anhalt' },
  { code: 'TTVSH', name: 'TTV Schleswig-Holstein' },
  { code: 'TTTV', name: 'Thüringer TTV' },
  { code: 'DTTB', name: 'DTTB (Bundesligen)' },
];

export interface ClickTtClubRef {
  federation: string;
  clubId?: string;
  clubName?: string;
}

export function clubSearchUrl(federation: string, query: string): string {
  const p = new URLSearchParams();
  if (federation) p.set('federation', federation);
  if (query.trim()) p.set('searchFor', query.trim());
  return `${CLICKTT_BASE}/clubSearch?${p}`;
}

export function clubOverviewUrl(clubId: string): string {
  return `${CLICKTT_BASE}/clubPools?club=${encodeURIComponent(clubId)}`;
}

/** Direct link to the registration of the adult age class; null for youth (season names differ). */
export function registrationUrl(clubId: string, opts: { season: string; half: 'VR' | 'RR'; ageClass: 'erwachsene' | 'nachwuchs' }): string | null {
  if (opts.ageClass !== 'erwachsene' || !/^\d{4}\/\d{2}$/.test(opts.season)) return null;
  const p = new URLSearchParams({ displayTyp: opts.half === 'VR' ? 'vorrunde' : 'rueckrunde', club: clubId, contestType: 'Erwachsene', seasonName: opts.season });
  return `${CLICKTT_BASE}/clubPools?${p}`;
}

/** Accepts a club ID ("24668") or any click-TT link containing club=<ID>. */
export function parseClubInput(input: string): string | undefined {
  const s = input.trim();
  if (/^\d{1,9}$/.test(s)) return s;
  const m = /[?&]club=(\d{1,9})\b/.exec(s);
  return m?.[1];
}
