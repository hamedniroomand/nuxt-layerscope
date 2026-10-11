import { existsSync, writeFileSync } from 'node:fs';

import { dirname, join, relative, resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { BASELINE_FILE, createBaseline, writeBaseline } from '#src/baseline/index.ts';
import {
  assertNoNuxtConfigLayers,
  assertWritable,
  propose,
  renderConfig,
} from '#src/init/index.ts';
import { REGISTRY_FILE } from '#src/registry/schema.ts';
import { formatInit } from '#src/report/init.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { paintFor } from '#src/utils/style.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, toSource, withCommonOptions, writeNotes } from './shared.ts';

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
 * config that `init` wrote stays valid and `init` would refuse to replace it. A registry file that
 * exists but is not read has its own note.
 */
export function moduleNote(result: AnalyzeResult, flags: InitFlags): string[] {
  const registryFile = join(dirname(result.sourceFile), REGISTRY_FILE);
  if (flags.source !== 'auto' || result.source !== 'types' || existsSync(registryFile)) {
    return [];
  }
  // The folder is plain text, not part of a command, so it needs no quotes for any shell.
  const root = relative(process.cwd(), result.rootDir);
  const where = root === '' ? 'run' : `run these commands in ${root}:`;
  return [
    `layerscope found no data from its Nuxt module (${relative(process.cwd(), registryFile)}), so it reads symbols from the types that Nuxt generates. Some checks need the module (see the shadowed-component note). To use the module, ${where} \`npx nuxi module add nuxt-layerscope --dev\`, or remove \`enabled: false\` from its \`layerscope\` options. Then run \`npx nuxi prepare\` and run layerscope again.`,
  ];
}

export async function init(root: string | undefined, flags: InitFlags): Promise<number> {
  const rootDir = resolve(root ?? process.cwd());
  const customConfig = flags.config === undefined ? undefined : resolve(flags.config);
  const configFile = customConfig ?? resolve(rootDir, CONFIG_NAME);
  const baselineFile = resolve(rootDir, BASELINE_FILE);
  const write = flags.dryRun !== true;
  if (write && flags.force !== true) {
    assertWritable(rootDir, customConfig, flags.baseline === true);
  }

  // Without an `allow` map every layer is unrestricted, so the edges are what exists today.
  const result = await analyze({
    rootDir,
    config: {},
    prepare: flags.prepare,
    source: toSource(flags.source),
  });
  assertNoNuxtConfigLayers(result, existsSync(configFile));

  const proposal = propose(result);
  const source = renderConfig(
    result.layers.map(layer => layer.name),
    proposal.edges,
  );
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
      configFile: relative(process.cwd(), configFile),
      baselineFile: flags.baseline === true ? relative(process.cwd(), baselineFile) : null,
      paint: paintFor(process.stdout),
    }),
  );
  writeNotes(
    { ...result, notes: [...result.notes, ...moduleNote(result, flags)] },
    flags.verbose === true,
  );
  return EXIT_CLEAN;
}

export function registerInit(cli: Cli): void {
  withCommonOptions(
    cli
      .command('init [root]', 'Write a starter config from the dependencies that exist today')
      .option('--baseline', 'Also write a baseline for the findings the config still reports')
      .option('--force', 'Replace an existing config or baseline')
      .option('--dry-run', 'Print the proposal and write nothing'),
  ).action(init);
}
