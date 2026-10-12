export interface ImportUpdate {
  file: string;
  line: number;
  /** Where the quote of the specifier is, as the scan found it. */
  column: number;
  specifier: string;
  /** `null` when the specifier is not relative and has to be updated by hand. */
  updated: string | null;
}

export interface PlannedMove {
  from: string;
  to: string;
  layer: string;
  fixes: number;
  updates: ImportUpdate[];
}
