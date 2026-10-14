import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { runtimeComponents } from '#src/analyze/runtime-components.ts';
import type { ComponentMap } from '#src/nuxt/symbols.ts';
import { makeLayer, makeRegistry } from '#test/factories.ts';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A build dir with the given `nuxt.d.ts`, or with none. */
function buildDir(nuxtTypes: string | null = null): string {
  const dir = mkdtempSync(join(tmpdir(), 'layerscope-runtime-'));
  created.push(dir);
  if (nuxtTypes !== null) {
    writeFileSync(join(dir, 'nuxt.d.ts'), nuxtTypes);
  }
  return dir;
}

function components(...files: string[]): ComponentMap {
  return new Map(files.map((file, index) => [`C${index}`, [{ file, module: null }]]));
}

const LAYER = makeLayer('web', '/p/app');

describe('global components from the .d.ts files (#119)', () => {
  it('marks a file in the components/global/ dir of a layer, also in a sub dir', () => {
    const files = ['/p/app/components/global/Banner.vue', '/p/app/components/global/a/Tip.vue'];
    const found = runtimeComponents(null, components(...files), [LAYER], buildDir());
    expect(found.globalComponentFiles).toEqual(files);
  });

  it('marks a file with the .global suffix, also with .island after it', () => {
    const files = [
      '/p/app/components/Banner.global.vue',
      '/p/app/components/Tip.global.island.vue',
    ];
    const found = runtimeComponents(null, components(...files), [LAYER], buildDir());
    expect(found.globalComponentFiles).toEqual(files);
  });

  it('does not mark other files, a dir with the same prefix or a layer with its own dirs', () => {
    const files = ['/p/app/components/Banner.vue', '/p/app/components/globals/Tip.vue'];
    const custom = { ...LAYER, defaultComponents: false };
    const global = '/p/app/components/global/Note.vue';
    expect(
      runtimeComponents(null, components(...files), [LAYER], buildDir()).globalComponentFiles,
    ).toEqual([]);
    expect(
      runtimeComponents(null, components(global), [custom], buildDir()).globalComponentFiles,
    ).toEqual([]);
  });
});

describe('Nuxt Content from the .d.ts files (#119)', () => {
  it('reads the reference line of Nuxt Content in nuxt.d.ts', () => {
    const types = '/// <reference types="@nuxt/content" />\n/// <reference types="nuxt/app" />\n';
    expect(runtimeComponents(null, components(), [LAYER], buildDir(types)).nuxtContent).toBe(true);
  });

  it('is false without the line, and without nuxt.d.ts', () => {
    const types = '/// <reference types="@nuxt/devtools" />\n';
    expect(runtimeComponents(null, components(), [LAYER], buildDir(types)).nuxtContent).toBe(false);
    expect(runtimeComponents(null, components(), [LAYER], buildDir()).nuxtContent).toBe(false);
  });
});

describe('global components and Nuxt Content from the registry (#119)', () => {
  it('takes both from the registry, not from the paths', () => {
    const registry = {
      ...makeRegistry(),
      nuxtContent: true,
      components: [
        {
          name: 'Tip',
          file: '/p/app/components/Tip.vue',
          mode: 'all' as const,
          island: false,
          global: true,
          priority: 1,
        },
        {
          name: 'Note',
          file: '/p/app/components/global/Note.vue',
          mode: 'all' as const,
          island: false,
          global: false,
          priority: 1,
        },
      ],
    };
    const found = runtimeComponents(registry, components(), [LAYER], buildDir());
    expect(found).toEqual({
      globalComponentFiles: ['/p/app/components/Tip.vue'],
      nuxtContent: true,
    });
  });
});
