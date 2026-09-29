import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { Linter } from 'eslint';
import { join } from 'pathe';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vite-plus/test';
import vueParser from 'vue-eslint-parser';

import plugin from '#src/eslint/index.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

const linter = new Linter({ configType: 'flat' });

const config: Linter.Config[] = [
  {
    files: ['**/*.vue'],
    languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser } },
  },
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  plugin.configs.recommended,
];

function lint(file: string, code = readFileSync(file, 'utf8')): string[] {
  return linter
    .verify(code, config, file)
    .map(message => `${message.line}:${message.column} ${message.ruleId} ${message.message}`);
}

describe('eslint plugin', () => {
  it('reports auto-import and component crossings in .vue files', () => {
    const messages = lint(join(NUXT4_ROOT, 'layers/admin/app/components/AdminPanel.vue'));
    expect(messages).toEqual([
      expect.stringMatching(/^2:14 layerscope\/layer-boundary Auto-import "useCart" crosses/u),
      expect.stringMatching(/^8:5 layerscope\/layer-boundary Component <CartSummary> crosses/u),
    ]);
  });

  it('names the target and the allowed layers', () => {
    const [message] = lint(join(NUXT4_ROOT, 'layers/admin/app/utils/exportCsv.ts'));
    expect(message).toContain(
      '→ layers/web/app/composables/useCart.ts (allowed for "admin": shared, auth)',
    );
  });

  it('reports unresolved references as a separate rule', () => {
    expect(lint(join(NUXT4_ROOT, 'layers/web/app/composables/useCart.ts'))).toEqual([
      expect.stringMatching(/^2:3 layerscope\/unresolved-reference "trackEvent"/u),
    ]);
  });

  it('lints the unsaved text, not the file on disk', () => {
    const file = join(NUXT4_ROOT, 'layers/auth/app/composables/useAuth.ts');
    expect(lint(file, 'export const useAuthCart = () => useCart();')).toEqual([
      expect.stringMatching(/layer-boundary Auto-import "useCart" crosses from layer "auth"/u),
    ]);
  });

  it('skips files outside the checked dirs', () => {
    expect(lint(join(NUXT4_ROOT, 'nuxt.config.ts'))).toEqual([]);
  });

  it('asks for nuxi prepare when no registry is found', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-')));
    const file = join(dir, 'a.ts');
    writeFileSync(file, 'export const a = 1;');
    // ESLint only lints files under its working dir.
    const messages = new Linter({ configType: 'flat', cwd: dir }).verify(
      'export const a = 1;',
      config,
      file,
    );
    expect(messages.map(message => message.message)).toEqual([
      expect.stringContaining('Run "nuxi prepare"'),
    ]);
  });
});
