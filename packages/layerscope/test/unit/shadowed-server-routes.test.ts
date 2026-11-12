import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import type { Nitro, NitroHandler } from '#src/module/nuxt.ts';
import { shadowedServerRoutes } from '#src/module/shadowed-files.ts';
import { shadowedProject } from '#test/shadowed-project.ts';

type Project = ReturnType<typeof shadowedProject>;

/** Nitro with the server dirs of the root and of `base`, and the handlers that Nitro uses. */
function nitroOf(project: Project, handlers: NitroHandler[], options: object = {}): Nitro {
  return {
    scannedHandlers: handlers,
    options: {
      scanDirs: [join(project.root, 'server'), join(project.base, 'server')],
      ignore: [],
      ...options,
    },
  };
}

describe('shadowedServerRoutes', () => {
  it('reports the route file that Nitro does not use, with the route of the winner', async () => {
    const project = shadowedProject([
      'server/api/hello.get.ts',
      'layers/base/server/api/hello.get.ts',
    ]);
    const winner = join(project.root, 'server/api/hello.get.ts');
    const handlers = [{ handler: winner, route: '/api/hello', method: 'get' }];
    expect(await shadowedServerRoutes(nitroOf(project, handlers))).toEqual([
      {
        name: 'GET /api/hello',
        file: join(project.base, 'server/api/hello.get.ts'),
        shadowedBy: winner,
      },
    ]);
  });

  it('names the env, and no method when the name of the file sets none', async () => {
    const project = shadowedProject([
      'server/routes/feed.dev.ts',
      'layers/base/server/routes/feed.dev.ts',
    ]);
    const winner = join(project.root, 'server/routes/feed.dev.ts');
    const handlers = [{ handler: winner, route: '/feed', env: 'dev' }];
    const found = await shadowedServerRoutes(nitroOf(project, handlers));
    expect(found.map(entry => entry.name)).toEqual(['/feed (dev)']);
  });

  it('reads the route dirs and the ignore rules of Nitro', async () => {
    const project = shadowedProject([
      'server/rest/a.ts',
      'layers/base/server/rest/a.ts',
      'server/api/b.ts',
      'layers/base/server/api/b.ts',
      'server/rest/c.ts',
      'layers/base/server/rest/c.ts',
    ]);
    const handlers = ['a', 'c'].map(name => ({
      handler: join(project.root, `server/rest/${name}.ts`),
      route: `/api/${name}`,
    }));
    const found = await shadowedServerRoutes(
      nitroOf(project, handlers, { apiDir: 'rest', ignore: ['**/c.ts'] }),
    );
    expect(found.map(entry => entry.file)).toEqual([join(project.base, 'server/rest/a.ts')]);
  });
});

describe('shadowedServerRoutes and the files that Nitro uses', () => {
  it('reports no server middleware and no Nitro plugin with the same name', async () => {
    const project = shadowedProject([
      'server/api/hello.ts',
      'layers/base/server/api/hello.ts',
      'server/middleware/log.ts',
      'layers/base/server/middleware/log.ts',
      'server/plugins/boot.ts',
      'layers/base/server/plugins/boot.ts',
    ]);
    // Nitro uses both middleware files. It lists the plugins in its options, not as handlers.
    const handlers = [
      { handler: join(project.root, 'server/middleware/log.ts'), middleware: true },
      { handler: join(project.base, 'server/middleware/log.ts'), middleware: true },
      { handler: join(project.root, 'server/api/hello.ts'), route: '/api/hello' },
    ];
    const found = await shadowedServerRoutes(nitroOf(project, handlers));
    expect(found.map(entry => entry.file)).toEqual([join(project.base, 'server/api/hello.ts')]);
  });

  it('reports nothing when a new file of the higher layer is not in the handlers yet', async () => {
    // Under `nuxi dev`, the write can come before Nitro scans the new file again.
    const project = shadowedProject(['server/api/hello.ts', 'layers/base/server/api/hello.ts']);
    const handlers = [{ handler: join(project.base, 'server/api/hello.ts'), route: '/api/hello' }];
    expect(await shadowedServerRoutes(nitroOf(project, handlers))).toEqual([]);
  });

  it('reports nothing without the scan of Nitro', async () => {
    const project = shadowedProject(['server/api/hello.ts', 'layers/base/server/api/hello.ts']);
    expect(await shadowedServerRoutes(null)).toEqual([]);
    expect(await shadowedServerRoutes({ options: {} })).toEqual([]);
    const { scannedHandlers: _, ...noHandlers } = nitroOf(project, []);
    expect(await shadowedServerRoutes(noHandlers)).toEqual([]);
  });
});
