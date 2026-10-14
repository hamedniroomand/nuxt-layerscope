import { readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { Analyzer } from '#src/devtools/analyzer.ts';
import { sessionOptions } from '#src/devtools/index.ts';
import { ProjectSession } from '#src/mcp/session.ts';

import { callTool } from './mcp-helpers.ts';
import type { ToolResult } from './mcp-helpers.ts';
import { prepareFixture, privateFixture } from './private-fixture.ts';

/** A private copy of the fixture, so that no other test sees the files that these tests change. */
let copy = '';

beforeAll(() => {
  copy = privateFixture();
}, 120_000);

afterAll(() => {
  rmSync(copy, { recursive: true, force: true });
});

/**
 * Makes an MCP session with a fake clock. Each call moves the clock by 1 s, so that each call makes
 * a new run and does not share the last one.
 */
function mcpSession(): () => Promise<ToolResult> {
  const clock = { now: 1000 };
  const session = new ProjectSession({
    rootDir: copy,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
    now: (): number => clock.now,
  });
  return async (): Promise<ToolResult> => {
    clock.now += 1000;
    const result = await callTool('check', {}, session);
    return result;
  };
}

describe('the DevTools tab on a cached environment', () => {
  it('does not run the stale check again after a new file', async () => {
    const analyzer = new Analyzer(sessionOptions(copy, join(copy, '.nuxt')));
    await analyzer.get();
    const file = join(copy, 'layers/admin/app/components/AdminNew.vue');
    writeFileSync(file, '<template><div /></template>\n');
    try {
      await expect(analyzer.refresh()).resolves.toBeDefined();
    } finally {
      unlinkSync(file);
    }
  }, 120_000);
});

describe('the MCP server on a cached environment (#153)', () => {
  it('stops with the stale error after a new auto-import file, and nuxi prepare clears it', async () => {
    const check = mcpSession();
    const file = join(copy, 'layers/admin/app/composables/useAdminNew.ts');
    try {
      expect((await check()).isError).toBe(false);
      writeFileSync(file, 'export function useAdminNew() {\n  return 1;\n}\n');
      const stale = await check();
      expect(stale.isError).toBe(true);
      expect(stale.content[0]?.text).toMatch(
        /layers\/admin\/app\/composables\/useAdminNew\.ts is missing from the layerscope registry/u,
      );
      prepareFixture(copy);
      expect((await check()).isError).toBe(false);
    } finally {
      // The next test starts from the fixture as it was.
      rmSync(file, { force: true });
      prepareFixture(copy);
    }
  }, 120_000);

  it('stops with the stale error after a deleted auto-import file, and nuxi prepare clears it', async () => {
    const check = mcpSession();
    const file = join(copy, 'layers/admin/app/composables/useAdminTheme.ts');
    const content = readFileSync(file);
    try {
      expect((await check()).isError).toBe(false);
      unlinkSync(file);
      const stale = await check();
      expect(stale.isError).toBe(true);
      expect(stale.content[0]?.text).toMatch(
        /Generated types reference \S*layers\/admin\/app\/composables\/useAdminTheme\.ts, which no longer exists/u,
      );
      prepareFixture(copy);
      expect((await check()).isError).toBe(false);
    } finally {
      // The next test starts from the fixture as it was.
      writeFileSync(file, content);
      prepareFixture(copy);
    }
  }, 120_000);
});
