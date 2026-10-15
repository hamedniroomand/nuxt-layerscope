import type { SFCDescriptor, SFCTemplateBlock } from '@vue/compiler-sfc';
import { compileTemplate } from '@vue/compiler-sfc';
import type { ImportExpression, Node } from 'oxc-parser';
import { parseAndWalk, walk } from 'oxc-walker';

import { escapeRegExp } from '#src/utils/strings.ts';

import type { ElementProps } from './element-props.ts';
import type { Bindings, RenderContext } from './render-visitors.ts';
import { visitRenderCall, visitRenderMember } from './render-visitors.ts';
import { recordImportCall } from './script-visitors.ts';
import type { TemplateIndex, VueAstNode } from './template-index.ts';
import { indexTemplate } from './template-index.ts';
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

/**
 * The offset of the path of each `import()` in the template expressions, in source order. A match
 * inside a string or a comment is also found. The offset is only a hint for the line.
 */
function importPaths(source: string, index: TemplateIndex): number[] {
  const offsets: number[] = [];
  for (const [start, end] of index.expressions) {
    for (const match of source
      .slice(start, end)
      .matchAll(/(?<![\w$.])import(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*\(\s*/gu)) {
      offsets.push(start + match.index + match[0].length);
    }
  }
  return offsets.toSorted((a, b) => a - b);
}

/**
 * The start of an `import()` path that Vue does not change. Vue changes only names (`a` to
 * `_ctx.a`). For a string, it is the whole string. For a template literal, it is the text before the
 * first `${`. For any other path, it is empty.
 */
function pathHead(code: string, path: Node): string {
  if (path.type === 'Literal') {
    return code.slice(path.start, path.end);
  }
  if (path.type === 'TemplateLiteral') {
    return code.slice(path.start, path.quasis[0]?.end ?? path.start);
  }
  return '';
}

/**
 * Gives each `import()` of the render code the offset of its own path in the template. Two paths get
 * different offsets when the template has a match for each of them. If no match is left, the offset
 * is the start of the template. A longer head takes its offset first: a path with no head (a name)
 * then cannot take the offset of a path with a head.
 */
function importOffsets(
  heads: string[],
  source: string,
  paths: number[],
  fallback: number,
): number[] {
  const taken = new Set<number>();
  const offsets = heads.map(() => fallback);
  const order = heads.map((_, at) => at).toSorted((a, b) => heads[b].length - heads[a].length);
  for (const at of order) {
    const offset = paths.find(path => !taken.has(path) && source.startsWith(heads[at], path));
    if (offset !== undefined) {
      taken.add(offset);
      offsets[at] = offset;
    }
  }
  return offsets;
}

/** Walks the render code. A parse error is reported, so a use that it hides is never dropped. */
function readRender(
  code: string,
  lang: 'js' | 'ts',
  ctx: RenderContext,
  templateStart: number,
  importOffsetsOf: (heads: string[]) => number[],
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
  const offsets = importOffsetsOf(imports.map(node => pathHead(code, node.source)));
  for (const [at, node] of imports.entries()) {
    recordImportCall(node, ctx.scan, offsets[at] ?? templateStart);
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
  readRender(compiled.code, renderLang, ctx, templateStart, heads =>
    importOffsets(heads, source, importPaths(source, index), templateStart),
  );
  readIslands(index, scan);
}
