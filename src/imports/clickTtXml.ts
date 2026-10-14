import type { Gender, Player } from '../domain/players/model.ts';
import { newId } from '../domain/players/model.ts';
import { child, children, parseXml, XmlParseError, type XmlElement } from '../lib/xml.ts';
import type { ImportCandidate, ImportIssue, ImportPreview } from './types.ts';

/**
 * click-TT tournament interface file (participants download from the click-TT tournament portal).
 *
 * Structure (DOCTYPE "TournamentPortal.dtd"): <tournament> → <competition> → <players> → <player id type>
 * → <person licence-nr lastname firstname club-name club-nr sex ttr ttr-match-count internal-nr birthyear …/>.
 * Verified against real files published in the open-source project ttSchweizer (Bavarian TT-Race, see
 * docs/REGULATIONS.md). nuLiga does not publish the DTD itself, so unknown attributes are preserved verbatim.
 */

export interface ClickTtCompetitionRef {
  /** Attributes of <competition> exactly as read (age-group, type, start-date, …). */
  attrs: Record<string, string>;
  index: number;
  label: string;
  playerCount: number;
}

export interface ClickTtTournamentRef {
  /** Attributes of <tournament> exactly as read (name, tournament-id, start-date, end-date, …). */
  attrs: Record<string, string>;
  competitions: ClickTtCompetitionRef[];
}

export interface ClickTtImport extends ImportPreview {
  tournament?: ClickTtTournamentRef;
  /** Competition the candidates were taken from. */
  competitionIndex: number;
}

function toGender(sex: string | undefined): Gender | undefined {
  if (sex === '1') return 'm';
  if (sex === '2') return 'w';
  return undefined;
}

function num(v: string | undefined): number | undefined {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function readClickTtXml(text: string, opts: { fileName?: string; now?: Date; competitionIndex?: number } = {}): ClickTtImport {
  const importedAt = (opts.now ?? new Date()).toISOString();
  const base: ClickTtImport = { source: 'click-tt-xml', fileName: opts.fileName, candidates: [], globalIssues: [], competitionIndex: 0 };
  let root: XmlElement;
  try {
    root = parseXml(text);
  } catch (e) {
    const msg = e instanceof XmlParseError ? e.message : 'Unbekannter Fehler';
    return { ...base, globalIssues: [{ severity: 'error', message: `Datei ist kein gültiges XML: ${msg}` }] };
  }
  if (root.name !== 'tournament') {
    return { ...base, globalIssues: [{ severity: 'error', message: `Unerwartetes Wurzelelement <${root.name}> – erwartet wird eine click-TT-Turnierdatei (<tournament>).` }] };
  }
  const comps = children(root, 'competition');
  const competitions: ClickTtCompetitionRef[] = comps.map((c, index) => ({
    attrs: { ...c.attrs },
    index,
    label: [c.attrs['age-group'], c.attrs['type'], c.attrs['start-date']].filter(Boolean).join(' · ') || `Konkurrenz ${index + 1}`,
    playerCount: children(child(c, 'players') ?? c, 'player').length,
  }));
  const tournament: ClickTtTournamentRef = { attrs: { ...root.attrs }, competitions };
  if (comps.length === 0) return { ...base, tournament, globalIssues: [{ severity: 'error', message: 'Die Datei enthält keine Konkurrenz (<competition>).' }] };

  const competitionIndex = Math.min(opts.competitionIndex ?? 0, comps.length - 1);
  const comp = comps[competitionIndex]!;
  const globalIssues: ImportIssue[] = [];
  if (comp.attrs['type'] && comp.attrs['type'] !== 'Einzel')
    globalIssues.push({ severity: 'error', message: `Konkurrenz-Typ „${comp.attrs['type']}“ wird nicht unterstützt – nur Einzel.` });

  const players = children(child(comp, 'players') ?? comp, 'player');
  const candidates: ImportCandidate[] = players.map((pl, i) => {
    const issues: ImportIssue[] = [];
    const persons = children(pl, 'person');
    if (pl.attrs['type'] && pl.attrs['type'] !== 'single') issues.push({ severity: 'error', message: `Spielertyp „${pl.attrs['type']}“ (Doppel) wird nicht unterstützt` });
    const person = persons[0];
    if (!person) {
      issues.push({ severity: 'error', message: 'Kein <person>-Eintrag' });
      return { row: i + 1, issues };
    }
    const a = person.attrs;
    if (!a['lastname']) issues.push({ severity: 'error', field: 'name', message: 'Nachname fehlt' });
    if (!pl.attrs['id']) issues.push({ severity: 'error', message: 'Spieler-ID fehlt – Ergebnisse könnten nicht zugeordnet werden' });
    const ttr = num(a['ttr']);
    if (ttr === undefined) issues.push({ severity: 'warning', field: 'ttr', message: 'Kein TTR-Wert' });
    if (issues.some((x) => x.severity === 'error')) return { row: i + 1, issues };
    const player: Player = {
      id: newId(),
      firstName: a['firstname'] ?? '',
      lastName: a['lastname'] ?? '',
      club: a['club-name'],
      clubNr: a['club-nr'],
      ttr,
      gender: toGender(a['sex']),
      birthYear: num(a['birthyear']),
      licenceNr: a['licence-nr'],
      internalNr: a['internal-nr'],
      clickTtPerson: { ...a },
      // click-TT tournament files carry the TTR used for the tournament; it is the seeding value.
      rules: { qttr: undefined },
      meta: { source: 'click-tt-xml', importedAt, fileName: opts.fileName, sourceRef: pl.attrs['id'] },
    };
    return { row: i + 1, player, issues };
  });
  if (candidates.length === 0) globalIssues.push({ severity: 'error', message: 'Die Konkurrenz enthält keine Spieler.' });
  return { ...base, tournament, competitionIndex, candidates, globalIssues };
}
