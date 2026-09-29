import { styleText } from 'node:util';

/** Wraps text in terminal styles, e.g. `paint('red', 'error')`. */
export type Paint = (format: Parameters<typeof styleText>[0], text: string) => string;

/** No styles: what the report functions use unless the CLI passes a painter for its terminal. */
export const plain: Paint = (_format, text) => text;

/** Styles only when `stream` is a terminal; `NO_COLOR` and `FORCE_COLOR` are honoured. */
export function paintFor(stream: NodeJS.WriteStream): Paint {
  return (format, text) => styleText(format, text, { stream });
}
