type EmitWarning = (warning: string | Error, ...rest: unknown[]) => void;

interface WarningTarget {
  emitWarning: EmitWarning;
}

/** Node prints this when oxc-parser uses its wasm fallback, for example on StackBlitz. */
export function isWasiWarning(warning: string | Error, rest: unknown[]): boolean {
  const [type] = rest;
  const kind = typeof type === 'string' ? type : (type as { type?: string } | undefined)?.type;
  const name = warning instanceof Error ? warning.name : kind;
  const message = typeof warning === 'string' ? warning : warning.message;
  return name === 'ExperimentalWarning' && message.startsWith('WASI');
}

/** Drops the WASI ExperimentalWarning only. Every other warning still reaches the user. */
export function hideWasiWarning(target: WarningTarget = process as WarningTarget): void {
  const emit = target.emitWarning.bind(target);
  target.emitWarning = (warning, ...rest): void => {
    if (!isWasiWarning(warning, rest)) {
      emit(warning, ...rest);
    }
  };
}
