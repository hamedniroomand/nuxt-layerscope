/** JSON-RPC 2.0 over lines: one JSON message on each line, as the MCP stdio transport says. */

export interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export class RpcError extends Error {
  public readonly code: number;

  public constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export const PARSE_ERROR = -32_700;
export const INVALID_REQUEST = -32_600;
export const METHOD_NOT_FOUND = -32_601;
export const INVALID_PARAMS = -32_602;
export const INTERNAL_ERROR = -32_603;

export type Handler = (method: string, params: unknown) => Promise<unknown>;

/** An id is a string, a number or null; a request without one is a notification. */
function hasValidId(id: unknown): boolean {
  return id === undefined || id === null || typeof id === 'string' || typeof id === 'number';
}

function isRequest(value: unknown): value is RpcRequest {
  const message = value as Partial<RpcRequest> | null;
  return (
    typeof message === 'object' &&
    message?.jsonrpc === '2.0' &&
    typeof message.method === 'string' &&
    hasValidId(message.id)
  );
}

function failure(id: RpcRequest['id'], code: number, message: string): object {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** The reply to one message, or `null` for a notification, which gets none. */
async function reply(message: unknown, handle: Handler): Promise<object | null> {
  if (!isRequest(message)) {
    return failure(null, INVALID_REQUEST, 'Not a JSON-RPC 2.0 request');
  }
  const isNotification = message.id === undefined;
  try {
    const result = await handle(message.method, message.params);
    return isNotification ? null : { jsonrpc: '2.0', id: message.id, result };
  } catch (error) {
    if (isNotification) {
      return null;
    }
    return error instanceof RpcError
      ? failure(message.id, error.code, error.message)
      : failure(message.id, INTERNAL_ERROR, error instanceof Error ? error.message : String(error));
  }
}

async function replyToLine(line: string, handle: Handler): Promise<string | null> {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return JSON.stringify(failure(null, PARSE_ERROR, 'Invalid JSON'));
  }
  if (Array.isArray(message)) {
    if (message.length === 0) {
      return JSON.stringify(failure(null, INVALID_REQUEST, 'An empty batch is not a request'));
    }
    const replies = (
      await Promise.all(
        message.map(async item => {
          const answer = await reply(item, handle);
          return answer;
        }),
      )
    ).filter(item => item !== null);
    return replies.length === 0 ? null : JSON.stringify(replies);
  }
  const answer = await reply(message, handle);
  return answer === null ? null : JSON.stringify(answer);
}

/**
 * Reads lines from `chunks` and writes one line for each reply. Messages are handled one after
 * the other, in the order they arrive. Resolves when the input ends.
 */
export async function serveLines(
  chunks: AsyncIterable<string | Buffer>,
  write: (line: string) => void,
  handle: Handler,
): Promise<void> {
  let buffer = '';
  for await (const chunk of chunks) {
    buffer += String(chunk);
    let end = buffer.indexOf('\n');
    while (end !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line !== '') {
        // eslint-disable-next-line no-await-in-loop -- messages are answered in order
        const answer = await replyToLine(line, handle);
        if (answer !== null) {
          write(`${answer}\n`);
        }
      }
      end = buffer.indexOf('\n');
    }
  }
  const rest = buffer.trim();
  if (rest !== '') {
    const answer = await replyToLine(rest, handle);
    if (answer !== null) {
      write(`${answer}\n`);
    }
  }
}
