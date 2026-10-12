import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { run } from '#src/cli.ts';
import { formatUnused } from '#src/report/unused.ts';
import { findBlindSpots } from '#src/unused/blind-spots.ts';
import { findUnused } from '#src/unused/index.ts';

import { writeProject } from './unused-extra-project.ts';
import { outsideProject } from './unused-outside-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

async function names(root: string): Promise<string[]> {
  const result = await analyze({ rootDir: root, extraFiles: true });
  return findUnused(result).map(symbol => symbol.name);
}

describe('a layer outside the project root (case 8)', () => {
  it('lists a symbol of a local layer and not one of the workspace layer', async () => {
    expect(await names(outsideProject())).toEqual(['useLocalUnused']);
  });

  it('names the layer in the blind spots, in one entry', async () => {
    const result = await analyze({ rootDir: outsideProject(), extraFiles: true });
    expect(findBlindSpots(result)).toContainEqual({ kind: 'outside-root', layers: ['ui'] });
  });

  it('still counts a use in the workspace layer', async () => {
    const root = outsideProject(
      {
        '../packages/ui/app/composables/useUiCaller.ts':
          'export const useUiCaller = () => useLocalUnused();\n',
      },
      { useUiCaller: '../packages/ui/app/composables/useUiCaller.ts' },
    );
    expect(await names(root)).toEqual([]);
  });

  it('gives no entry when no layer is outside the root', async () => {
    const root = writeProject({}, {});
    const result = await analyze({ rootDir: root });
    expect(findBlindSpots(result).map(spot => spot.kind)).toEqual(['test-files']);
  });
});

describe('the report lines for a layer outside the project root', () => {
  async function report(root: string, ...args: string[]): Promise<string> {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    out.mockClear();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await run(['node', 'layerscope', 'unused', root, ...args]);
    return out.mock.calls.map(call => String(call[0])).join('');
  }

  it('prints the "Not listed" line after the "Not counted" line', async () => {
    const text = await report(outsideProject());
    const lines = text.trimEnd().split('\n');
    expect(lines.at(-2)).toBe('Not counted as uses: test files.');
    expect(lines.at(-1)).toBe('Not listed (layers outside the project root): ui.');
  });

  it('prints them after the list of unread files too', async () => {
    const root = outsideProject({ 'layers/web/app/utils/broken.ts': 'export const = ;\n' });
    const text = await report(root);
    const read = text.indexOf('Files that could not be read in full:');
    const counted = text.indexOf('Not counted as uses:');
    const listed = text.indexOf('Not listed (layers outside the project root):');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(counted);
    expect(counted).toBeLessThan(listed);
    expect(text.trimEnd().endsWith('ui.')).toBe(true);
  });

  it('adds the entry to the JSON report', async () => {
    const result = await analyze({ rootDir: outsideProject(), extraFiles: true });
    const json = JSON.parse(
      formatUnused(findUnused(result), 'json', result.rootDir, findBlindSpots(result)),
    ) as { blindSpots: unknown[] };
    expect(json.blindSpots).toContainEqual({ kind: 'outside-root', layers: ['ui'] });
  });
});

describe('"no unused symbol" when a layer is not listed', () => {
  const used = {
    '../packages/ui/app/composables/useUiCaller.ts':
      'export const useUiCaller = () => useLocalUnused();\n',
  };
  const usedImports = { useUiCaller: '../packages/ui/app/composables/useUiCaller.ts' };

  async function report(root: string): Promise<string> {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    out.mockClear();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await run(['node', 'layerscope', 'unused', root]);
    return out.mock.calls.map(call => String(call[0])).join('');
  }

  it('says that the listed layers have none, not that every symbol is referenced', async () => {
    const text = await report(outsideProject(used, usedImports));
    expect(text.startsWith('No unused symbol found in the listed layers.\n')).toBe(true);
    expect(text).not.toContain('Every component and auto-import is referenced');
  });

  it('keeps the sentence about unread files after it', async () => {
    const text = await report(
      outsideProject(
        { ...used, 'layers/web/app/utils/broken.ts': 'export const = ;\n' },
        usedImports,
      ),
    );
    expect(text).toContain(
      'No unused symbol found in the listed layers. 1 file could not be read in full, so some of its uses can be missing.',
    );
  });
});
