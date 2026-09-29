import { describe, expect, it } from 'vite-plus/test';

import { reportLocation } from '#src/eslint/location.ts';
import type { Finding } from '#src/types.ts';

const source =
  '<script setup>\nconst cart = useCart();\n</script>\n<template><Card /></template>\n';
const script = '\nconst cart = useCart();\n';

function finding(line: number, column: number): Finding {
  return {
    rule: 'layer-boundary',
    severity: 'error',
    file: 'a.vue',
    line,
    column,
    symbol: 'x',
    fromLayer: 'a',
    toLayer: 'b',
    target: null,
    message: '',
  };
}

describe('reportLocation', () => {
  it('keeps positions when the linter passed the whole file', () => {
    expect(reportLocation(finding(2, 14), source, source)).toEqual({
      line: 2,
      column: 14,
      outside: false,
    });
  });

  it('maps script findings into the script text oxlint passes', () => {
    expect(reportLocation(finding(2, 14), source, script)).toEqual({
      line: 2,
      column: 14,
      outside: false,
    });
  });

  it('flags template findings, which have no position in the script', () => {
    expect(reportLocation(finding(4, 11), source, script)).toEqual({
      line: 1,
      column: 1,
      outside: true,
    });
  });
});
