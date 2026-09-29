import { ruleSeverity } from '#src/config/rules.ts';
import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { Registry } from '#src/registry/schema.ts';
import type { Finding, LayerscopeConfig } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';

export const SHADOWED_NEEDS_REGISTRY =
  'shadowed-component needs the full component registry: add "nuxt-layerscope" to "modules" in nuxt.config. The generated .d.ts files list only the winning component, so the rule reported nothing.';

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
