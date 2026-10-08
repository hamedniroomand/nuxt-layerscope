import { describe, expect, it, vi } from 'vite-plus/test';

import { hideWasiWarning } from '#src/hide-wasi-warning.ts';

function setup(): {
  original: ReturnType<typeof vi.fn>;
  target: { emitWarning: (warning: string | Error, ...rest: unknown[]) => void };
} {
  const original = vi.fn();
  const target = { emitWarning: original };
  hideWasiWarning(target);
  return { original, target };
}

describe('hideWasiWarning', () => {
  it('drops the WASI ExperimentalWarning, as a type string or as options', () => {
    const { original, target } = setup();
    target.emitWarning('WASI is an experimental feature', 'ExperimentalWarning');
    target.emitWarning('WASI is an experimental feature', { type: 'ExperimentalWarning' });
    const error = new Error('WASI is an experimental feature');
    error.name = 'ExperimentalWarning';
    target.emitWarning(error);
    expect(original).not.toHaveBeenCalled();
  });

  it('keeps every other warning', () => {
    const { original, target } = setup();
    target.emitWarning('Fetch is an experimental feature', 'ExperimentalWarning');
    target.emitWarning('WASI is old', 'DeprecationWarning');
    target.emitWarning('Something else');
    expect(original).toHaveBeenCalledTimes(3);
  });
});
