import { describe, expect, it } from 'vite-plus/test';

import { createRandom, planProject, symbolName, VIOLATION_RATE } from '#bench/plan.ts';

describe('planProject', () => {
  const plan = planProject({ files: 3000, seed: 1 });

  it('is the same project for the same seed, and another for another seed', () => {
    expect(planProject({ files: 3000, seed: 1 })).toEqual(plan);
    expect(planProject({ files: 3000, seed: 2 }).files.map(file => file.content)).not.toEqual(
      plan.files.map(file => file.content),
    );
  });

  it('has the number of source files that was asked for, in ten layers', () => {
    expect(plan.sourceFiles).toBe(3000);
    expect(plan.layers).toHaveLength(10);
    for (const layer of plan.layers) {
      expect(plan.files.some(file => file.path === `layers/${layer}/nuxt.config.ts`)).toBe(true);
    }
    expect(new Set(plan.files.map(file => file.path)).size).toBe(plan.files.length);
  });

  it('mixes components, composables, utils, server utils and API routes', () => {
    const count = (part: string): number =>
      plan.files.filter(file => file.path.includes(part)).length;
    expect(count('/app/components/')).toBe(1200);
    expect(count('/app/composables/')).toBe(750);
    expect(count('/app/utils/')).toBe(450);
    expect(count('/server/utils/')).toBe(300);
    expect(count('/server/api/')).toBe(300);
  });

  it('puts one deliberate violation in about two in a hundred files', () => {
    const rate = plan.expectedFindings / plan.sourceFiles;
    expect(rate).toBeGreaterThan(VIOLATION_RATE / 2);
    expect(rate).toBeLessThan(VIOLATION_RATE * 2);
  });
});

describe('planProject files', () => {
  const plan = planProject({ files: 3000, seed: 1 });

  it('writes a template only in a component, and a server file with server symbols only', () => {
    for (const file of plan.files.filter(item => item.path.includes('/app/composables/'))) {
      expect(file.content).not.toContain('<');
    }
    for (const file of plan.files.filter(item => item.path.includes('/server/'))) {
      expect(file.content).not.toMatch(/use[A-Z]\w+\(|Util\d+\(|Card\d+/u);
    }
  });

  it('lists the layers and what each may use in the config', () => {
    const config = plan.files.find(file => file.path === 'layerscope.config.ts')?.content ?? '';
    expect(config).toContain('shared: { allow: [] }');
    expect(config).toContain("admin: { allow: ['shared', 'auth', 'catalog', 'orders'] }");
  });

  it('names symbols the way Nuxt registers them', () => {
    expect(symbolName('cart', 'component', 3)).toBe('CartCard3');
    expect(symbolName('cart', 'composable', 3)).toBe('useCart3');
    expect(symbolName('cart', 'serverUtil', 3)).toBe('cartStore3');
  });
});

describe('createRandom', () => {
  it('gives the same numbers for a seed, between 0 and 1', () => {
    const first = createRandom(7);
    const second = createRandom(7);
    const numbers = Array.from({ length: 5 }, () => first());
    expect(numbers).toEqual(Array.from({ length: 5 }, () => second()));
    expect(numbers.every(value => value >= 0 && value < 1)).toBe(true);
  });
});
