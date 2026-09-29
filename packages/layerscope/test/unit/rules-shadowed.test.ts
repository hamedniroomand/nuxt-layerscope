import { describe, expect, it } from 'vite-plus/test';

import { createOwnerLookup } from '#src/nuxt/owner.ts';
import { shadowedFindings } from '#src/rules/shadowed-component.ts';
import { makeLayer, makeRegistry } from '#test/factories.ts';

const ownerOf = createOwnerLookup([
  makeLayer('base', '/nonexistent/base'),
  makeLayer('app', '/nonexistent/app'),
]);

describe('shadowedFindings', () => {
  it('reports a component overridden by another layer', () => {
    const registry = makeRegistry([
      [
        'BaseCard',
        '/nonexistent/base/app/components/BaseCard.vue',
        '/nonexistent/app/app/components/BaseCard.vue',
      ],
    ]);
    expect(shadowedFindings(registry, ownerOf, {})).toMatchObject([
      {
        rule: 'shadowed-component',
        severity: 'warn',
        symbol: 'BaseCard',
        fromLayer: 'base',
        toLayer: 'app',
        line: 1,
        column: 1,
        message: 'Component <BaseCard> of layer "base" is overridden by layer "app"',
      },
    ]);
  });

  it('names the file when the winner lives outside every layer', () => {
    const registry = makeRegistry([
      ['BaseCard', '/nonexistent/base/app/components/BaseCard.vue', '/elsewhere/BaseCard.vue'],
    ]);
    const [finding] = shadowedFindings(registry, ownerOf, {});
    expect(finding.toLayer).toBeNull();
    expect(finding.message).toContain('overridden by /elsewhere/BaseCard.vue');
  });

  it('ignores shadowed components outside every layer', () => {
    const registry = makeRegistry([
      ['Lib', '/elsewhere/node_modules/lib/Lib.vue', '/nonexistent/app/app/components/Lib.vue'],
    ]);
    expect(shadowedFindings(registry, ownerOf, {})).toEqual([]);
  });

  it('reports nothing when the rule is off', () => {
    const registry = makeRegistry([['A', '/nonexistent/base/A.vue', '/nonexistent/app/A.vue']]);
    const config = { rules: { 'shadowed-component': 'off' as const } };
    expect(shadowedFindings(registry, ownerOf, config)).toEqual([]);
  });
});
