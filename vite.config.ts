import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    arrowParens: 'avoid',
    sortTailwindcss: true,
    experimentalOperatorPosition: 'end',
    bracketSameLine: false,
    bracketSpacing: true,
    embeddedLanguageFormatting: 'auto',
    endOfLine: 'lf',
    ignorePatterns: [
      '.wrangler',
      'openspec',
      '**/.nuxt/**',
      '**/.output/**',
      'packages/layerscope/test/fixtures/**',
      'packages/layerscope/test/snapshots/**',
    ],
    insertFinalNewline: true,
    jsxSingleQuote: false,
    objectWrap: 'preserve',
    printWidth: 100,
    proseWrap: 'preserve',
    quoteProps: 'as-needed',
    semi: true,
    singleAttributePerLine: true,
    singleQuote: true,
    sortImports: {
      internalPattern: ['@/', '~/'],
    },
    sortPackageJson: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
    vueIndentScriptAndStyle: true,
  },
  lint: {
    ignorePatterns: [
      'commitlint.config.js',
      'vite.config.ts',
      '**/.nuxt/**',
      '**/.output/**',
      'packages/layerscope/test/fixtures/**',
      'packages/layerscope/test/snapshots/**',
      // Like the fixtures, the playground relies on Nuxt auto-imports that the linter cannot see.
      'packages/playground/**',
    ],
    categories: {
      correctness: 'error',
      perf: 'error',
      restriction: 'error',
      nursery: 'error',
      pedantic: 'error',
    },
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    options: { typeAware: true, typeCheck: true },
    plugins: ['vue', 'import', 'oxc', 'promise', 'unicorn', 'typescript', 'eslint'],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'typescript/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'import/first': 'error',
      'import/no-duplicates': 'error',
      'import/no-mutable-exports': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/throw-new-error': 'error',
      'unicorn/error-message': 'error',
      'oxc/no-async-await': 'off',
      'oxc/no-optional-chaining': 'off',
      'oxc/no-rest-spread-properties': 'off',
      'no-undefined': 'off',
      'typescript/prefer-readonly-parameter-types': 'off',
    },
    env: { node: true, es2024: true },
    overrides: [
      {
        files: ['**/*.config.ts'],
        rules: { 'import/no-default-export': 'off' },
      },
      {
        files: [
          'packages/layerscope/src/index.ts',
          'packages/layerscope/src/eslint/index.ts',
          'packages/docs/.vitepress/theme/index.ts',
          'packages/docs/.vitepress/shims.d.ts',
        ],
        rules: { 'import/no-default-export': 'off' },
      },
      {
        files: ['packages/docs/.vitepress/**'],
        env: { browser: true },
        globals: { defineProps: 'readonly' },
        rules: {
          'vue/max-props': 'off',
          'import/unambiguous': 'off',
        },
      },
      {
        files: ['packages/layerscope/src/devtools/client/**', 'packages/layerscope/test/client/**'],
        env: { browser: true },
        globals: { defineProps: 'readonly', defineEmits: 'readonly', defineExpose: 'readonly' },
        rules: { 'vue/max-props': 'off' },
      },
      {
        files: [
          'packages/layerscope/src/devtools/client/**/*.vue',
          'packages/layerscope/src/devtools/client/shims.d.ts',
        ],
        rules: { 'import/unambiguous': 'off' },
      },
      {
        files: ['packages/docs/.vitepress/config.ts'],
        rules: { 'import/no-default-export': 'off' },
      },
      {
        // Maintainer scripts: they report to the terminal, capture one page after the other, and
        // run code in the browser through Playwright.
        files: ['packages/docs/scripts/**'],
        env: { browser: true },
        rules: { 'no-console': 'off', 'no-await-in-loop': 'off', 'unicorn/no-process-exit': 'off' },
      },
    ],
  },
  test: {
    projects: ['packages/*'],
    coverage: {
      include: ['packages/layerscope/src/**/*.ts'],
      exclude: [
        // CLI process.exitCode entry; no logic beyond run().
        'packages/layerscope/src/bin.ts',
        // Spawns `nuxi prepare`; integration glue, not unit-testable cheaply.
        'packages/layerscope/src/analyze/prepare.ts',
        // Nuxt module + kit hooks; covered by fixture runs, brittle to unit-mock.
        'packages/layerscope/src/module/**',
        // DevTools Nuxt registration; handler/page/analyzer stay covered.
        'packages/layerscope/src/devtools/index.ts',
        // Browser entry of the DevTools client; it only mounts the app.
        'packages/layerscope/src/devtools/client/main.ts',
        'packages/layerscope/src/devtools/client/shims.d.ts',
      ],
      reporter: ['text', 'html', 'clover', 'json', 'lcov'],
      thresholds: { statements: 90, branches: 80, functions: 90, lines: 90 },
    },
  },
  run: {
    cache: true,
  },
});
