import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { ProjectSession } from '#src/mcp/session.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

import type { CheckData, GraphData, LayersData, WhyData } from './mcp-helpers.ts';
import { callTool, dataOf } from './mcp-helpers.ts';
import { tempDir } from './watch-project.ts';

/** The nuxt4 fixture with the layers of another config, which `--config` reads. */
function withConfig(config: string): ProjectSession {
  const configFile = join(tempDir(), 'layerscope.config.mjs');
  writeFileSync(configFile, `export default { ${config} };\n`);
  return new ProjectSession({
    rootDir: NUXT4_ROOT,
    configFile,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
  });
}

function withLayers(layers: string): ProjectSession {
  return withConfig(`layers: ${layers}`);
}

const json = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>;

describe('tool results', () => {
  it('give the data as structured content and as one text block with the same JSON', async () => {
    const result = await callTool('layers');
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0]?.text ?? '')).toEqual(result.structuredContent);
  });
});

describe('input validation', () => {
  it.each([
    ['a limit below 1', 'check', { limit: 0 }, 'limit must be between 1 and 500'],
    ['a limit above 500', 'check', { limit: 501 }, 'limit must be between 1 and 500'],
    ['a limit that is not an integer', 'check', { limit: 1.5 }, 'limit must be an integer'],
    ['an unknown argument', 'check', { nope: 1 }, 'unknown argument "nope"'],
    ['files that is not an array', 'check', { files: 'a' }, 'files must be an array'],
    ['a number in files', 'check', { files: [1] }, 'files[0] must be a string'],
    ['a severity that does not exist', 'check', { severity: 'info' }, 'severity must be one of'],
    ['a missing symbol', 'why', {}, 'symbol is required'],
    ['a symbol that is not a string', 'why', { symbol: 1 }, 'symbol must be a string'],
    ['a missing file', 'suggest', {}, 'file is required'],
    ['a missing to', 'can_use', { from: 'admin' }, 'to is required'],
    ['a level that does not exist', 'graph', { level: 'pixel' }, 'level must be one of'],
    ['an argument for a tool without any', 'layers', { x: 1 }, 'unknown argument "x"'],
    [
      'an inherited name as an argument',
      'layers',
      json('{"toString":1}'),
      'unknown argument "toString"',
    ],
    [
      'a __proto__ key as an argument',
      'layers',
      json('{"__proto__":1}'),
      'unknown argument "__proto__"',
    ],
  ])('refuses %s as a result with isError', async (_name, tool, args, message) => {
    const result = await callTool(tool, args);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(message);
  });

  it('refuses paths outside the project root, also through ../ and absolute paths', async () => {
    for (const [tool, args] of [
      ['check', { files: ['../outside.ts'] }],
      ['check', { files: ['/etc/passwd'] }],
      ['check', { files: ['../*.ts'] }],
      ['suggest', { file: '../../../etc/hosts' }],
      ['suggest', { file: '/etc/hosts' }],
      ['can_use', { from: '/etc/hosts', to: 'admin' }],
      ['can_use', { from: '../outside.ts', to: 'admin' }],
    ] as const) {
      // eslint-disable-next-line no-await-in-loop -- one call for each path
      const result = await callTool(tool, args);
      expect(result.isError, JSON.stringify(args)).toBe(true);
      expect(result.content[0]?.text).toMatch(/outside the project root|inside the project root/u);
    }
  });
});

describe('check', () => {
  it('returns the findings with a summary and the counts', async () => {
    const result = dataOf<CheckData>(await callTool('check'));
    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.total).toBe(result.findings.length);
    expect(result.truncated).toBe(false);
    expect(result.findings[0].file).not.toMatch(/^\//u);
    expect(result.baseline).toEqual({ suppressed: 0, removable: 0 });
  });

  it('filters by layer, rule, severity and file', async () => {
    const byLayer = dataOf<CheckData>(await callTool('check', { layers: ['admin'] }));
    expect(byLayer.findings.length).toBeGreaterThan(0);
    for (const finding of byLayer.findings) {
      expect([finding.fromLayer, finding.toLayer]).toContain('admin');
    }
    const byRule = dataOf<CheckData>(await callTool('check', { rules: ['unresolved-reference'] }));
    expect(byRule.findings.every(finding => finding.rule === 'unresolved-reference')).toBe(true);
    const warnings = dataOf<CheckData>(await callTool('check', { severity: 'warn' }));
    expect(warnings.findings.every(finding => finding.severity === 'warn')).toBe(true);
    const folder = dataOf<CheckData>(await callTool('check', { files: ['layers/admin'] }));
    const glob = dataOf<CheckData>(await callTool('check', { files: ['layers/admin/**/*.vue'] }));
    expect(folder.findings.every(finding => finding.file.startsWith('layers/admin/'))).toBe(true);
    expect(glob.findings.every(finding => finding.file.endsWith('.vue'))).toBe(true);
  });

  it('cuts the list at the limit and says so', async () => {
    const all = dataOf<CheckData>(await callTool('check'));
    const cut = dataOf<CheckData>(await callTool('check', { limit: 1 }));
    expect(cut.returned).toBe(1);
    expect(cut.total).toBe(all.total);
    expect(cut.truncated).toBe(true);
  });
});

describe('why, layers and graph', () => {
  it('lists the uses of a symbol and says whether it is allowed', async () => {
    const result = dataOf<WhyData>(await callTool('why', { symbol: 'useCart' }));
    const web = result.targets.find(target => target.layer === 'web');
    expect(web?.exposure).toBe('all');
    expect(web?.uses.some(use => use.status === 'not-allowed')).toBe(true);
  });

  it('says so for a symbol that nothing uses', async () => {
    const result = await callTool('why', { symbol: 'doesNotExist' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('No uses of "doesNotExist" found.');
  });

  it('lists the layers with allow, scoped allow and expose', async () => {
    const session = withLayers(
      "{ admin: { allow: ['shared', { layer: 'web', only: ['useCart'] }] }, web: { expose: ['useCart'] } }",
    );
    const result = dataOf<LayersData>(await callTool('layers', {}, session));
    const byName = Object.fromEntries(result.layers.map(layer => [layer.name, layer]));
    expect(byName.admin.allow).toEqual([{ layer: 'shared' }, { layer: 'web', only: ['useCart'] }]);
    expect(byName.web.expose).toEqual(['useCart']);
    expect(byName.web.allow).toBeNull();
    expect(result.rules['layer-internal']).toBe('error');
  });

  it('gives the preset with the base layers that it picked, or null without one', async () => {
    const none = dataOf<LayersData>(await callTool('layers'));
    expect(none.preset).toBeNull();
    const picked = dataOf<LayersData>(
      await callTool('layers', {}, withConfig("preset: 'features'")),
    );
    expect(picked.preset?.name).toBe('features');
    expect(picked.preset?.base).toContain('shared');
    const given = dataOf<LayersData>(
      await callTool('layers', {}, withConfig("preset: { name: 'features', base: ['auth'] }")),
    );
    expect(given.preset).toEqual({ name: 'features', base: ['auth'] });
  });

  it('gives the layer graph with a status for each edge, and a cut file graph', async () => {
    const layer = dataOf<GraphData>(await callTool('graph'));
    const edge = layer.edges.find(edge => edge.from === 'admin' && edge.to === 'web');
    expect(edge?.status).toBe('not-allowed');
    expect(layer.truncated).toBe(false);
    const files = dataOf<GraphData>(await callTool('graph', { level: 'file', limit: 1 }));
    expect(files.nodes).toHaveLength(1);
    expect(files.truncated).toBe(true);
  });
});
