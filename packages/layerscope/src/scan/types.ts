/** References found in one source file. Offsets point into the original file. */
export interface FileScan {
  /** Identifiers without a local binding. */
  free: Named[];
  /** Identifiers a template reads from the component instance (`_ctx.x`). */
  templateIdents: Named[];
  components: Named[];
  /** Offsets of `<component :is>` bound to a runtime value. */
  dynamicComponents: number[];
  imports: ImportRef[];
  /** Set when the file could not be parsed; nothing else in it was analyzed. */
  error: { message: string; offset: number } | null;
}

export interface Named {
  name: string;
  offset: number;
}

export interface ImportRef {
  specifier: string;
  /** Export names, with `default` and `*` for default and namespace imports. */
  names: string[];
  /** The statement has no runtime effect: `import type`, or a `type` keyword on every name. */
  typeOnly: boolean;
  /** The names in `names` that only a `type` keyword brings in; a name that a value also brings is not in it. */
  typeNames: string[];
  offset: number;
}

export type Lang = 'js' | 'jsx' | 'ts' | 'tsx';

export type OffsetMapper = (offset: number) => number;

export function emptyScan(): FileScan {
  return {
    free: [],
    templateIdents: [],
    components: [],
    dynamicComponents: [],
    imports: [],
    error: null,
  };
}

export function toLang(lang: string | undefined): Lang {
  return lang === 'ts' || lang === 'tsx' || lang === 'jsx' ? lang : 'js';
}
