import { ruleSeverity } from '#src/config/rules.ts';
import type { Finding, Layer, LayerscopeConfig } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';

/** The files a run is limited to, found among the files that the layers hold. */
export interface Scope {
  /** The selected files that a layer holds, in the order of the collected files. */
  files: Map<string, Layer>;
  /** How many files were selected. */
  selected: number;
  /** Whether a file (absolute path) is one of the selected files. */
  has: (item: { file: string }) => boolean;
  /** The same for a path relative to the project root, as a baseline entry has it. */
  hasRelative: (file: string) => boolean;
}

export function createScope(only: string[], collected: Map<string, Layer>, rootDir = ''): Scope {
  const wanted = new Set(only.map(file => realPath(file)));
  const files = new Map<string, Layer>();
  if (wanted.size > 0) {
    for (const [file, layer] of collected) {
      if (wanted.has(realPath(file))) {
        files.set(file, layer);
      }
    }
  }
  const matched = new Set([...files.keys()].map(file => realPath(file)));
  return {
    files,
    selected: wanted.size,
    has: item => matched.has(realPath(item.file)),
    hasRelative: file => matched.has(realPath(`${rootDir}/${file}`)),
  };
}

export function scopeNote(scope: Scope, total: number, cycles = false): string {
  const skipped = scope.selected - scope.files.size;
  const left =
    skipped === 0
      ? ''
      : ` ${skipped} selected file${skipped === 1 ? ' is' : 's are'} in no layer, outside the project or ignored.`;
  const scanned = cycles ? 'All files were scanned for the layer-cycle rule. ' : '';
  return `${scanned}Findings are shown for ${scope.files.size} of ${total} files.${left} Findings in other files, such as a use of a symbol that changed, are found by a full "layerscope check".`;
}

export interface ScanPlan {
  /** The files to scan. */
  files: Map<string, Layer>;
  scope: Scope | undefined;
  /** The `layer-cycle` rule is on, so every file is scanned. */
  cycles: boolean;
}

/** What to scan: the selected files, or all of them when no selection is given or cycles are on. */
export function planScan(
  only: string[] | undefined,
  collected: Map<string, Layer>,
  config: LayerscopeConfig,
  rootDir: string,
): ScanPlan {
  if (only === undefined) {
    return { files: collected, scope: undefined, cycles: false };
  }
  const scope = createScope(only, collected, rootDir);
  // A cycle needs every edge; an empty selection has nothing to look at.
  const cycles = ruleSeverity(config, 'layer-cycle') !== 'off' && only.length > 0;
  return { files: cycles ? collected : scope.files, scope, cycles };
}

/** The findings of the selected files, and a note that says how much was checked. */
export function applyScope(
  plan: ScanPlan,
  ran: { findings: Finding[]; notes: string[] },
  total: number,
): { findings: Finding[]; notes: string[] } {
  const { scope } = plan;
  return scope === undefined
    ? ran
    : {
        findings: ran.findings.filter(scope.has),
        notes: [...ran.notes, scopeNote(scope, total, plan.cycles)],
      };
}
