import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, EXIT_VIOLATIONS, run } from '#src/cli.ts';

const HINT = 'is a layer too, and it is not in the allow list of';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function page(...lines: string[]): string {
  return `<script setup lang="ts">\n${lines.join('\n')}\n</script>\n`;
}

interface Shape {
  /** `website` also uses `admin`, to check that a real boundary still fails. */
  crossing?: boolean;
  /** Root uses `website`, so a root hint for `website` would make a cycle. */
  rootUsesWebsite?: boolean;
}

/**
 * Root holds shared code. `website` and `admin` are feature layers. Both features use root.
 */
function project(allow: string, shape: Shape = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-root-hint-')));
  write(root, 'app/composables/useShared.ts', 'export const useShared = () => 1;\n');
  write(root, 'layers/admin/app/composables/useAdmin.ts', 'export const useAdmin = () => 1;\n');
  write(root, 'layers/website/app/composables/useWeb.ts', 'export const useWeb = () => 1;\n');
  write(
    root,
    '.nuxt/types/imports.d.ts',
    [
      'export {}',
      'declare global {',
      "  const useShared: typeof import('../../app/composables/useShared').useShared",
      "  const useAdmin: typeof import('../../layers/admin/app/composables/useAdmin').useAdmin",
      "  const useWeb: typeof import('../../layers/website/app/composables/useWeb').useWeb",
      '}',
      '',
    ].join('\n'),
  );
  if (shape.rootUsesWebsite === true) {
    write(root, 'app/pages/index.vue', page('const web = useWeb();'));
  }
  write(root, '.nuxt/components.d.ts', '\n');
  write(
    root,
    'layerscope.config.mjs',
    `export default { layers: { website: { path: 'layers/website', allow: ${allow} }, admin: { path: 'layers/admin', allow: ${allow} } } };\n`,
  );
  write(
    root,
    'layers/website/app/pages/shop.vue',
    page('const shared = useShared();', shape.crossing === true ? 'const admin = useAdmin();' : ''),
  );
  write(root, 'layers/admin/app/pages/admin.vue', page('const shared = useShared();'));
  return root;
}

/** Notes go to stderr, so both streams are read. */
function captureOutput(): () => string {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  return () => [...out.mock.calls, ...err.mock.calls].map(call => String(call[0])).join('');
}

interface CliResult {
  code: number;
  out: string;
}

async function cli(command: string, root: string, ...args: string[]): Promise<CliResult> {
  const stdout = captureOutput();
  const code = await run(['node', 'layerscope', command, root, ...args]);
  vi.restoreAllMocks();
  return { code, out: stdout() };
}

const count = (text: string, part: string): number => text.split(part).length - 1;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('root hint in a check', () => {
  it('shows the root hint once per layer and keeps the violation exit code', async () => {
    const { code, out } = await cli('check', project('[]'));
    expect(code).toBe(EXIT_VIOLATIONS);
    expect(count(out, `${HINT} "website"`)).toBe(1);
    expect(count(out, `${HINT} "admin"`)).toBe(1);
  });

  it('shortens the message of each finding that a note covers', async () => {
    const { out } = await cli('check', project('[]'));
    expect(count(out, 'root is a layer, see the note')).toBe(2);
    expect(count(out, 'To let "website" use the project\'s own app/')).toBe(1);
  });

  it('keeps the full message in analyze, which DevTools reads', async () => {
    const result = await analyze({ rootDir: project('[]') });
    const messages = result.findings.map(finding => finding.suggestion?.message ?? '');
    expect(messages).toHaveLength(2);
    expect(messages.every(message => message.startsWith('"root" is a layer too.'))).toBe(true);
    expect(result.notes.join('')).not.toContain('is a layer too, and');
  });

  it('gives no hint and no finding when each layer lists root', async () => {
    const { code, out } = await cli('check', project("['root']"));
    expect(code).toBe(EXIT_CLEAN);
    expect(out).not.toContain(HINT);
  });

  it('gives no hint when a scoped root entry names root', async () => {
    const { code, out } = await cli('check', project("[{ layer: 'root', only: ['useShared'] }]"));
    expect(code).toBe(EXIT_CLEAN);
    expect(out).not.toContain(HINT);
  });

  it('gives no root note for a layer whose suggestion would make a cycle', async () => {
    const { code, out } = await cli('check', project('[]', { rootUsesWebsite: true }));
    expect(code).toBe(EXIT_VIOLATIONS);
    expect(out).toContain('leave it');
    expect(count(out, HINT)).toBe(1);
    expect(count(out, `${HINT} "admin"`)).toBe(1);
  });

  it('shows no root note in graph, which reports no findings', async () => {
    const { out } = await cli('graph', project('[]'));
    expect(out).not.toContain(HINT);
  });
});

describe('root hint with other findings', () => {
  it('keeps the feature-to-feature error with the hint', async () => {
    const { code, out } = await cli('check', project('[]', { crossing: true }));
    expect(code).toBe(EXIT_VIOLATIONS);
    expect(out).toContain('admin');
    expect(count(out, `${HINT} "website"`)).toBe(1);
  });

  it('gives no hint for a layer whose root findings are all in the baseline', async () => {
    const root = project('[]');
    await cli('check', root, '--update-baseline');
    const { code, out } = await cli('check', root);
    expect(code).toBe(EXIT_CLEAN);
    expect(out).not.toContain(HINT);
  });
});
