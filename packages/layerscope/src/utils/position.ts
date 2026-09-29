export interface Position {
  line: number;
  column: number;
}

/** 1-based line and column of a character offset. */
export function lineColumn(source: string, offset: number): Position {
  let line = 1;
  let lineStart = 0;
  for (let i = source.indexOf('\n'); i !== -1 && i < offset; i = source.indexOf('\n', i + 1)) {
    line += 1;
    lineStart = i + 1;
  }
  return { line, column: offset - lineStart + 1 };
}

/** Character offset of a 1-based line and column; the inverse of `lineColumn`. */
export function offsetAt(source: string, { line, column }: Position): number {
  let lineStart = 0;
  for (let current = 1; current < line; current += 1) {
    lineStart = source.indexOf('\n', lineStart) + 1;
  }
  return lineStart + column - 1;
}
