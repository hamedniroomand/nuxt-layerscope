import { resolve } from 'pathe';

import { prepareNuxt } from '#src/analyze/prepare.ts';
import { BASELINE_FILE } from '#src/baseline/index.ts';
import { redirectStdout } from '#src/mcp/stdio.ts';
import { packageVersion } from '#src/version.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { toSource, withCommonOptions } from './shared.ts';

export interface McpFlags extends CommonFlags {
  baseline: string;
}

export async function mcp(root: string | undefined, flags: McpFlags): Promise<number> {
  const rootDir = resolve(root ?? process.cwd());
  let startupError: string | undefined;
  if (flags.prepare === true) {
    try {
      // Its output goes to stderr (prepare.ts), so stdout stays JSON-RPC.
      prepareNuxt(rootDir);
    } catch (error) {
      // A project that cannot be prepared does not stop the server: the first call reports it.
      startupError = error instanceof Error ? error.message : String(error);
      process.stderr.write(`layerscope: ${startupError}\n`);
    }
  }
  // Loaded here, so the other commands do not load the server.
  const { runMcp } = await import('#src/mcp/index.ts');
  const stop = (): void => {
    process.stdin.destroy();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const stdout = redirectStdout(process.stdout, process.stderr);
  try {
    return await runMcp({
      rootDir,
      configFile: flags.config,
      source: toSource(flags.source),
      baseline: flags.baseline,
      version: packageVersion(),
      input: process.stdin,
      write: stdout.rpc,
      ...(startupError === undefined ? {} : { startupError }),
    });
  } finally {
    stdout.restore();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

export function registerMcp(cli: Cli): void {
  withCommonOptions(
    cli
      .command('mcp [root]', 'Start an MCP server over stdio for coding assistants')
      .option('--baseline <file>', 'Findings to accept, relative to the root', {
        default: BASELINE_FILE,
      }),
  ).action(mcp);
}
