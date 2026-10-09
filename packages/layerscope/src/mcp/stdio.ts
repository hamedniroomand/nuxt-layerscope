export interface StdoutRedirect {
  /** Writes to the real stdout: the only writer of JSON-RPC. */
  rpc: (text: string) => void;
  /** Puts stdout and the console back. */
  restore: () => void;
}

interface Writable {
  write: (...args: never[]) => unknown;
}

interface ConsoleLike {
  log: (...args: never[]) => void;
  info: (...args: never[]) => void;
  debug: (...args: never[]) => void;
  error: (...args: never[]) => void;
}

/**
 * While the server runs, stdout belongs to JSON-RPC. A user config that logs, or a Nuxt, c12 or
 * giget line (consola writes info to stdout), would break the stream, so everything else that is
 * written to stdout from this process goes to stderr instead.
 */
export function redirectStdout(
  stdout: Writable,
  stderr: Writable,
  logger: ConsoleLike = console,
): StdoutRedirect {
  const realWrite = stdout.write.bind(stdout) as (text: string) => unknown;
  const original = { write: stdout.write, log: logger.log, info: logger.info, debug: logger.debug };
  stdout.write = ((...args: never[]) => stderr.write(...args)) as Writable['write'];
  logger.log = logger.error;
  logger.info = logger.error;
  logger.debug = logger.error;
  return {
    rpc: text => {
      realWrite(text);
    },
    restore: () => {
      stdout.write = original.write;
      logger.log = original.log;
      logger.info = original.info;
      logger.debug = original.debug;
    },
  };
}
