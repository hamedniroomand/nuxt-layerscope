import { describe, expect, it } from 'vite-plus/test';

import { knownIdentifiers } from '#src/analyze/known-globals.ts';

describe('knownIdentifiers', () => {
  it('includes the globals Nuxt and Nitro define at runtime', () => {
    expect(knownIdentifiers([]).has('$fetch')).toBe(true);
  });

  it('adds the configured globals', () => {
    expect(knownIdentifiers(['trackEvent']).has('trackEvent')).toBe(true);
  });
});
