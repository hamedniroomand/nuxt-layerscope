import { statSync } from 'node:fs';

import { isAbsolute } from 'pathe';

import { ruleSeverity } from '#src/config/rules.ts';
import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { Registry, ShadowedFile } from '#src/registry/schema.ts';
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

function kindFindings(
  entries: ShadowedFile[],
  rule: RuleName,
  label: string,
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
      message: `${label} "${entry.name}" of layer "${from.name}" is overridden by ${winner}`,
    };
    return [finding];
  });
}

/** Layouts and route middleware that a file of the same name in another layer replaces. */
export function shadowedFileFindings(
  registry: Registry,
  ownerOf: OwnerLookup,
  config: LayerscopeConfig,
): Finding[] {
  return [
    ...kindFindings(registry.shadowedLayouts, 'shadowed-layout', 'Layout', ownerOf, config),
    ...kindFindings(
      registry.shadowedMiddleware,
      'shadowed-middleware',
      'Middleware',
      ownerOf,
      config,
    ),
  ];
}
