import type { SFCDescriptor, SFCTemplateBlock, SFCTemplateCompileResults } from '@vue/compiler-sfc';
import { compileTemplate } from '@vue/compiler-sfc';
import type { ImportExpression } from 'oxc-parser';
import { parseAndWalk, walk } from 'oxc-walker';

import { escapeRegExp } from '#src/utils/strings.ts';

import type { ElementProps } from './element-props.ts';
import type { Bindings, RenderContext } from './render-visitors.ts';
import { visitRenderCall, visitRenderMember } from './render-visitors.ts';
import { recordImportCall } from './script-visitors.ts';
import type { TemplateIndex, VueAstNode } from './template-index.ts';
import { indexTemplate } from './template-index.ts';
import { importOffset, mapPairs } from './template-map.ts';
import type { FileScan, Unread } from './types.ts';

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
 * Whether the text from `from` to `to` is in one template expression, and Vue reads the source text
 * of that expression up to `end` as it is. Vue decodes an HTML character reference, such as `&amp;`,
 * before it maps the names, so each mapping after it in the same expression is too early. A mapping
 * that is not in an expression, such as the end of an element, can match text outside of it.
 */
function isClean(
  { from, to, end }: { from: number; to: number; end: number },
  source: string,
  index: TemplateIndex,
): boolean {
  const range = index.expressions.find(([start, stop]) => start <= from && to <= stop);
  // After a decode, the text that Vue reads starts with the source text only if the source text from
  // the reference to `end` holds only reference characters, such as `amp;`. For a mapping before the
  // path, `end` is the path, and the `(`, the space or the comment before a path is not such a
  // character. For a mapping after the path, the text holds the quote of the path. A decode moves a
  // name mapping and the path by the same amount. The mapping at the end of an expression does not
  // move, so the text up to it must be the same in full.
  return range?.[2].startsWith(source.slice(range[0], end)) === true;
}

/** The tag and the reason, when layerscope cannot read the template; `null` when it can. */
function unreadReason(template: SFCTemplateBlock): Pick<Unread, 'reason' | 'message'> | null {
  // `<template src>` has no value, so the compiler gives no `src`, only the attribute.
  if (template.src !== undefined || 'src' in template.attrs) {
    const tag = template.src === undefined ? '<template src>' : `<template src="${template.src}">`;
    return {
      reason: tag,
      message: `Could not read ${tag}. layerscope does not read a template in a separate file, so uses in it are not checked.`,
    };
  }
  if (template.lang !== undefined && template.lang !== '' && template.lang !== 'html') {
    const tag = `<template lang="${template.lang}">`;
    return {
      reason: tag,
      message: `Could not read ${tag}. layerscope reads only HTML templates, so uses in this template are not checked.`,
    };
  }
  return null;
}

/** The offset of the path of each `import()`. Only a template with an `import()` reads the source map. */
function importOffsets(
  compiled: SFCTemplateCompileResults,
  template: SFCTemplateBlock,
  source: string,
  index: TemplateIndex,
): (node: ImportExpression) => number {
  const start = template.loc.start.offset;
  let pairs: [number, number][] | undefined;
  return node => {
    pairs ??= mapPairs(compiled.code, template.content, compiled.map?.mappings ?? '');
    return importOffset(node, compiled.code, template.content, pairs, start, span =>
      isClean(span, source, index),
    );
  };
}

/** Walks the render code. A parse error is reported, so a use that it hides is never dropped. */
function readRender(
  code: string,
  lang: 'js' | 'ts',
  ctx: RenderContext,
  templateStart: number,
  importOffsetOf: (node: ImportExpression) => number,
): void {
  const { program, errors } = parseAndWalk(code, `render.${lang}`, { parseOptions: { lang } });
  const parseError = errors.at(0);
  if (parseError !== undefined) {
    ctx.scan.unread.push({
      symbol: '<template>',
      reason: 'template expression that does not parse',
      message: `Could not read the template render code: ${parseError.message.replace(/\.$/u, '')}. Uses in this template are not checked.`,
      offset: templateStart,
    });
    return;
  }
  // An `import()` in a template is kept in the render code, and Vite loads it as in a script.
  const imports: ImportExpression[] = [];
  walk(program, {
    enter(node) {
      visitRenderCall(node, ctx);
      visitRenderMember(node, ctx);
      if (node.type === 'ImportExpression') {
        imports.push(node);
      }
    },
  });
  for (const node of imports) {
    recordImportCall(node, ctx.scan, importOffsetOf(node));
  }
}

/**
 * `<NuxtIsland name="X">` renders the island component `X` on the server by that exact name, so
 * the render code holds no reference to it.
 */
function readIslands(index: TemplateIndex, scan: FileScan): void {
  for (const element of index.elements) {
    if (element.islandName !== null) {
      scan.islands.push({ name: element.islandName, offset: element.offset });
    }
    if (element.dynamicIslandName) {
      scan.quietDynamicComponents.push(element.offset);
    }
  }
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
  elementProps: () => ElementProps,
  renderLang: 'js' | 'ts',
): void {
  const { template } = descriptor;
  if (!template) {
    return;
  }
  const templateStart = template.loc.start.offset;
  const unreadTemplate = unreadReason(template);
  if (unreadTemplate !== null) {
    scan.unread.push({ symbol: '<template>', ...unreadTemplate, offset: templateStart });
    return;
  }
  if (!template.ast) {
    return;
  }
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
    elementProps,
    elementOffset: predicate => index.elements.find(predicate)?.offset ?? templateStart,
    identOffset: name => firstIdentOffset(name, source, index) ?? templateStart,
  };
  const offsets = importOffsets(compiled, template, source, index);
  readRender(compiled.code, renderLang, ctx, templateStart, offsets);
  readIslands(index, scan);
}
