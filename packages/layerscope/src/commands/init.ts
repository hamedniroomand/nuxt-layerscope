import { existsSync, writeFileSync } from 'node:fs';

import { dirname, join, relative, resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { baselineName, baselinePath, createBaseline, writeBaseline } from '#src/baseline/index.ts';
import {
  analysisConfig,
  assertNoNuxtConfigLayers,
  assertWritable,
  findExistingConfig,
  initBuildDir,
  propose,
  readOldConfig,
  renderConfig,
} from '#src/init/index.ts';
import { REGISTRY_FILE } from '#src/registry/schema.ts';
import { formatInit } from '#src/report/init.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { paintFor } from '#src/utils/style.ts';

import type { Cli, CommonFlags } from './shared.ts';
import {
  currentDir,
  EXIT_CLEAN,
  projectRoot,
  toSource,
  withCommonOptions,
  writeNotes,
} from './shared.ts';

export interface InitFlags extends Omit<CommonFlags, 'format'> {
  baseline?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

const CONFIG_NAME = 'layerscope.config.ts';

/**
 * Says when `init` ran in auto mode and found no registry file. Three causes are possible: the
 * module is not installed, it is installed with `enabled: false`, or Nuxt did not run after it was
 * added. Each one ends with a Nuxt run, so the text is the same with `--prepare`: an install or an
 * enable still needs a new run. The note does not tell the user to run `init` again, because the
 * config that `init` wrote stays valid in most projects and `init` would refuse to replace it. A registry file that
 * exists but is not read has its own note.
 */
export function moduleNote(result: AnalyzeResult, flags: InitFlags): string[] {
  const registryFile = join(dirname(result.sourceFile), REGISTRY_FILE);
  if (flags.source !== 'auto' || result.source !== 'types' || existsSync(registryFile)) {
    return [];
  }
  // The folder is plain text, not part of a command, so it needs no quotes for any shell.
  const root = relative(currentDir(), result.rootDir);
  const where = root === '' ? 'run' : `in ${root}, run`;
  return [
    `layerscope found no data from its Nuxt module (${relative(currentDir(), registryFile)}), so it reads symbols from the types that Nuxt generates. Some checks need the module (see the shadowed-* note). To use the module, ${where} \`npx nuxi module add nuxt-layerscope --dev\` (or remove \`enabled: false\` from its \`layerscope\` options), then run \`npx nuxi prepare\`. Then run layerscope again.`,
  ];
}

export async function init(root: string | undefined, flags: InitFlags): Promise<number> {
  const rootDir = projectRoot(root);
  const customConfig = flags.config === undefined ? undefined : resolve(rootDir, flags.config);
  // One value for every check: the config file that exists, whatever its name. `--force` replaces
  // that file, so a second config never appears next to it. With `--config`, the file is the one named.
  const existing = findExistingConfig(rootDir, customConfig);
  const configFile = customConfig ?? existing ?? resolve(rootDir, CONFIG_NAME);
  const write = flags.dryRun !== true;
  if (write && flags.force !== true) {
    assertWritable(rootDir, customConfig, flags.baseline === true);
  }

  const old = await readOldConfig(rootDir, existing);
  // Only `--force` keeps the keys of the old config. Without it, the old config gives only `buildDir`.
  const kept = flags.force === true ? old : undefined;
  const baselineFile = baselinePath(rootDir, baselineName(undefined, kept?.config ?? {}));
  const buildDir = await initBuildDir(rootDir, old.config);
  // Without an `allow` map every layer is unrestricted, so the edges are what exists today.
  const result = await analyze({
    rootDir,
    config: analysisConfig(kept, buildDir),
    prepare: flags.prepare,
    source: toSource(flags.source),
  });
  assertNoNuxtConfigLayers(result, existing !== null);

  const proposal = propose(result);
  const layers = result.layers.map(layer => layer.name);
  const source = renderConfig(layers, proposal.edges, buildDir, kept);
  if (write) {
    writeFileSync(configFile, source);
    if (flags.baseline === true) {
      writeBaseline(baselineFile, createBaseline(proposal.remaining, rootDir));
    }
  }
  process.stdout.write(
    formatInit(result, proposal, {
      source,
      written: write,
      configFile: relative(currentDir(), configFile),
      baselineFile: flags.baseline === true ? relative(currentDir(), baselineFile) : null,
      paint: paintFor(process.stdout),
    }),
  );
  writeNotes(
    { ...result, notes: [...result.notes, ...(kept?.notes ?? []), ...moduleNote(result, flags)] },
    flags.verbose === true,
  );
  return EXIT_CLEAN;
}

export function registerInit(cli: Cli): void {
  withCommonOptions(
    cli
      .command('init [root]', 'Write a starter config from the dependencies that exist today')
      .option('--baseline', 'Also write a baseline for the findings the config still reports')
      .option(
        '--force',
        'Replace an existing config or baseline. A new config keeps the old keys other than layers',
      )
      .option('--dry-run', 'Print the proposal and write nothing'),
  ).action(init);
}
