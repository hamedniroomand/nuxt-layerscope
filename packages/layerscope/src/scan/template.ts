import type { SFCDescriptor } from '@vue/compiler-sfc';
import { compileTemplate } from '@vue/compiler-sfc';
import { parseAndWalk, walk } from 'oxc-walker';

import { escapeRegExp } from '#src/utils/strings.ts';

import type { Bindings, RenderContext } from './render-visitors.ts';
import { visitRenderCall, visitRenderMember } from './render-visitors.ts';
import type { TemplateIndex, VueAstNode } from './template-index.ts';
import { indexTemplate } from './template-index.ts';
import type { FileScan } from './types.ts';

function firstIdentOffset(name: string, source: string, index: TemplateIndex): number | null {
  const pattern = new RegExp(`(?<![\\w$.])${escapeRegExp(name)}(?![\\w$])`, 'u');
  for (const [start, end] of index.expressions) {
    const match = pattern.exec(source.slice(start, end));
    if (match) {
      return start + match.index;
    }
  }
  return null;
}

/**
 * Compiles the template like Vue does and reads what the render function resolves at runtime:
 * `_resolveComponent("X")` for components and `_ctx.x` for identifiers without a setup binding.
 * The compiler already handles v-for and slot scopes, so no template scope analysis is needed.
 */
export function scanTemplate(
  descriptor: SFCDescriptor,
  source: string,
  bindings: Bindings,
  scan: FileScan,
): void {
  const { template } = descriptor;
  if (!template?.ast || (template.lang !== undefined && template.lang !== 'html')) {
    return;
  }
  const templateStart = template.loc.start.offset;
  const compiled = compileTemplate({
    source: template.content,
    filename: descriptor.filename,
    id: 'layerscope',
    compilerOptions: { bindingMetadata: bindings as never, prefixIdentifiers: true },
  });
  const error = compiled.errors.at(0);
  if (error !== undefined) {
    scan.error = {
      message: typeof error === 'string' ? error : error.message,
      offset: templateStart,
    };
    return;
  }
  const index = indexTemplate(template.ast as unknown as VueAstNode);
  const ctx: RenderContext = {
    scan,
    bindings,
    elementOffset: predicate => index.elements.find(predicate)?.offset ?? templateStart,
    identOffset: name => firstIdentOffset(name, source, index) ?? templateStart,
  };
  const { program } = parseAndWalk(compiled.code, 'render.js', { parseOptions: { lang: 'js' } });
  walk(program, {
    enter(node) {
      visitRenderCall(node, ctx);
      visitRenderMember(node, ctx);
    },
  });
}
