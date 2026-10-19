import { statSync } from 'node:fs';

import { isAbsolute } from 'pathe';

import { ruleSeverity } from '#src/config/rules.ts';
import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { Registry, ShadowedFile, ShadowedPage } from '#src/registry/schema.ts';
import type { Finding, LayerscopeConfig, RuleName } from '#src/types.ts';
import { isGone, realPath } from '#src/utils/fs.ts';

/** Components a higher-priority layer replaces, so accidental overrides are visible. */
export function shadowedFindings(
  registry: Registry,
  ownerOf: OwnerLookup,
  config: LayerscopeConfig,
): Finding[] {
  const severity = ruleSeverity(config, 'shadowed-component');
  if (severity === 'off') {
    return [];
  }
  return registry.shadowedComponents.flatMap(component => {
    const file = realPath(component.file);
    const target = realPath(component.shadowedBy);
    // Components outside every layer (libraries) are not the project's to fix.
    const from = ownerOf(file);
    if (from === null) {
      return [];
    }
    const to = ownerOf(target);
    const winner = to === null ? target : `layer "${to.name}"`;
    const finding: Finding = {
      rule: 'shadowed-component',
      severity,
      file,
      line: 1,
      column: 1,
      symbol: component.name,
      fromLayer: from.name,
      toLayer: to?.name ?? null,
      target,
      message: `Component <${component.name}> of layer "${from.name}" is overridden by ${winner}`,
    };
    return [finding];
  });
}

/** Whether the file is gone. Only `ENOENT` and `ENOTDIR` mean gone: other errors are thrown. */
function isMissing(file: string): boolean {
  try {
    statSync(file);
    return false;
  } catch (error) {
    if (isGone((error as NodeJS.ErrnoException).code)) {
      return true;
    }
    throw error;
  }
}

/** How the message names the file that Nuxt does not use, for example `Layout "default"`. */
type Describe<T> = (entry: T) => string;

function kindFindings<T extends ShadowedFile>(
  entries: T[],
  rule: RuleName,
  describe: Describe<T>,
  ownerOf: OwnerLookup,
  config: LayerscopeConfig,
): Finding[] {
  const severity = ruleSeverity(config, rule);
  if (severity === 'off') {
    return [];
  }
  return entries.flatMap(entry => {
    // A file that is gone since the registry was written: when the loser is gone, nothing is
    // overridden, and when the winner is gone, Nuxt can use the loser now.
    if (isMissing(entry.file) || (isAbsolute(entry.shadowedBy) && isMissing(entry.shadowedBy))) {
      return [];
    }
    const file = realPath(entry.file);
    const target = realPath(entry.shadowedBy);
    // Files outside every layer (libraries) are not the project's to fix.
    const from = ownerOf(file);
    if (from === null) {
      return [];
    }
    const to = ownerOf(target);
    // Two files of the same layer. Only auto-imports can give such a pair. It is not reported,
    // because this is the safe side.
    if (to?.name === from.name) {
      return [];
    }
    const winner = to === null ? target : `layer "${to.name}"`;
    const finding: Finding = {
      rule,
      severity,
      file,
      line: 1,
      column: 1,
      symbol: entry.name,
      fromLayer: from.name,
      toLayer: to?.name ?? null,
      target,
      message: `${describe(entry)} of layer "${from.name}" is overridden by ${winner}`,
    };
    return [finding];
  });
}

/** A page names its route only when the file that Nuxt uses gives exactly one route. */
function describePage(page: ShadowedPage): string {
  return page.routes.length === 1
    ? `Page "${page.name}" (route ${page.routes.join('')})`
    : `Page "${page.name}"`;
}

/**
 * Layouts, route middleware, pages and auto-imports that a file of the same name in another layer
 * replaces.
 */
export function shadowedFileFindings(
  registry: Registry,
  ownerOf: OwnerLookup,
  config: LayerscopeConfig,
): Finding[] {
  return [
    ...kindFindings(
      registry.shadowedLayouts,
      'shadowed-layout',
      entry => `Layout "${entry.name}"`,
      ownerOf,
      config,
    ),
    ...kindFindings(
      registry.shadowedMiddleware,
      'shadowed-middleware',
      entry => `Middleware "${entry.name}"`,
      ownerOf,
      config,
    ),
    ...kindFindings(registry.shadowedPages, 'shadowed-page', describePage, ownerOf, config),
    ...kindFindings(
      registry.shadowedImports,
      'shadowed-auto-import',
      entry => `Auto-import "${entry.name}"`,
      ownerOf,
      config,
    ),
  ];
}
