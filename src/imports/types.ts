import type { Player, SourceId } from '../domain/players/model.ts';

export type IssueSeverity = 'error' | 'warning';

export interface ImportIssue {
  severity: IssueSeverity;
  message: string;
  field?: string;
}

/** Lineup hints that some sources carry (team, position, status flags). Interpreted by the team planner. */
export interface LineupHints {
  team?: string;
  /** Team number from a click-TT rank like "2.3" (team 2, position 3). */
  teamNumber?: number;
  position?: number;
  /** Tokens such as RES, SPV, WES, NES, SES, JES, SBEM. */
  flags: string[];
}

export interface ImportCandidate {
  /** 1-based row/record number in the source, for error messages. */
  row: number;
  /** undefined when the row could not be turned into a player at all. */
  player?: Player;
  issues: ImportIssue[];
  hints?: LineupHints;
}

export interface ImportPreview {
  source: SourceId;
  fileName?: string;
  candidates: ImportCandidate[];
  globalIssues: ImportIssue[];
}

/** An import adapter turns raw source text into normalised candidates. Pure – no UI, no storage. */
export interface ImportAdapter<Options = unknown> {
  id: SourceId;
  label: string;
  description: string;
  /** File extensions the adapter accepts (for the file picker). */
  accept: string[];
  parse(text: string, options: Options & { fileName?: string; now?: Date }): ImportPreview;
}
