import { ruleSeverity } from '#src/config/rules.ts';
import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { Registry } from '#src/registry/schema.ts';
import type { Edge, Finding, LayerscopeConfig } from '#src/types.ts';

import { compareByPosition } from './compare.ts';
import { boundaryFindings } from './layer-boundary.ts';
import { SHADOWED_NEEDS_REGISTRY, shadowedFindings } from './shadowed-component.ts';

export interface RuleInput {
  edges: Edge[];
  /** Found while analyzing files. */
  unresolved: Finding[];
  registry: Registry | null;
  ownerOf: OwnerLookup;
  config: LayerscopeConfig;
}

/** Every rule's findings in report order, and notes on rules that could not run. */
export function runRules(input: RuleInput): { findings: Finding[]; notes: string[] } {
  const { registry, config } = input;
  const notes: string[] = [];
  if (registry === null && ruleSeverity(config, 'shadowed-component') !== 'off') {
    notes.push(SHADOWED_NEEDS_REGISTRY);
  }
  const findings = [
    ...input.unresolved,
    ...boundaryFindings(input.edges, config),
    ...(registry === null ? [] : shadowedFindings(registry, input.ownerOf, config)),
  ].toSorted(compareByPosition);
  return { findings, notes };
}
