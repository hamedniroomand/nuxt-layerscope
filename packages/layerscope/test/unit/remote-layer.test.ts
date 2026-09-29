import { describe, expect, it } from 'vite-plus/test';

import { isClonedFrom, remoteLayerName } from '#src/nuxt/remote-layer.ts';

const clone = '/app/node_modules/.c12/github_nlsctech_console_Nb2cXBT1Y';

describe('remoteLayerName', () => {
  it('drops the hash from layers c12 cloned', () => {
    expect(remoteLayerName(clone)).toBe('github_nlsctech_console');
    expect(remoteLayerName('/home/me/.cache/c12/gh_org_repo_a1B2c3')).toBe('gh_org_repo');
  });

  it('leaves other layers alone', () => {
    expect(remoteLayerName('/app/layers/web')).toBeNull();
    expect(remoteLayerName('/app/node_modules/@acme/ui')).toBeNull();
  });
});

describe('isClonedFrom', () => {
  it('matches the extends source, whatever the ref', () => {
    expect(isClonedFrom(clone, 'github:nlsctech/console')).toBe(true);
    expect(isClonedFrom(clone, 'github:nlsctech/console#v2.1.0')).toBe(true);
  });

  it('does not match another source', () => {
    expect(isClonedFrom(clone, 'github:nlsctech/admin')).toBe(false);
    expect(isClonedFrom('/app/layers/console', 'github:nlsctech/console')).toBe(false);
  });
});
