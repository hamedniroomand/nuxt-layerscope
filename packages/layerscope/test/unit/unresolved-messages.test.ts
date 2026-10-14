import { describe, expect, it } from 'vite-plus/test';

import { unresolvedName } from '#src/analyze/unresolved-messages.ts';

describe('unresolvedName', () => {
  it('names two contexts when the name is an auto-import in both', () => {
    const target = { file: '/app/x.ts', module: null };
    const table = {
      imports: {
        app: new Map([['x', target]]),
        server: new Map(),
        shared: new Map([['x', target]]),
      },
      components: new Map(),
    };
    expect(unresolvedName('x', 'server', table)).toBe(
      '"x" is an auto-import only in the app and shared contexts, not in the server context',
    );
  });

  it('names the context before it says that the name is a component', () => {
    const target = { file: '/app/x.ts', module: null };
    const table = {
      imports: { app: new Map([['Card', target]]), server: new Map(), shared: new Map() },
      components: new Map([['Card', [target]]]),
    };
    expect(unresolvedName('Card', 'server', table)).toBe(
      '"Card" is an auto-import only in the app context, not in the server context',
    );
  });
});
