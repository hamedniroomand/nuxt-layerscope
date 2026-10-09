import ajvModule from 'ajv';
import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { DEFAULT_SEVERITY } from '#src/config/rules.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

import { check, copyProject, tempDir } from './ci-formats.ts';

const Ajv = ajvModule as unknown as typeof ajvModule.default;

/** Fields from GitLab's Code Quality documentation; GitLab publishes no JSON Schema. */
const validateGitlab = new Ajv({ strict: true }).compile({
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['description', 'check_name', 'fingerprint', 'severity', 'location'],
    properties: {
      description: { type: 'string' },
      check_name: { type: 'string' },
      fingerprint: { type: 'string', minLength: 1 },
      severity: { enum: ['info', 'minor', 'major', 'critical', 'blocker'] },
      location: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'lines'],
        properties: {
          path: { type: 'string', minLength: 1 },
          lines: {
            type: 'object',
            additionalProperties: false,
            required: ['begin'],
            properties: { begin: { type: 'integer', minimum: 1 } },
          },
        },
      },
    },
  },
});

interface SarifLog {
  runs: {
    results: {
      partialFingerprints: Record<string, string>;
      locations: { physicalLocation: { artifactLocation: { uri: string } } }[];
    }[];
  }[];
}

interface Issue {
  check_name: string;
  fingerprint: string;
  severity: string;
  location: { path: string; lines: { begin: number } };
}

async function gitlab(root: string, ...args: string[]): Promise<Issue[]> {
  return JSON.parse(await check(root, '--format', 'gitlab', ...args)) as Issue[];
}

async function sarif(root: string): Promise<SarifLog> {
  return JSON.parse(await check(root, '--format', 'sarif')) as SarifLog;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gitlab format', () => {
  it('matches the Code Quality format', async () => {
    const issues = await gitlab(NUXT4_ROOT);
    expect(validateGitlab(issues), JSON.stringify(validateGitlab.errors)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('maps errors to major and warnings to minor', async () => {
    const issues = await gitlab(NUXT4_ROOT);
    for (const issue of issues) {
      const expected = DEFAULT_SEVERITY[issue.check_name as keyof typeof DEFAULT_SEVERITY];
      expect(issue.severity).toBe(expected === 'error' ? 'major' : 'minor');
    }
  });

  it('leaves out findings that the baseline accepts', async () => {
    const baseline = join(tempDir(), 'b.json');
    await check(NUXT4_ROOT, '--baseline', baseline, '--update-baseline');
    expect(await gitlab(NUXT4_ROOT, '--baseline', baseline)).toEqual([]);
  });

  it('uses the fingerprints of the sarif format', async () => {
    const issues = await gitlab(NUXT4_ROOT);
    const log = await sarif(NUXT4_ROOT);
    const ids = log.runs
      .flatMap(r => r.results)
      .map(result => result.partialFingerprints['layerscope/v1']);
    expect(issues.map(issue => issue.fingerprint)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('paths of a project in a subdirectory', () => {
  it('are relative to the git root', async () => {
    const { project } = copyProject(true);
    const issues = await gitlab(project);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(issue => issue.location.path.startsWith('web/'))).toBe(true);
    const results = (await sarif(project)).runs[0]?.results ?? [];
    const uris = results.map(
      result => result.locations[0]?.physicalLocation.artifactLocation.uri ?? '',
    );
    expect(uris.every(uri => uri.startsWith('web/'))).toBe(true);
  });

  it('are relative to the project without git', async () => {
    const { project } = copyProject(false);
    const issues = await gitlab(project);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(issue => !issue.location.path.startsWith('web/'))).toBe(true);
    expect(issues.every(issue => !issue.location.path.startsWith('..'))).toBe(true);
  });

  it('keep the fingerprints when the project moves', async () => {
    const [a, b] = [copyProject(true).project, copyProject(false).project];
    const first = await gitlab(a);
    const second = await gitlab(b);
    expect(first.map(issue => issue.fingerprint)).toEqual(second.map(issue => issue.fingerprint));
  });
});
