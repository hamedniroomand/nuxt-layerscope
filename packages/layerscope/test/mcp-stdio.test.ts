import { describe, expect, it } from 'vite-plus/test';

import { redirectStdout } from '#src/mcp/stdio.ts';

function fakes(): {
  out: string[];
  err: string[];
  stdout: { write: (text: string) => boolean };
  stderr: { write: (text: string) => boolean };
  logger: {
    log: (text: string) => void;
    info: (text: string) => void;
    debug: (text: string) => void;
    error: (text: string) => void;
  };
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: {
      write: text => {
        out.push(text);
        return true;
      },
    },
    stderr: {
      write: text => {
        err.push(text);
        return true;
      },
    },
    logger: {
      log: text => {
        out.push(`log:${text}`);
      },
      info: text => {
        out.push(`info:${text}`);
      },
      debug: text => {
        out.push(`debug:${text}`);
      },
      error: text => {
        err.push(`error:${text}`);
      },
    },
  };
}

describe('redirectStdout', () => {
  it('keeps stdout for JSON-RPC and sends every other write and log to stderr', () => {
    const { out, err, stdout, stderr, logger } = fakes();
    const redirect = redirectStdout(stdout, stderr, logger);
    stdout.write('from a config\n');
    logger.log('log');
    logger.info('info');
    logger.debug('debug');
    redirect.rpc('{"jsonrpc":"2.0"}\n');
    expect(out).toEqual(['{"jsonrpc":"2.0"}\n']);
    expect(err).toEqual(['from a config\n', 'error:log', 'error:info', 'error:debug']);
  });

  it('puts stdout and the console back', () => {
    const { out, stdout, stderr, logger } = fakes();
    const redirect = redirectStdout(stdout, stderr, logger);
    redirect.restore();
    stdout.write('a');
    logger.log('b');
    expect(out).toEqual(['a', 'log:b']);
  });
});
