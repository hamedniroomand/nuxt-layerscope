import { accessSync, constants, readFileSync } from 'node:fs';

import { relative } from 'pathe';

import { offsetAt } from '#src/utils/position.ts';

import type { ImportUpdate } from './types.ts';

const QUOTES = new Set(["'", '"', '`']);
// Characters that a specifier cannot hold in a string literal without an escape.
const UNSAFE = /[\\\r\n\u2028\u2029]/u;

/** A change of one file: its new text, which is written at the path it has before the moves. */
export interface Edit {
  file: string;
  /** The text that the plan was made from. The file must still have it before the write. */
  source: string;
  text: string;
  /** Imports that the edit rewrites. */
  imports: number;
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The text of a file with the updates written in. The scan found each specifier at a line and a
 * column, so the quote there is checked, and only the text inside the quotes changes. The updates
 * run from the end of the file to the start, so the places of the others do not move. When one
 * update cannot be written, the result is that update and the reason.
 */
export function rewrite(
  text: string,
  updates: ImportUpdate[],
): string | { update: ImportUpdate; reason: string } {
  let result = text;
  const places = updates
    .map(update => ({ update, offset: offsetAt(text, update) }))
    .toSorted((a, b) => b.offset - a.offset);
  for (const { update, offset } of places) {
    const quote = text.charAt(offset);
    const end = offset + 1 + update.specifier.length;
    const next = update.updated ?? '';
    // A quote in a template attribute, as Vue reads it: `:x="import(&quot;./a&quot;)"`.
    if (quote === '&') {
      return {
        update,
        reason: `uses an HTML character reference, such as &quot;, as the quote of "${update.specifier}". Use ' or " as the quote, then run the command again.`,
      };
    }
    if (
      !QUOTES.has(quote) ||
      !text.startsWith(update.specifier, offset + 1) ||
      text.charAt(end) !== quote
    ) {
      return {
        update,
        reason: `does not have "${update.specifier}" at the place that layerscope found. If the file changed, run the command again. If not, layerscope cannot find the exact place of this import() in the template, for example when the same expression has an HTML character reference. Move the import() into a function in <script setup>, then run the command again.`,
      };
    }
    if (UNSAFE.test(next) || next.includes(quote) || (quote === '`' && next.includes('${'))) {
      return {
        update,
        reason: `cannot get the new specifier "${next}": it has a character that layerscope does not write in a string. Update this import by hand.`,
      };
    }
    result = `${result.slice(0, offset + 1)}${next}${result.slice(end)}`;
  }
  return result;
}

/** Updates that are in the file once: the plan can list one import from two moves. */
function unique(updates: ImportUpdate[]): ImportUpdate[] {
  const seen = new Set<string>();
  return updates.filter(update => {
    const key = `${update.file}:${update.line}:${update.column}`;
    const fresh = !seen.has(key);
    seen.add(key);
    return fresh;
  });
}

export function prepareEdits(
  updates: ImportUpdate[],
  cwd: string,
  refusals: string[],
): { edits: Edit[]; byHand: ImportUpdate[]; files: string[] } {
  const byFile = new Map<string, ImportUpdate[]>();
  const byHand: ImportUpdate[] = [];
  for (const update of unique(updates)) {
    if (update.updated === null) {
      byHand.push(update);
    } else {
      byFile.set(update.file, [...(byFile.get(update.file) ?? []), update]);
    }
  }
  const edits: Edit[] = [];
  for (const [file, list] of byFile) {
    let text: string;
    try {
      accessSync(file, constants.W_OK);
      const bytes = readFileSync(file);
      text = bytes.toString('utf8');
      // Other bytes would be written as U+FFFD, also in the lines that the plan does not change.
      if (!Buffer.from(text, 'utf8').equals(bytes)) {
        refusals.push(
          `${relative(cwd, file)} is not UTF-8 text, so layerscope does not edit it. Update its imports by hand.`,
        );
        continue;
      }
    } catch (error) {
      refusals.push(`Cannot read or write ${relative(cwd, file)}: ${message(error)}.`);
      continue;
    }
    const changed = rewrite(text, list);
    if (typeof changed === 'string') {
      edits.push({ file, source: text, text: changed, imports: list.length });
    } else {
      refusals.push(`${relative(cwd, file)}:${changed.update.line} ${changed.reason}`);
    }
  }
  return { edits, byHand, files: [...byFile.keys()] };
}
