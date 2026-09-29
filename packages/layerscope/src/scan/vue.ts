import type { SFCDescriptor, SFCScriptBlock } from '@vue/compiler-sfc';
import { compileScript, parse as parseSfc } from '@vue/compiler-sfc';

import type { Bindings } from './render-visitors.ts';
import { collectTopLevelNames, scanScript } from './script.ts';
import { scanTemplate } from './template.ts';
import type { FileScan, Lang, OffsetMapper } from './types.ts';
import { emptyScan, toLang } from './types.ts';

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

function templateBindings(descriptor: SFCDescriptor, script: CombinedScript): Bindings {
  try {
    return compileScript(descriptor, { id: 'layerscope' }).bindings ?? {};
  } catch {
    // Type-based macros may reference types the compiler cannot load on its own.
    return collectTopLevelNames(script.code, script.lang);
  }
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
  if (blocks.length > 0) {
    const script = combineScripts(blocks, descriptor);
    scanScript(script.code, script.lang, script.mapOffset, scan);
    if (scan.error !== null) {
      return scan;
    }
    bindings = templateBindings(descriptor, script);
  }
  scanTemplate(descriptor, source, bindings, scan);
  return scan;
}
