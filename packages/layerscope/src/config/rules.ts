import type { LayerscopeConfig, RuleName, Severity } from '#src/types.ts';

export const DEFAULT_SEVERITY: Record<RuleName, Severity> = {
  'layer-boundary': 'error',
  'unresolved-reference': 'warn',
  'shadowed-component': 'warn',
};

/** Accepted in config for forward compatibility; not implemented yet. */
export const RESERVED_RULES = new Set(['unused-symbol']);

export const SEVERITIES = new Set<string>(['off', 'warn', 'error']);

export function isRuleName(name: string): name is RuleName {
  return Object.hasOwn(DEFAULT_SEVERITY, name);
}

export function ruleSeverity(config: LayerscopeConfig, rule: RuleName): Severity {
  return config.rules?.[rule] ?? DEFAULT_SEVERITY[rule];
}
