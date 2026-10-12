import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const calls = vi.hoisted(() => ({ project: [] as string[], lint: [] as string[] }));

vi.mock('#src/eslint/project.ts', () => ({
  projectFor: (file: string): { ok: false; message: string } => {
    calls.project.push(file);
    return { ok: true, project: { rootDir: '/proj' } } as never;
  },
}));

vi.mock('#src/eslint/lint-file.ts', () => ({
  lintFile: (file: string): { source: string; boundary: never[] } => {
    calls.lint.push(file);
    return { source: '', boundary: [] };
  },
}));

vi.mock('#src/utils/fs.ts', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // The path that an editor gives on Windows, and the real path of it.
  realPath: (path: string): string => path.replaceAll('\\', '/').replace('/PROJ/', '/proj/'),
}));

describe('the eslint rules', () => {
  beforeEach(() => {
    calls.project.length = 0;
    calls.lint.length = 0;
  });

  it('use the real path of the file that the editor gives, for the project and for the lint', async () => {
    const { rules } = await import('#src/eslint/rules.ts');
    const report = vi.fn();
    const context = {
      options: [],
      filename: 'C:\\PROJ\\app\\x.vue',
      sourceCode: { text: '' },
      report,
    };
    const listeners = rules['layer-boundary']?.create(context as never) as Record<
      string,
      () => void
    >;
    listeners['Program:exit']?.();
    expect(calls.project).toEqual(['C:/proj/app/x.vue']);
    expect(calls.lint).toEqual(['C:/proj/app/x.vue']);
  });
});
