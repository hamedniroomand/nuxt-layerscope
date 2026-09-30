import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

import ajv2020 from 'ajv/dist/2020.js';
import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { run } from '#src/cli.ts';
import { DEFAULT_SEVERITY } from '#src/config/rules.ts';
import { JSON_REPORT_VERSION } from '#src/report/json.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

interface Schema {
  properties: { version: { const: number } };
  $defs: Record<'finding' | 'baselineEntry', { properties: { rule: { enum: string[] } } }>;
}

const schema = JSON.parse(
  readFileSync(new URL('../schema/report-1.json', import.meta.url), 'utf8'),
) as Schema;

const Ajv2020 = ajv2020 as unknown as typeof ajv2020.default;
const validate = new Ajv2020({ strict: true }).compile(schema);

async function check(...args: string[]): Promise<string> {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  await run(['node', 'layerscope', 'check', NUXT4_ROOT, ...args]);
  const text = out.mock.calls.map(call => String(call[0])).join('');
  vi.restoreAllMocks();
  return text;
}

async function report(...args: string[]): Promise<unknown> {
  return JSON.parse(await check('--format', 'json', ...args));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('JSON report schema', () => {
  it('describes the current report version', () => {
    expect(schema.properties.version.const).toBe(JSON_REPORT_VERSION);
  });

  it('lists every rule', () => {
    const rules = new Set(Object.keys(DEFAULT_SEVERITY));
    expect(new Set(schema.$defs.finding.properties.rule.enum)).toEqual(rules);
    expect(new Set(schema.$defs.baselineEntry.properties.rule.enum)).toEqual(rules);
  });

  it('accepts a report with findings and suggestions', async () => {
    const json = await report();
    expect(validate(json), JSON.stringify(validate.errors)).toBe(true);
    expect((json as { findings: unknown[] }).findings.length).toBeGreaterThan(0);
  });

  it('accepts a report with a baseline', async () => {
    const file = join(realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-schema-'))), 'b.json');
    await check('--baseline', file, '--update-baseline');
    const json = await report('--baseline', file);
    expect(validate(json), JSON.stringify(validate.errors)).toBe(true);
    expect(json).toHaveProperty('baseline.suppressed');
  });

  it('rejects a report that lacks a required field', () => {
    expect(validate({ version: 1 })).toBe(false);
  });
});
