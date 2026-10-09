import { ruleSeverity } from '#src/config/rules.ts';
import { loadAliases } from '#src/nuxt/aliases.ts';
import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { SymbolTable } from '#src/nuxt/symbols.ts';
import type { LayerscopeConfig } from '#src/types.ts';

import type { AnalysisEnv } from './file-analysis.ts';
import { knownComponents, knownIdentifiers } from './known-globals.ts';

/** What every file analysis needs: symbols, aliases, ownership and known globals. */
export function createAnalysisEnv(
  table: SymbolTable,
  ownerOf: OwnerLookup,
  buildDir: string,
  config: LayerscopeConfig,
): AnalysisEnv {
  return {
    table,
    aliases: loadAliases(buildDir),
    buildDir,
    ownerOf,
    identifiers: knownIdentifiers(config.globals ?? []),
    components: knownComponents(config.globals ?? []),
    typeImports: config.typeImports ?? 'check',
    unresolvedSeverity: ruleSeverity(config, 'unresolved-reference'),
  };
}
