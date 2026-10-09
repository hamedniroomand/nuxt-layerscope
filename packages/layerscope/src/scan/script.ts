import type { Program } from 'oxc-parser';
import { parseAndWalk, ScopeTracker, walk } from 'oxc-walker';

import { scriptVisitors } from './script-visitors.ts';
import type { VisitContext } from './script-visitors.ts';
import type { FileScan, Lang, OffsetMapper } from './types.ts';
import { emptyScan, toLang } from './types.ts';

type SourceType = 'module' | 'commonjs';

interface ScopedProgram {
  program: Program;
  tracker: ScopeTracker;
  error: { message: string; start: number } | null;
}

/**
 * Parses and pre-walks the code so hoisted declarations are known before references are
 * checked; a local `useFoo` then correctly shadows the auto-imported one.
 */
function parseScoped(code: string, lang: Lang, sourceType: SourceType = 'module'): ScopedProgram {
  const tracker = new ScopeTracker({ preserveExitedScopes: true });
  const parsed = parseAndWalk(code, `file.${lang}`, {
    scopeTracker: tracker,
    parseOptions: { lang, sourceType },
  });
  tracker.freeze();
  const first = parsed.errors.at(0);
  const error =
    first === undefined ? null : { message: first.message, start: first.labels[0]?.start ?? 0 };
  return { program: parsed.program, tracker, error };
}

export function scanScript(
  code: string,
  lang: Lang,
  mapOffset: OffsetMapper,
  scan: FileScan,
  sourceType: SourceType = 'module',
): void {
  const { program, tracker, error } = parseScoped(code, lang, sourceType);
  if (error !== null) {
    scan.error = { message: error.message, offset: mapOffset(error.start) };
    return;
  }
  const ctx: VisitContext = { scan, tracker, mapOffset, requireBindings: new Set() };
  walk(program, {
    scopeTracker: tracker,
    enter(node, parent) {
      scriptVisitors[node.type]?.call(this, node, parent, ctx);
    },
  });
}

export function collectTopLevelNames(code: string, lang: Lang): Record<string, string> {
  const { program, tracker } = parseScoped(code, lang);
  const bindings: Record<string, string> = {};
  walk(program, {
    scopeTracker: tracker,
    enter(node) {
      if (node.type === 'Identifier' && tracker.getDeclaration(node.name)?.scope === '') {
        bindings[node.name] = 'setup-maybe-ref';
      }
    },
  });
  return bindings;
}

export function scanModule(code: string, file: string): FileScan {
  const scan = emptyScan();
  const ext = /\.[cm]?([jt]sx?)$/u.exec(file)?.[1];
  // `.cjs` and `.cts` are CommonJS: a top-level `return` is valid in them.
  const sourceType = /\.c[jt]s$/u.test(file) ? 'commonjs' : 'module';
  scanScript(code, toLang(ext), offset => offset, scan, sourceType);
  return scan;
}
