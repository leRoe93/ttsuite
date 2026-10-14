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
    /** D-Kader or higher. */
    kader: Tolerance;
  };
  /** Half-seasons in which a *new* Sperrvermerk can be issued for a deviation from the strength order. */
  newSpvAllowedIn: HalfSeason[];
  /** Severity if a team has fewer Stammspieler than its Sollstärke. */
  sollstaerkeCheck: 'error' | 'warning' | 'off';
  verification: Record<'tolerances' | 'spvPropagation' | 'spvErgaenzung' | 'spvTiming' | 'spvConsequence' | 'reserveAdultsOnly' | 'sollstaerke', Verification>;
  sources: RuleSource[];
}

export const DTTB_WO_2026: LineupRuleSet = {
  id: 'dttb-wo-h-2026',
  label: 'DTTB-WO Abschnitt H (Standard 35/50) – Saison 2026/27',
  scope: 'national',
  description:
    'Spielstärke-Reihenfolge nach Q-TTR (WO H 2): innerhalb einer Mannschaft max. 35 Punkte, über die gesamte Meldung der Altersklasse max. 50 Punkte. ' +
    'Größere Abweichungen nur zur Vorrunde auf Antrag mit Sperrvermerk (WO H 2.4). Werte laut Infoblättern von HTTV (2026) und BeTTV (2023); regionale Abweichungen möglich (z. B. STTV: LivePZ statt Q-TTR).',
  qttrCutoff: { VR: '11.05.', RR: '11.12.' },
  tolerances: {
    adults: { withinTeam: 35, acrossTeams: 50 },
    nachwuchsInAdults: { withinTeam: 70, acrossTeams: 85 },
    nachwuchsAgeClass: { withinTeam: 70, acrossTeams: 85 },
    kader: { withinTeam: 105, acrossTeams: 120 },
  },
  newSpvAllowedIn: ['VR'],
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
    { label: 'HTTV – Infoblatt Mannschaftsmeldung Vorrunde 2026/27', url: 'https://www.httv.de/media/000/News/2026/Juni/Newsletter_MM_Infoblatt_VR_2026.pdf' },
    { label: 'HTTV – Richtlinien für Spielleiter', url: 'https://www.httv.de/media/000/Handbuch/2023-2024/HTTV-Richtlinien-Spielleiter.pdf' },
    { label: 'BeTTV – Wichtige Informationen zur Mannschaftsmeldung 2023/24', url: 'https://www.bettv.de/news/wichtige-informationen-zur-mannschaftsmeldung-2023-2024/' },
    { label: 'myTischtennis Regelecke – Aufrücken nach Sperrvermerk-Wegfall (WO H 2.4, WO I 4.3)', url: 'https://www.mytischtennis.de/training-service/regelecke/regelecke-zur-ruckrunde-nach-sperrvermerk-wegfall-aufrucken' },
  ],
};

export const BUILTIN_RULE_SETS: LineupRuleSet[] = [DTTB_WO_2026];

export function toleranceFor(rs: LineupRuleSet, ageClass: AgeClass, rules: PlayerRuleAttributes): Tolerance {
  const base = ageClass === 'nachwuchs' ? rs.tolerances.nachwuchsAgeClass : rules.nachwuchs ? rs.tolerances.nachwuchsInAdults : rs.tolerances.adults;
  if (rules.kader === 'd-kader-plus') {
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
