import { ruleSeverity } from '#src/config/rules.ts';
import { loadAliases } from '#src/nuxt/aliases.ts';
import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { SymbolTable } from '#src/nuxt/symbols.ts';
import { layerPackageNames } from '#src/resolve/layer-package.ts';
import type { Layer, LayerscopeConfig } from '#src/types.ts';

import type { AnalysisEnv } from './file-analysis.ts';
import { knownComponents, knownIdentifiers } from './known-globals.ts';

/** What every file analysis needs: symbols, aliases, layer package names, ownership and known globals. */
export function createAnalysisEnv(
  table: SymbolTable,
  ownerOf: OwnerLookup,
  buildDir: string,
  config: LayerscopeConfig,
  layers: Layer[],
): AnalysisEnv {
  return {
    table,
    aliases: loadAliases(buildDir),
    buildDir,
    layerPackages: layerPackageNames(layers),
    ownerOf,
    identifiers: knownIdentifiers(config.globals ?? []),
    components: knownComponents(config.globals ?? []),
    typeImports: config.typeImports ?? 'check',
    unresolvedSeverity: ruleSeverity(config, 'unresolved-reference'),
  };
}
