import { existsSync } from 'node:fs';

import { join, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_ERROR, run } from '#src/cli.ts';
import { prepareApply, realIo, runApply } from '#src/fix/apply.ts';
import { rewrite } from '#src/fix/edits.ts';
import type { ImportUpdate } from '#src/fix/types.ts';

import { CART, MOVED, OLD, applyArgs, read, repoProject, silence } from './fix-apply-project.ts';
import { ADMIN, SHOP, WEB, cartProject, plan, write } from './fix-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const cwd = (): string => process.cwd();

describe('fix --apply and file names that differ only in letter case', () => {
  it('refuses two targets that are the same file on a case-insensitive file system', async () => {
    const root = repoProject();
    const [move] = await plan(root);
    const other = {
      ...move,
      from: join(root, 'layers/shared/app/utils/noop.ts'),
      to: move.to.replace('useCart', 'USECART'),
    };
    expect(() => prepareApply([move, other], root, { allowDirty: true, cwd: cwd() })).toThrow(
      `${relative(cwd(), other.to)} and ${relative(cwd(), move.to)} differ only in letter case.`,
    );
  });

  it('refuses a target that has the name of an existing file in another case', async () => {
    const root = repoProject();
    const [move] = await plan(root);
    write(root, 'layers/shared/app/composables/USECART.ts', 'export const x = 1;\n');
    // On a case-insensitive file system the path exists, so it is a refusal of that kind.
    expect(() => prepareApply([move], root, { allowDirty: true, cwd: cwd() })).toThrow(
      /exists, so|differs only in letter case/u,
    );
  });

  it('never overwrites a file that appeared after the checks', async () => {
    const root = repoProject();
    const prepared = prepareApply(await plan(root), root, { allowDirty: false, cwd: cwd() });
    // A plain rename replaces a file without a word, so the step must check it before.
    for (const step of prepared.steps) {
      if (step.kind === 'move') {
        step.tracked = false;
      }
    }
    write(root, MOVED, 'export const other = 1;\n');
    const result = runApply(prepared, realIo(root));
    expect(result.failure).toContain('exists');
    expect(read(root, MOVED)).toBe('export const other = 1;\n');
    expect(existsSync(join(root, CART))).toBe(true);
  });
});

describe('fix --apply and a target path that a string cannot hold', () => {
  it('refuses a quote in the new specifier, and changes nothing', async () => {
    const quoted = 'shared: { path: "layers/sha\'red", allow: [] }';
    const root = cartProject([WEB, quoted, ADMIN, SHOP]);
    write(root, "layers/sha'red/app/utils/noop.ts", 'export const noop = () => 0;\n');
    const output = silence();
    expect(await run(applyArgs(root, '--allow-dirty'))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(
      'cannot get the new specifier "../../../sha\'red/app/composables/useCart": it has a character that layerscope does not write in a string. Update this import by hand.',
    );
    expect(existsSync(join(root, CART))).toBe(true);
    expect(read(root, 'layers/admin/app/pages/admin.vue')).toContain(`'${OLD}'`);
  });
});

const at = (specifier: string, updated: string): ImportUpdate => ({
  file: '/a.ts',
  line: 1,
  column: 15,
  specifier,
  updated,
});

describe('the rewrite of a specifier', () => {
  it('writes a safe specifier in each kind of quote', () => {
    expect(rewrite("import x from './a';", [at('./a', './b')])).toBe("import x from './b';");
    expect(rewrite('import x from "./a";', [at('./a', './b')])).toBe('import x from "./b";');
  });

  it.each([
    ['a quote of the same kind', "import x from './a';", "./b'c"],
    ['a backslash', "import x from './a';", '.\\b'],
    ['a new line', "import x from './a';", './b\nc'],
    ['${ in a template string', 'import(`./a`);', './b${c}'],
  ])('refuses %s', (_name, text, updated) => {
    const column = text.indexOf(text.includes('`') ? '`' : "'") + 1;
    const result = rewrite(text, [{ ...at('./a', updated), column }]);
    expect(typeof result).toBe('object');
  });
});
