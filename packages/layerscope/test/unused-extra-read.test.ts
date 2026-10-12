import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyzeOrFail } from '#src/analyze/cache.ts';
import type { AnalysisEnv } from '#src/analyze/file-analysis.ts';

import { makeLayer } from './factories.ts';

const env = {} as AnalysisEnv;

describe('reading an extra file', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-read-')));
  const layer = makeLayer('web', dir);

  it('skips a file that is gone', () => {
    expect(analyzeOrFail(join(dir, 'gone.ts'), layer, env)).toBeNull();
  });

  it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')(
    'records a file in a dir that denies access as unread, not as gone',
    () => {
      mkdirSync(join(dir, 'locked'));
      writeFileSync(join(dir, 'locked/a.ts'), 'export const a = 1;\n');
      chmodSync(join(dir, 'locked'), 0);
      try {
        expect(analyzeOrFail(join(dir, 'locked/a.ts'), layer, env)?.unread).toBe(
          'Could not read file (EACCES)',
        );
      } finally {
        chmodSync(join(dir, 'locked'), 0o755);
      }
    },
  );
});
