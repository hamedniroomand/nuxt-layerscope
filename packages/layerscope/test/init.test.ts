import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';
import { propose, renderConfig } from '#src/init/index.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

function capture(): { stdout: () => string; stderr: () => string } {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const text = (spy: typeof out): string => spy.mock.calls.map(call => String(call[0])).join('');
  return { stdout: () => text(out), stderr: () => text(err) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderConfig', () => {
  it('comments every allowed edge', async () => {
    const result = await analyze({ rootDir: NUXT4_ROOT, config: {} });
    const { edges } = propose(result);
    const source = renderConfig(
      result.layers.map(layer => layer.name),
      edges,
    );
    expect(edges.length).toBeGreaterThan(0);
    expect(source.match(/ references?, e\.g\. /gu)).toHaveLength(edges.length);
  });
});

describe('layerscope init', () => {
  it('refuses to overwrite an existing config', async () => {
    const output = capture();
    expect(await run(['node', 'layerscope', 'init', NUXT4_ROOT])).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('already exists');
  });

  it('prints the proposal and writes nothing with --dry-run', async () => {
    const output = capture();
    expect(await run(['node', 'layerscope', 'init', NUXT4_ROOT, '--dry-run'])).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain('Allowed edges');
    expect(output.stdout()).toContain('Readiness');
    expect(output.stdout()).toContain('export default defineConfig');
  });

  it('writes a config that passes check', async () => {
    // .nuxt holds absolute paths, so the fixture is analyzed in place and only the config moves.
    const config = join(realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-init-'))), 'config.ts');
    capture();
    const init = ['node', 'layerscope', 'init', NUXT4_ROOT, '--config', config];
    expect(await run(init)).toBe(EXIT_CLEAN);
    expect(readFileSync(config, 'utf8')).toContain('allow');
    expect(await run(['node', 'layerscope', 'check', NUXT4_ROOT, '--config', config])).toBe(
      EXIT_CLEAN,
    );
    expect(await run(init)).toBe(EXIT_ERROR);
    expect(await run([...init, '--force'])).toBe(EXIT_CLEAN);
  });
});
