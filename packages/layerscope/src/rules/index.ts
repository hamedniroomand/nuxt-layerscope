import { ruleSeverity } from '#src/config/rules.ts';
import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { Registry } from '#src/registry/schema.ts';
import { addSuggestions } from '#src/suggest/index.ts';
import type { Edge, Finding, Layer, LayerscopeConfig } from '#src/types.ts';
import { yieldTurn } from '#src/utils/yield.ts';

import { compareByPosition } from './compare.ts';
import { cycleFindings } from './layer-cycle.ts';
import { edgeFindings } from './layer-rules.ts';
import { SHADOWED_NEEDS_REGISTRY, shadowedFindings } from './shadowed-component.ts';

export interface RuleInput {
  edges: Edge[];
  /** Found while analyzing files. */
  unresolved: Finding[];
  registry: Registry | null;
  ownerOf: OwnerLookup;
  config: LayerscopeConfig;
  layers: Layer[];
  rootDir: string;
}

/** Every rule's findings in report order, and notes on rules that could not run. */
export async function runRules(
  input: RuleInput,
): Promise<{ findings: Finding[]; notes: string[] }> {
  const { registry, config } = input;
  const notes: string[] = [];
  if (registry === null && ruleSeverity(config, 'shadowed-component') !== 'off') {
    notes.push(SHADOWED_NEEDS_REGISTRY);
  }
  const found = [
    ...input.unresolved,
    ...edgeFindings(input.edges, config, input.layers),
    ...cycleFindings(input.edges, config),
    ...(registry === null ? [] : shadowedFindings(registry, input.ownerOf, config)),
  ].toSorted(compareByPosition);
  // The rules and the suggestions each get a task of their own.
  await yieldTurn();
  const findings = await addSuggestions(found, input.edges, input.layers, config, input.rootDir);
  return { findings, notes };
}
