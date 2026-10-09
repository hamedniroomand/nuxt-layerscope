import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { loadConfig, loadConfigSync } from '#src/config/load.ts';
import { importNative } from '#src/config/native.ts';

import { tempDir } from './watch-project.ts';

const PLAIN = (value: string): string =>
  `export default { layers: { a: { allow: ['${value}'] } } };\n`;
const DEFINE = (value: string): string =>
  `import { defineConfig } from 'nuxt-layerscope';\nexport default defineConfig({ layers: { a: { allow: ['${value}'] } } });\n`;
const CJS = (value: string): string =>
  `module.exports = { layers: { a: { allow: ['${value}'] } } };\n`;

interface Project {
  dir: string;
  write: (name: string, text: string) => void;
}

function project(type: 'module' | 'commonjs'): Project {
  const dir = tempDir();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type }));
  return {
    dir,
    write: (name, text) => {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    },
  };
}

const allowOf = async (dir: string): Promise<unknown> => (await loadConfig(dir)).layers?.a.allow;

describe.each([
  ['layerscope.config.ts', 'module', PLAIN],
  ['layerscope.config.mts', 'module', PLAIN],
  ['layerscope.config.js', 'module', PLAIN],
  ['layerscope.config.js', 'commonjs', CJS],
  ['layerscope.config.mjs', 'module', PLAIN],
  ['layerscope.config.mjs', 'module', DEFINE],
] as const)('a config in %s (%s package)', (name, type, make) => {
  it('gives the new value when the file changes between two loads in one process', async () => {
    const { dir, write } = project(type);
    write(name, make('first'));
    expect(await allowOf(dir)).toEqual(['first']);
    write(name, make('second'));
    expect(await allowOf(dir)).toEqual(['second']);
    expect(await allowOf(dir)).toEqual(['second']);
  });
});

describe('a native ES module config', () => {
  it('reloads when only the content changes and the mtime stays the same', async () => {
    const { dir, write } = project('module');
    const file = 'layerscope.config.mjs';
    const stamp = new Date('2020-01-01T00:00:00Z');
    write(file, PLAIN('aaaaa'));
    utimesSync(join(dir, file), stamp, stamp);
    expect(await allowOf(dir)).toEqual(['aaaaa']);
    write(file, PLAIN('bbbbb'));
    utimesSync(join(dir, file), stamp, stamp);
    expect(await allowOf(dir)).toEqual(['bbbbb']);
  });

  it('reports a local file that is missing as a failed load, not as a jiti error', async () => {
    const { dir, write } = project('module');
    write('layerscope.config.mjs', "import x from './missing.mjs';\nexport default { x };\n");
    await expect(loadConfig(dir)).rejects.toThrow(
      /Failed to load .*layerscope\.config\.mjs: .*missing\.mjs/u,
    );
    await expect(loadConfig(dir)).rejects.not.toThrow(/jiti/iu);
  });

  it('reports an error in the config as a failed load', async () => {
    const { dir, write } = project('module');
    write('layerscope.config.mjs', "throw new Error('broken config');\n");
    await expect(loadConfig(dir)).rejects.toThrow('Failed to load');
    await expect(loadConfig(dir)).rejects.toThrow('broken config');
  });

  it('keeps the old copy of a local file that the config imports', async () => {
    const { dir, write } = project('module');
    write('values.mjs', "export const value = 'one';\n");
    write(
      'layerscope.config.mjs',
      "import { value } from './values.mjs';\nexport default { layers: { a: { allow: [value] } } };\n",
    );
    expect(await allowOf(dir)).toEqual(['one']);
    write('values.mjs', "export const value = 'two';\n");
    // Known limit: only the config file gets a new URL, not the files that it imports.
    expect(await allowOf(dir)).toEqual(['one']);
  });
});

describe('the sync loader of the lint rule', () => {
  it.each(['layerscope.config.ts', 'layerscope.config.mjs'])('gives the new value for %s', name => {
    const { dir, write } = project('module');
    write(name, PLAIN('first'));
    expect(loadConfigSync(dir).layers?.a.allow).toEqual(['first']);
    write(name, PLAIN('second'));
    expect(loadConfigSync(dir).layers?.a.allow).toEqual(['second']);
  });
});

