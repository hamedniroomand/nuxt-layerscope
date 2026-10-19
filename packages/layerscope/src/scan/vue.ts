import type { SFCDescriptor, SFCScriptBlock } from '@vue/compiler-sfc';
import { compileScript, parse as parseSfc } from '@vue/compiler-sfc';

import type { ElementProps } from './element-props.ts';
import { elementOnlyProps } from './element-props.ts';
import type { Bindings } from './render-visitors.ts';
import { collectTopLevelNames, scanScript } from './script.ts';
import { scanTemplate } from './template.ts';
import type { FileScan, Lang, OffsetMapper } from './types.ts';
import { emptyScan, toLang } from './types.ts';

type Statement = NonNullable<SFCScriptBlock['scriptSetupAst']>[number];

interface CombinedScript {
  code: string;
  lang: Lang;
  mapOffset: OffsetMapper;
}

/** `<script>` and `<script setup>` share one module scope, so they are scanned as one program. */
function combineScripts(blocks: SFCScriptBlock[], descriptor: SFCDescriptor): CombinedScript {
  const starts: [number, number][] = [];
  let at = 0;
  for (const block of blocks) {
    starts.push([at, block.loc.start.offset]);
    at += block.content.length + 1;
  }
  return {
    code: blocks.map(block => block.content).join('\n'),
    lang: toLang(descriptor.scriptSetup?.lang ?? descriptor.script?.lang),
    mapOffset: offset => {
      const [combined, original] = starts.findLast(([start]) => start <= offset) ?? [0, 0];
      return original + offset - combined;
    },
  };
}

/** The names of the top-level `const X = resolveComponent('name')` declarations that have a fixed name. */
function componentConsts(statements: Statement[]): string[] {
  return statements.flatMap(statement =>
    statement.type === 'VariableDeclaration' && statement.kind === 'const'
      ? statement.declarations.flatMap(({ id, init }) => {
          const arg = init?.type === 'CallExpression' ? init.arguments[0] : undefined;
          const fixed =
            arg?.type === 'StringLiteral' ||
            (arg?.type === 'TemplateLiteral' && arg.expressions.length === 0);
          const named =
            init?.type === 'CallExpression' &&
            init.callee.type === 'Identifier' &&
            init.callee.name === 'resolveComponent';
          return id.type === 'Identifier' && named && fixed ? [id.name] : [];
        })
      : [],
  );
}

function templateBindings(descriptor: SFCDescriptor, script: CombinedScript): Bindings {
  try {
    const compiled = compileScript(descriptor, { id: 'layerscope' });
    // Not a copy: the object holds `__isScriptSetup` as a property that a spread does not copy. Each
    // compile gives a new object.
    const bindings: Bindings = compiled.bindings ?? {};
    // A `const` that holds `resolveComponent()` with a fixed name is that component, not a runtime
    // value. In the non-inline render code, `setup-const` and `setup-maybe-ref` both give `$setup.X`.
    for (const name of componentConsts(compiled.scriptSetupAst ?? [])) {
      bindings[name] = 'setup-const';
    }
    return bindings;
  } catch {
    // Type-based macros may reference types the compiler cannot load on its own.
    return collectTopLevelNames(script.code, script.lang);
  }
}

function memoize<T>(read: () => T): () => T {
  let value: T | undefined;
  return () => {
    value ??= read();
    return value;
  };
}

export function scanVue(source: string, file: string): FileScan {
  const scan = emptyScan();
  const { descriptor, errors } = parseSfc(source, { filename: file, ignoreEmpty: true });
  const error = errors.at(0);
  if (error !== undefined) {
    scan.error = { message: error.message, offset: 0 };
    return scan;
  }
  const blocks = [descriptor.script, descriptor.scriptSetup].filter(block => block !== null);
  let bindings: Bindings = {};
  // Read once, and only when the template has a `<component :is>` that needs it.
  let elementProps: (() => ElementProps) | undefined;
  if (blocks.length > 0) {
    const script = combineScripts(blocks, descriptor);
    scanScript(script.code, script.lang, script.mapOffset, scan);
    if (scan.error !== null) {
      return scan;
    }
    bindings = templateBindings(descriptor, script);
    elementProps = memoize(() => elementOnlyProps(script.code, script.lang));
  }
  const none = (): ElementProps => ({ kinds: new Map(), holders: new Set() });
  const typed = blocks.some(block => block.lang === 'ts' || block.lang === 'tsx');
  scanTemplate(descriptor, source, bindings, scan, elementProps ?? none, typed ? 'ts' : 'js');
  return scan;
}
