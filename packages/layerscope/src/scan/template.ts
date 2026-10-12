import type { SFCDescriptor, SFCTemplateBlock } from '@vue/compiler-sfc';
import { compileTemplate } from '@vue/compiler-sfc';
import { parseAndWalk, walk } from 'oxc-walker';

import { escapeRegExp } from '#src/utils/strings.ts';

import type { ElementProps } from './element-props.ts';
import type { Bindings, RenderContext } from './render-visitors.ts';
import { visitRenderCall, visitRenderMember } from './render-visitors.ts';
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

/** Walks the render code. A parse error is reported, so a use that it hides is never dropped. */
function readRender(
  code: string,
  lang: 'js' | 'ts',
  ctx: RenderContext,
  templateStart: number,
): void {
  const { program, errors } = parseAndWalk(code, `render.${lang}`, { parseOptions: { lang } });
  const parseError = errors.at(0);
  if (parseError !== undefined) {
    ctx.scan.unread.push({
      symbol: '<template>',
      reason: 'template expression that does not parse',
      message: `Could not read the template render code: ${parseError.message}. Uses in this template are not checked.`,
      offset: templateStart,
    });
    return;
  }
  walk(program, {
    enter(node) {
      visitRenderCall(node, ctx);
      visitRenderMember(node, ctx);
    },
  });
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
    scan.unread.push({
      symbol: '<template>',
      ...unreadTemplate,
      offset: templateStart,
    });
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
  readRender(compiled.code, renderLang, ctx, templateStart);
}
