import { existsSync, writeFileSync } from 'node:fs';

import { relative, resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { BASELINE_FILE, createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { findConfigFile } from '#src/config/load.ts';
import { LayerscopeError } from '#src/errors.ts';
import { assertNoNuxtConfigLayers, propose, renderConfig } from '#src/init/index.ts';
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

function exists(file: string): LayerscopeError {
  return new LayerscopeError(
    `${relative(process.cwd(), file)} already exists. Use --force to replace it, or --dry-run and copy what you need.`,
  );
}

/** Refuses before analyzing, so nothing is touched. */
function assertWritable(rootDir: string, configFile: string, flags: InitFlags): void {
  // Without --config, any config the loader would pick up counts, not only the file to write.
  const current = flags.config === undefined ? findConfigFile(rootDir) : configFile;
  if (current !== null && existsSync(current)) {
    throw exists(current);
  }
  const baselineFile = resolve(rootDir, BASELINE_FILE);
  if (flags.baseline === true && existsSync(baselineFile)) {
    throw exists(baselineFile);
  }
}

export async function init(root: string | undefined, flags: InitFlags): Promise<number> {
  const rootDir = resolve(root ?? process.cwd());
  const configFile = resolve(
    flags.config === undefined ? rootDir : process.cwd(),
    flags.config ?? CONFIG_NAME,
  );
  const baselineFile = resolve(rootDir, BASELINE_FILE);
  const write = flags.dryRun !== true;
  if (write && flags.force !== true) {
    assertWritable(rootDir, configFile, flags);
  }

  // No config here: without an `allow` map every layer is unrestricted and the edges are the truth.
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
