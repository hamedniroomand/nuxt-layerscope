import { existsSync, writeFileSync } from 'node:fs';

import { relative, resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { BASELINE_FILE, createBaseline, writeBaseline } from '#src/baseline/index.ts';
import {
  assertNoNuxtConfigLayers,
  assertWritable,
  propose,
  renderConfig,
} from '#src/init/index.ts';
import { formatInit } from '#src/report/init.ts';
import { paintFor } from '#src/utils/style.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, toSource, withCommonOptions, writeNotes } from './shared.ts';

export interface InitFlags extends Omit<CommonFlags, 'format'> {
  baseline?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

const CONFIG_NAME = 'layerscope.config.ts';

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
  writeNotes(result, flags.verbose === true);
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
