import { decode } from '@jridgewell/sourcemap-codec';
import type { ImportExpression } from 'oxc-parser';

import { fixedPath } from './ast.ts';

/** The offset of the start of each line. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) {
    starts.push(at + 1);
  }
  return starts;
}

/**
 * Each mapping of the source map of the render code as two offsets: in the render code and in the
 * template content. The pairs are in render code order.
 */
export function mapPairs(code: string, content: string, mappings: string): [number, number][] {
  const codeStarts = lineStarts(code);
  const contentStarts = lineStarts(content);
  const pairs: [number, number][] = [];
  for (const [line, segments] of decode(mappings).entries()) {
    for (const [column, , contentLine, contentColumn] of segments) {
      const lineStart = contentLine === undefined ? undefined : contentStarts[contentLine];
      if (lineStart !== undefined && contentColumn !== undefined) {
        pairs.push([codeStarts[line] + column, lineStart + contentColumn]);
      }
    }
  }
  return pairs.toSorted((a, b) => a[0] - b[0]);
}

/**
 * The offset in the file of the path of an `import()` of the render code. Two mappings can give
 * it: the last one before the path and the first one after it. A mapping gives the offset only
 * when the render code between it and the path is also the template text there. `clean` must also
 * accept that text with the first character of the path, and the text up to the mapping or the
 * path. If no mapping gives the offset, a fixed path gets the `>` of `<template>`.
 * `fix` finds no quote there, so it does not write. Any other path gets the first mapping in it,
 * as for a name. That offset is only a hint for the line.
 */
export function importOffset(
  node: ImportExpression,
  code: string,
  content: string,
  pairs: [number, number][],
  templateStart: number,
  clean: (span: { from: number; to: number; end: number }) => boolean,
): number {
  const path = node.source;
  const anchors = [
    pairs.findLast(([at]) => at <= path.start),
    pairs.find(([at]) => at >= path.start),
  ];
  for (const [codeAt, contentAt] of anchors.filter(anchor => anchor !== undefined)) {
    const from = Math.min(codeAt, path.start);
    const to = Math.max(codeAt, path.start);
    const start = contentAt + from - codeAt;
    const offset = templateStart + contentAt + path.start - codeAt;
    const span = {
      from: Math.min(templateStart + start, offset),
      to: Math.max(templateStart + start + to - from, offset + 1),
      // The mapping itself: before the path, or after it.
      end: Math.max(templateStart + contentAt, offset),
    };
    // An empty text proves nothing: the mapping can be on a wrong line.
    if (from < to && start >= 0 && content.startsWith(code.slice(from, to), start) && clean(span)) {
      return offset;
    }
  }
  if (fixedPath(path) !== null) {
    // Not the mapping: it can be on a string with the same path, and `fix` would rewrite that string.
    return templateStart - 1;
  }
  const inside = pairs.find(([at]) => at >= path.start && at < path.end);
  return inside === undefined ? templateStart : templateStart + inside[1];
}
