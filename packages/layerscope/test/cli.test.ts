import { join, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, EXIT_VIOLATIONS, run } from '#src/cli.ts';
import { CONFIGS_DIR, NUXT4_ROOT } from '#test/fixtures.ts';

function captureOutput(): { stdout: () => string; stderr: () => string } {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const text = (spy: typeof out): string => spy.mock.calls.map(call => String(call[0])).join('');
  return { stdout: () => text(out), stderr: () => text(err) };
}

/** Output paths are relative to the cwd, which differs between package and root runs. */
function fixturePath(path: string): string {
  return relative(process.cwd(), join(NUXT4_ROOT, path));
}

function checkArgv(...args: string[]): string[] {
  return ['node', 'layerscope', 'check', NUXT4_ROOT, ...args];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('layerscope check', () => {
  it('exits 1 on boundary violations', async () => {
    const output = captureOutput();
    expect(await run(checkArgv())).toBe(EXIT_VIOLATIONS);
    expect(output.stdout()).toContain('✖ 7 problems (5 errors, 2 warnings)');
  });

  it('exits 0 when nothing is restricted', async () => {
    const output = captureOutput();
    const argv = checkArgv('--config', join(CONFIGS_DIR, 'permissive.config.ts'));
    expect(await run(argv)).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain('✔ No problems');
  });

  it('exits 2 on config errors', async () => {
    const output = captureOutput();
    const argv = checkArgv('--config', join(CONFIGS_DIR, 'unknown-rule.config.ts'));
    expect(await run(argv)).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('unknown rule "no-such-rule"');
  });

  it('exits 2 on an unknown format', async () => {
    const output = captureOutput();
    expect(await run(checkArgv('--format', 'xml'))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('Unknown format "xml"');
  });
});

describe('layerscope check --source and --verbose', () => {
  it('prints where symbols come from to stderr', async () => {
    const output = captureOutput();
    await run(checkArgv('--verbose'));
    expect(output.stderr()).toMatch(/^layerscope: symbols from the registry \(.*registry\.json\)/u);
  });

  it('notes that shadowed-component needs the registry with the .d.ts fallback', async () => {
    const output = captureOutput();
    expect(await run(checkArgv('--source', 'types', '--verbose'))).toBe(EXIT_VIOLATIONS);
    expect(output.stderr()).toContain('symbols from the generated .d.ts files');
    expect(output.stderr()).toContain('layerscope: note: shadowed-component needs');
    expect(output.stdout()).toContain('✖ 7 problems (5 errors, 2 warnings)');
  });

  it('exits 2 on an unknown source', async () => {
    const output = captureOutput();
    expect(await run(checkArgv('--source', 'guess'))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('Unknown source "guess"');
  });
});

describe('layerscope check output', () => {
  it('explains where a crossing symbol resolves to', async () => {
    const output = captureOutput();
    await run(checkArgv());
    expect(output.stdout()).toContain(
      [
        '  2:14    error  Auto-import "useCart" crosses from layer "admin" into "web"  layer-boundary',
        `                 useCart → ${fixturePath('layers/web/app/composables/useCart.ts')}`,
        '                 allowed for "admin": shared, auth',
      ].join('\n'),
    );
  });

  it('prints GitHub annotations', async () => {
    const output = captureOutput();
    await run(checkArgv('--format', 'github'));
    const [first] = output.stdout().split('\n');
    expect(first).toMatch(
      /^::error file=.*AdminPanel\.vue,line=2,col=14,title=layerscope layer-boundary::Auto-import "useCart"/u,
    );
  });

  it('adds the target to JSON findings', async () => {
    const output = captureOutput();
    await run(checkArgv('--format', 'json'));
    const report = JSON.parse(output.stdout()) as { findings: { target: string | null }[] };
    expect(report.findings[0].target).toBe(fixturePath('layers/web/app/composables/useCart.ts'));
  });
});

describe('layerscope why', () => {
  function whyArgv(symbol: string, ...args: string[]): string[] {
    return ['node', 'layerscope', 'why', symbol, NUXT4_ROOT, ...args];
  }

  it('lists every use and the layer path it crosses', async () => {
    const output = captureOutput();
    expect(await run(whyArgv('useCart'))).toBe(EXIT_CLEAN);
    const admin = `${fixturePath('layers/admin/app/components/AdminPanel.vue')}:2:14`;
    const web = `${fixturePath('layers/web/app/components/CartSummary.vue')}:3:14`;
    expect(output.stdout()).toBe(
      [
        `useCart → ${fixturePath('layers/web/app/composables/useCart.ts')} (web)`,
        `  ${admin}   admin → web   ✖ not allowed`,
        `  ${web}    web → web     ✔ same layer`,
        '',
      ].join('\n'),
    );
  });

  it.each(['BaseButton', 'base-button', 'LazyBaseButton'])('accepts %s', async name => {
    const output = captureOutput();
    expect(await run(whyArgv(name))).toBe(EXIT_CLEAN);
    expect(output.stdout()).toMatch(/^BaseButton → .*BaseButton\.vue \(shared\)\n/u);
  });

  it('accepts import specifiers', async () => {
    const output = captureOutput();
    expect(await run(whyArgv('#layers/web/app/composables/useCart'))).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain('exportCsv.ts:1:25');
  });

  it('prints JSON', async () => {
    const output = captureOutput();
    await run(whyArgv('useCart', '--format', 'json'));
    const report = JSON.parse(output.stdout()) as {
      targets: { layer: string; uses: { status: string }[] }[];
    };
    expect(report.targets[0].layer).toBe('web');
    expect(report.targets[0].uses.map(use => use.status)).toEqual(['not-allowed', 'same-layer']);
  });

  it('exits 2 on an unknown symbol', async () => {
    const output = captureOutput();
    expect(await run(whyArgv('noSuchSymbol'))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('No uses of "noSuchSymbol"');
  });
});

describe('layerscope graph and unused', () => {
  it('prints a mermaid layer graph by default', async () => {
    const output = captureOutput();
    expect(await run(['node', 'layerscope', 'graph', NUXT4_ROOT])).toBe(EXIT_CLEAN);
    expect(output.stdout()).toMatch(/^flowchart LR\n/u);
  });

  it('exits 2 on an unknown graph level', async () => {
    const output = captureOutput();
    expect(await run(['node', 'layerscope', 'graph', NUXT4_ROOT, '--by', 'module'])).toBe(
      EXIT_ERROR,
    );
    expect(output.stderr()).toContain('Unknown level "module"');
  });

  it('lists unused symbols and exits 0', async () => {
    const output = captureOutput();
    expect(await run(['node', 'layerscope', 'unused', NUXT4_ROOT])).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain('4 unused symbols in 2 layers');
  });
});
