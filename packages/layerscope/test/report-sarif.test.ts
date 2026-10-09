import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import ajvModule from 'ajv';
import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { DEFAULT_SEVERITY } from '#src/config/rules.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

import { check, tempDir } from './ci-formats.ts';

const Ajv = ajvModule as unknown as typeof ajvModule.default;

/**
 * SARIF 2.1.0 schema, errata 01, vendored unchanged from
 * https://github.com/oasis-tcs/sarif-spec/blob/main/sarif-2.1/schema/sarif-schema-2.1.0.json
 * (commit adbb670c018335b0f384e6dd8819f4ea055d7ee1). It is JSON Schema draft-04; Ajv 8 reads
 * draft-07, so the test renames the top-level `id` to `$id` and drops `$schema`.
 */
const {
  $schema: _draft,
  id,
  ...rest
} = JSON.parse(
  readFileSync(new URL('fixtures/sarif-schema-2.1.0.json', import.meta.url), 'utf8'),
) as { $schema: string; id: string };
const validateSarif = new Ajv({ strict: false, validateFormats: false }).compile({
  $id: id,
  ...rest,
});

interface Sarif {
  runs: {
    originalUriBaseIds: Record<string, { uri: string }>;
    tool: { driver: { rules: { id: string; helpUri: string }[]; version: string } };
    results: {
      ruleId: string;
      ruleIndex: number;
      level: string;
      locations: { physicalLocation: { artifactLocation: { uri: string; uriBaseId: string } } }[];
      relatedLocations?: unknown[];
      partialFingerprints: Record<string, string>;
      suppressions?: unknown[];
    }[];
  }[];
}

async function sarif(root: string, ...args: string[]): Promise<Sarif> {
  return JSON.parse(await check(root, '--format', 'sarif', ...args)) as Sarif;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sarif format', () => {
  it('passes the SARIF 2.1.0 schema', async () => {
    const log = await sarif(NUXT4_ROOT);
    expect(validateSarif(log), JSON.stringify(validateSarif.errors)).toBe(true);
    expect(log.runs[0]?.results.length).toBeGreaterThan(0);
  });

  it('gives the base of %SRCROOT% as a directory URI', async () => {
    const [run1] = (await sarif(NUXT4_ROOT)).runs;
    const base = run1.originalUriBaseIds['%SRCROOT%']?.uri;
    expect(base).toMatch(/^file:\/\/\/.+\/$/u);
    // The git root of the repository that holds the fixture.
    expect(pathToFileURL(NUXT4_ROOT).href.startsWith(base)).toBe(true);
  });

  it('rejects a log that lacks the version', () => {
    expect(validateSarif({ runs: [] })).toBe(false);
  });

  it('lists every rule with a docs link, and each result points at its rule', async () => {
    const [run1] = (await sarif(NUXT4_ROOT)).runs;
    const rules = run1.tool.driver.rules;
    expect(rules.map(rule => rule.id)).toEqual(Object.keys(DEFAULT_SEVERITY));
    expect(rules.every(rule => rule.helpUri.endsWith(`/reference/rules#${rule.id}`))).toBe(true);
    for (const result of run1.results) {
      expect(rules[result.ruleIndex]?.id).toBe(result.ruleId);
      expect(result.partialFingerprints['layerscope/v1']).toMatch(/^[0-9a-f]{64}$/u);
      expect(result.locations[0]?.physicalLocation.artifactLocation.uriBaseId).toBe('%SRCROOT%');
    }
  });

  it('adds the target file of a finding as a related location', async () => {
    const results = (await sarif(NUXT4_ROOT)).runs[0]?.results ?? [];
    expect(results.some(result => result.relatedLocations?.length === 1)).toBe(true);
  });

  it('includes findings of the baseline as suppressed results', async () => {
    const baseline = join(tempDir(), 'b.json');
    await check(NUXT4_ROOT, '--baseline', baseline, '--update-baseline');
    const log = await sarif(NUXT4_ROOT, '--baseline', baseline);
    const results = log.runs[0]?.results ?? [];
    expect(validateSarif(log), JSON.stringify(validateSarif.errors)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(result => result.suppressions?.length === 1)).toBe(true);
  });
});
