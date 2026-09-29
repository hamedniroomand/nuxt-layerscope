import { resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import type { GraphLevel } from '#src/graph/index.ts';
import { buildGraph, GRAPH_LEVELS } from '#src/graph/index.ts';
import { formatGraph, GRAPH_FORMATS, isGraphFormat } from '#src/report/graph/index.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, toSource, withCommonOptions, writeNotes } from './shared.ts';

export interface GraphFlags extends CommonFlags {
  by: string;
}

function toLevel(value: string): GraphLevel {
  const level = GRAPH_LEVELS.find(option => option === value);
  if (level === undefined) {
    throw new LayerscopeError(`Unknown level "${value}". Use ${GRAPH_LEVELS.join(', ')}.`);
  }
  return level;
}

export async function graph(root: string | undefined, flags: GraphFlags): Promise<number> {
  const { format } = flags;
  if (!isGraphFormat(format)) {
    throw new LayerscopeError(`Unknown format "${format}". Use ${GRAPH_FORMATS.join(', ')}.`);
  }
  const level = toLevel(flags.by);
  const rootDir = resolve(root ?? process.cwd());
  const result = await analyze({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
  });
  writeNotes(result, flags.verbose === true);
  process.stdout.write(formatGraph(buildGraph(result, result.config, level), format));
  return EXIT_CLEAN;
}

export function registerGraph(cli: Cli): void {
  withCommonOptions(
    cli
      .command('graph [root]', 'Print the dependency graph between layers or files')
      .option('--format <format>', `Output format: ${GRAPH_FORMATS.join(', ')}`, {
        default: 'mermaid',
      })
      .option('--by <level>', `Graph level: ${GRAPH_LEVELS.join(', ')}`, { default: 'layer' }),
  ).action(graph);
}
