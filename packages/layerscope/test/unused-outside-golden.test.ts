import { dirname, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { run } from '#src/cli.ts';

import { outsideProject } from './unused-outside-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

async function cli(command: string, ...args: string[]): Promise<string> {
  const root = outsideProject();
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  out.mockClear();
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', command, root, ...args]);
  const text = out.mock.calls.map(call => String(call[0])).join('');
  // The report prints paths relative to the current dir.
  const clean = text
    .replaceAll(relative(process.cwd(), root), '<root>')
    .replaceAll(root, '<root>')
    .replaceAll(relative(process.cwd(), dirname(root)), '<parent>')
    .replaceAll(dirname(root), '<parent>');
  return `exit ${code}\n${clean}`;
}

/** What check, graph and the reports print for a workspace layer, captured before `unused` knew it. */
describe('output with a layer outside the project root (golden)', () => {
  it('check, text', async () => {
    await expect(await cli('check')).toMatchFileSnapshot('snapshots/outside-check-text.txt');
  });

  it('check, json', async () => {
    await expect(await cli('check', '--format', 'json')).toMatchFileSnapshot(
      'snapshots/outside-check-json.txt',
    );
  });

  it('check, sarif', async () => {
    await expect(await cli('check', '--format', 'sarif')).toMatchFileSnapshot(
      'snapshots/outside-check-sarif.txt',
    );
  });

  it('graph, json', async () => {
    await expect(await cli('graph', '--format', 'json')).toMatchFileSnapshot(
      'snapshots/outside-graph.txt',
    );
  });
});
