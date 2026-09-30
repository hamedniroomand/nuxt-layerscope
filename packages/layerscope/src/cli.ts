import { cac } from 'cac';

import { registerCheck } from '#src/commands/check.ts';
import { registerDrift } from '#src/commands/drift.ts';
import { registerFix } from '#src/commands/fix.ts';
import { registerGraph } from '#src/commands/graph.ts';
import { registerInit } from '#src/commands/init.ts';
import { EXIT_CLEAN, EXIT_ERROR } from '#src/commands/shared.ts';
import { registerUnused } from '#src/commands/unused.ts';
import { registerWhy } from '#src/commands/why.ts';

export { EXIT_CLEAN, EXIT_ERROR, EXIT_VIOLATIONS } from '#src/commands/shared.ts';

function createCli(): ReturnType<typeof cac> {
  const cli = cac('layerscope');
  registerInit(cli);
  registerCheck(cli);
  registerDrift(cli);
  registerFix(cli);
  registerWhy(cli);
  registerGraph(cli);
  registerUnused(cli);
  cli.help();
  return cli;
}

/** Runs the CLI and resolves to its exit code. */
export async function run(argv: string[] = process.argv): Promise<number> {
  const cli = createCli();
  try {
    cli.parse(argv, { run: false });
    if (cli.matchedCommand === undefined) {
      if (cli.options.help === true) {
        return EXIT_CLEAN;
      }
      cli.outputHelp();
      return EXIT_ERROR;
    }
    return await (cli.runMatchedCommand() as Promise<number>);
  } catch (error) {
    process.stderr.write(`layerscope: ${(error as Error).message}\n`);
    return EXIT_ERROR;
  }
}
