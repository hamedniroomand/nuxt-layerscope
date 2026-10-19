import type { LayerscopeConfig, RuleName, Severity } from '#src/types.ts';

export const DEFAULT_SEVERITY: Record<RuleName, Severity> = {
  'layer-boundary': 'error',
  'layer-cycle': 'off',
  'layer-internal': 'error',
  'unresolved-reference': 'warn',
  'shadowed-component': 'warn',
  'shadowed-layout': 'warn',
  'shadowed-middleware': 'warn',
  'shadowed-page': 'warn',
  'shadowed-auto-import': 'warn',
};

/**
 * The rules that read data that only the registry of the Nuxt module has. With the `.d.ts`
 * source, they report nothing.
 */
export const REGISTRY_ONLY_RULES: readonly RuleName[] = [
  'shadowed-component',
  'shadowed-layout',
  'shadowed-middleware',
  'shadowed-page',
  'shadowed-auto-import',
];

/** Shown when a registry-only rule is on and the run has no registry. */
export const SHADOWED_NEEDS_REGISTRY =
  'The shadowed-* rules need the registry of the Nuxt module, and this run has no registry, so these rules reported nothing. If "nuxt-layerscope" is not in "modules" in nuxt.config, add it. Then run "nuxi prepare".';

/** Accepted in config for forward compatibility; not implemented yet. */
export const RESERVED_RULES = new Set(['unused-symbol']);

export const SEVERITIES = new Set<string>(['off', 'warn', 'error']);

export function isRuleName(name: string): name is RuleName {
  return Object.hasOwn(DEFAULT_SEVERITY, name);
}

export function ruleSeverity(config: LayerscopeConfig, rule: RuleName): Severity {
  return config.rules?.[rule] ?? DEFAULT_SEVERITY[rule];
}