describe('a config that only jiti can load', () => {
  it('loads ES module syntax in a .js file of a CommonJS package', async () => {
    const { dir, write } = project('commonjs');
    write('layerscope.config.js', PLAIN('esm-in-cjs'));
    expect(await allowOf(dir)).toEqual(['esm-in-cjs']);
  });

  it('loads module.exports in a .js file of an ES module package', async () => {
    const { dir, write } = project('module');
    write('layerscope.config.js', CJS('cjs-in-esm'));
    expect(await allowOf(dir)).toEqual(['cjs-in-esm']);
  });

  it('loads a JSON import without an import attribute', async () => {
    const { dir, write } = project('module');
    write('values.json', '{ "value": "from-json" }\n');
    write(
      'layerscope.config.mjs',
      "import values from './values.json';\nexport default { layers: { a: { allow: [values.value] } } };\n",
    );
    expect(await allowOf(dir)).toEqual(['from-json']);
  });

  it('shows the error of Node when both Node and jiti fail', async () => {
    const { dir, write } = project('module');
    write('layerscope.config.mjs', "import x from './missing.mjs';\nexport default { x };\n");
    await expect(loadConfig(dir)).rejects.toThrow(/Failed to load .*: .*missing\.mjs/u);
  });
});

describe('a CommonJS config', () => {
  it('reloads when it is reached through a symlink', async () => {
    const { dir, write } = project('commonjs');
    const real = tempDir();
    writeFileSync(join(real, 'package.json'), '{"type":"commonjs"}');
    writeFileSync(join(real, 'config.js'), CJS('first'));
    symlinkSync(join(real, 'config.js'), join(dir, 'layerscope.config.js'));
    write('unused.txt', '');
    expect(await allowOf(dir)).toEqual(['first']);
    writeFileSync(join(real, 'config.js'), CJS('second'));
    expect(await allowOf(dir)).toEqual(['second']);
  });

  it('reloads with the sync loader', () => {
    const { dir, write } = project('commonjs');
    write('layerscope.config.js', CJS('first'));
    expect(loadConfigSync(dir).layers?.a.allow).toEqual(['first']);
    write('layerscope.config.js', CJS('second'));
    expect(loadConfigSync(dir).layers?.a.allow).toEqual(['second']);
  });
});

describe('in plain Node, without the test runner', () => {
  const load = fileURLToPath(new URL('../src/config/load.ts', import.meta.url));
  const script = (dir: string): string => `
    import { writeFileSync } from 'node:fs';
    import { loadConfig } from ${JSON.stringify(load)};
    const file = ${JSON.stringify(join(dir, 'layerscope.config.mjs'))};
    const out = [];
    for (const value of ['one', 'two']) {
      writeFileSync(file, "export default { layers: { a: { allow: ['" + value + "'] } } };\\n");
      out.push((await loadConfig(${JSON.stringify(dir)})).layers.a.allow[0]);
    }
    console.log(JSON.stringify(out));
  `;

  it('loads a .mjs config twice with an edit between the loads', () => {
    const { dir, write } = project('module');
    write('run.mjs', script(dir));
    const out = execFileSync('node', [join(dir, 'run.mjs')], { encoding: 'utf8', stdio: 'pipe' });
    expect(JSON.parse(out)).toEqual(['one', 'two']);
  });

  it('prints no warning for ES module syntax in a .js file of a CommonJS package', () => {
    const { dir, write } = project('commonjs');
    write('layerscope.config.js', PLAIN('quiet'));
    write(
      'run.mjs',
      `import { loadConfig } from ${JSON.stringify(load)};\nconsole.log((await loadConfig(${JSON.stringify(dir)})).layers.a.allow[0]);\n`,
    );
    const result = spawnSync('node', [join(dir, 'run.mjs')], { encoding: 'utf8' });
    expect(result.stdout.trim()).toBe('quiet');
    expect(result.stderr).not.toContain('Failed to load the ES module');
  });
});

describe('the filter for the Node warning', () => {
  it('puts process.emit back after loads that overlap', async () => {
    const before: unknown = Reflect.get(process, 'emit');
    const first = project('commonjs');
    const second = project('commonjs');
    first.write('layerscope.config.js', PLAIN('one'));
    second.write('layerscope.config.js', PLAIN('two'));
    const results = await Promise.all([
      importNative(join(first.dir, 'layerscope.config.js')),
      importNative(join(second.dir, 'layerscope.config.js')),
    ]);
    expect(results.every(result => 'value' in result)).toBe(true);
    expect(Reflect.get(process, 'emit')).toBe(before);
  });
});
