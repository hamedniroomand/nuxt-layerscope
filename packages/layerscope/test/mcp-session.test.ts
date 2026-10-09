import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { ProjectSession } from '#src/mcp/session.ts';

import { callTool } from './mcp-helpers.ts';
import { page, project, write } from './watch-project.ts';

function sessionAt(root: string, clock: { now: number }): ProjectSession {
  return new ProjectSession({
    rootDir: root,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
    now: () => clock.now,
  });
}

describe('freshness', () => {
  it('sees a change on the next call, without a restart, and shares an analysis for 300 ms', async () => {
    const root = project(5);
    const clock = { now: 1000 };
    const session = sessionAt(root, clock);
    const count = async (): Promise<number> =>
      ((await callTool('check', {}, session)).structuredContent as { total: number }).total;
    expect(await count()).toBe(0);
    write(root, 'layers/a/app/pages/bad.vue', page('./missing'));
    clock.now += 100;
    expect(await count()).toBe(0);
    clock.now += 300;
    expect(await count()).toBe(1);
    write(root, 'layers/a/app/pages/bad.vue', page('../helper'));
    clock.now += 1000;
    expect(await count()).toBe(0);
  });

  it('shares one analysis between calls that run at the same time', async () => {
    const root = project(3);
    const session = sessionAt(root, { now: 1000 });
    const first = session.result();
    const second = session.result();
    expect(await first).toBe(await second);
  });
});

describe('a problem from before the start', () => {
  it('is the result of the first call, and the server goes on after it', async () => {
    const root = project(2);
    const session = new ProjectSession({
      rootDir: root,
      source: 'auto',
      baseline: 'layerscope-baseline.json',
      startupError: '"nuxi prepare" failed in /project',
    });
    const first = await callTool('check', {}, session);
    expect(first.isError).toBe(true);
    expect(first.content[0]?.text).toContain('"nuxi prepare" failed in /project');
    const second = await callTool('check', {}, session);
    expect(second.isError).toBe(false);
  });
});

describe('read-only', () => {
  const dir = fileURLToPath(new URL('../src/mcp', import.meta.url));
  const files = [
    ...readdirSync(dir).map(name => join(dir, name)),
    ...readdirSync(join(dir, 'tools')).map(name => join(dir, 'tools', name)),
  ].filter(file => file.endsWith('.ts'));

  it('has no write to the file system in the server or the tools', () => {
    const write =
      /\b(writeFile|writeFileSync|appendFile|appendFileSync|rm|rmSync|unlink|unlinkSync|rename|renameSync|mkdir|mkdirSync|copyFile|cpSync|createWriteStream)\b/u;
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(write);
    }
  });

  it('imports nothing that writes the baseline or moves files', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/writeBaseline|updateBaseline|from '#src\/fix\/(?!plan)/u);
      expect(source, file).not.toMatch(/from '#src\/baseline\/index\.ts'/u);
    }
  });
});
