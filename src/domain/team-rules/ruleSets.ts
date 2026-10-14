import type { AgeClass, HalfSeason } from './model.ts';
import type { PlayerRuleAttributes } from '../players/model.ts';

/**
 * Configurable lineup rule sets. Values are taken from published association documents
 * (see `sources`). Each rule carries a verification status so the UI can show which parts are
 * confirmed and which are assumptions.
 */

export type Verification = 'verified' | 'assumption';

export interface RuleSource {
  label: string;
  url: string;
}

export interface Tolerance {
  /** Max. points a player may have *more* than a player listed before him in the same team. */
  withinTeam: number;
  /** Max. points across the whole age-class registration (other teams) before a deviation/SPV is needed. */
  acrossTeams: number;
}

export interface LineupRuleSet {
  id: string;
  label: string;
  scope: 'national' | 'regional' | 'custom';
  description: string;
  /** Reference date hint for Q-TTR values. */
  qttrCutoff: Record<HalfSeason, string>;
  tolerances: {
    adults: Tolerance;
    /** Nachwuchsspieler (SBEM/JES) in adult registrations. */
    nachwuchsInAdults: Tolerance;
    /** Registrations of the age class Nachwuchs. */
    nachwuchsAgeClass: Tolerance;
    /** Landeskader or higher (TTVN; adults only). */
    kader: Tolerance;
  };
  /** Half-seasons in which a *new* Sperrvermerk can be issued for a deviation from the strength order. */
  newSpvAllowedIn: HalfSeason[];
  /** Severity if a team has fewer Stammspieler than its Sollstärke. */
  sollstaerkeCheck: 'error' | 'warning' | 'off';
  verification: Record<'tolerances' | 'spvPropagation' | 'spvErgaenzung' | 'spvTiming' | 'spvConsequence' | 'reserveAdultsOnly' | 'sollstaerke', Verification>;
  sources: RuleSource[];
}

export const TTVN_2026: LineupRuleSet = {
  id: 'ttvn-wo-h-2026',
  label: 'TTVN – WO Abschnitt H, Saison 2026/27',
  scope: 'regional',
  description:
    'Spielstärke-Reihenfolge nach Q-TTR (Stichtag 11.05. bzw. 11.12.): innerhalb einer Mannschaft max. 35 Punkte, über die gesamte Meldung der Altersklasse max. 50 Punkte (WO H 2.3). ' +
    'Nachwuchs (inkl. Jugend 19) +35 → 70/85, Landeskader oder höher (nur Erwachsene) +70 → 105/120. Sperrvermerk zu Beginn der Vor- oder Rückrunde bzw. auf Antrag (WO H 2.4). ' +
    'Werte laut TTVN „Termine und Infos zur neuen Spielzeit 2026/27“.',
  qttrCutoff: { VR: '11.05.', RR: '11.12.' },
  tolerances: {
    adults: { withinTeam: 35, acrossTeams: 50 },
    nachwuchsInAdults: { withinTeam: 70, acrossTeams: 85 },
    nachwuchsAgeClass: { withinTeam: 70, acrossTeams: 85 },
    kader: { withinTeam: 105, acrossTeams: 120 },
  },
  newSpvAllowedIn: ['VR', 'RR'],
  sollstaerkeCheck: 'warning',
  verification: {
    tolerances: 'verified',
    spvPropagation: 'verified',
    spvErgaenzung: 'verified',
    spvTiming: 'verified',
    spvConsequence: 'verified',
    reserveAdultsOnly: 'verified',
    sollstaerke: 'assumption',
  },
  sources: [
    { label: 'TTVN – Termine und Infos zur neuen Spielzeit 2026/27 (Stand 22.05.26)', url: 'https://www.ttvn.de/fileadmin/_gemeinsame/Dokumente/20260522_Termine_und_Infos_zur_neuen_Spielzeit_2026_27.pdf' },
    { label: 'TTVN – Wettspielordnung und Ausführungsbestimmungen (Stand 11.04.2026)', url: 'https://www.ttvn.de/fileadmin/_gemeinsame/Dokumente/Wettspielordnung_Ausfuehrungsbestimmungen.pdf' },
    { label: 'myTischtennis Regelecke – Aufrücken nach Sperrvermerk-Wegfall (WO H 2.4, WO I 4.3)', url: 'https://www.mytischtennis.de/training-service/regelecke/regelecke-zur-ruckrunde-nach-sperrvermerk-wegfall-aufrucken' },
  ],
};

/** Kept so plans saved before the TTVN switch keep working (same values); resolves to TTVN. */
export const DTTB_WO_2026 = TTVN_2026;

export const BUILTIN_RULE_SETS: LineupRuleSet[] = [TTVN_2026];

export function toleranceFor(rs: LineupRuleSet, ageClass: AgeClass, rules: PlayerRuleAttributes): Tolerance {
  const base = ageClass === 'nachwuchs' ? rs.tolerances.nachwuchsAgeClass : rules.nachwuchs ? rs.tolerances.nachwuchsInAdults : rs.tolerances.adults;
  // TTVN: raised tolerance for Landeskader or higher applies to adult registrations only.
  if (rules.kader === 'd-kader-plus' && ageClass === 'erwachsene') {
    return { withinTeam: Math.max(base.withinTeam, rs.tolerances.kader.withinTeam), acrossTeams: Math.max(base.acrossTeams, rs.tolerances.kader.acrossTeams) };
  }
  return base;
}

export function cloneAsCustom(rs: LineupRuleSet, label: string): LineupRuleSet {
  return {
    ...structuredClone(rs),
    id: `custom-${Date.now().toString(36)}`,
    label,
    scope: 'custom',
    description: `Angepasst auf Basis von „${rs.label}“. Bitte Abweichungen mit der Ausschreibung/WO des eigenen Verbands belegen.`,
  };
}
