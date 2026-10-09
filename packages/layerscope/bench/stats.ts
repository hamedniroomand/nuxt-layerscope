import { parseArgs } from 'node:util';

export function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) {
    return Number.NaN;
  }
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? Number.NaN)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** `process.resourceUsage().maxRSS` is in kilobytes on every platform. */
export function megabytes(kilobytes: number): number {
  return kilobytes / 1024;
}

export interface Summary {
  median: number;
  min: number;
  max: number;
  samples: number[];
}

export function summarize(samples: number[]): Summary {
  return {
    median: median(samples),
    min: Math.min(...samples),
    max: Math.max(...samples),
    samples,
  };
}

/** Milliseconds as `820 ms` or `4.2 s`. */
export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function formatMemory(mb: number): string {
  return `${Math.round(mb)} MB`;
}

export interface Row {
  scenario: string;
  time: Summary;
  memory?: Summary;
  note?: string;
}

/** A Markdown table with the median first and the range after it. */
export function formatTable(rows: Row[]): string {
  const lines = [
    '| Scenario | Time (median) | Range | Peak memory |',
    '| --- | ---: | ---: | ---: |',
    ...rows.map(row => {
      const range = `${formatDuration(row.time.min)} to ${formatDuration(row.time.max)}`;
      const memory = row.memory === undefined ? 'not included' : formatMemory(row.memory.median);
      return `| ${row.scenario} | ${formatDuration(row.time.median)} | ${range} | ${memory} |`;
    }),
  ];
  const notes = rows.flatMap(row =>
    row.note === undefined ? [] : [`- ${row.scenario}: ${row.note}.`],
  );
  return `${[...lines, ...(notes.length > 0 ? ['', ...notes] : [])].join('\n')}\n`;
}

export interface BenchArgs {
  files: number;
  runs: number | undefined;
  project: string | undefined;
  json: string | undefined;
  only: string[];
  generate: boolean;
}

export function parseBenchArgs(argv: string[]): BenchArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      files: { type: 'string', default: '3000' },
      runs: { type: 'string' },
      project: { type: 'string' },
      json: { type: 'string' },
      only: { type: 'string', default: 'A,B,C' },
      'no-generate': { type: 'boolean', default: false },
    },
  });
  const files = Number(values.files);
  const runs = values.runs === undefined ? undefined : Number(values.runs);
  if (!Number.isInteger(files) || files < 10) {
    throw new Error('--files must be an integer of at least 10');
  }
  if (runs !== undefined && (!Number.isInteger(runs) || runs < 1)) {
    throw new Error('--runs must be a positive integer');
  }
  return {
    files,
    runs,
    project: values.project,
    json: values.json,
    only: values.only.split(',').map(item => item.trim().toUpperCase()),
    generate: values['no-generate'] !== true,
  };
}
