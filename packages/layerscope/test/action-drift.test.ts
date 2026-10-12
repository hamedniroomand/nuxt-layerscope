// These tests run bash scripts with a stub gh, so they need a Unix shell. CI runs on Ubuntu only.
import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { git } from '#test/git-project.ts';

import { ZEROS, advanceMain, count, has, isShallow, setup } from './action-helpers.ts';

describe('drift.sh, pull request', () => {
  it('compares with the tip of the base branch and keeps a full clone full', () => {
    const t = setup(false);
    const before = count(t.clone);
    const result = t.drift({ GITHUB_BASE_REF: 'main' });
    expect(result.status).toBe(0);
    expect(result.summary).toContain('--base origin/main');
    expect(git(t.clone, 'rev-parse', 'origin/main').trim()).toBe(t.main);
    expect(isShallow(t.clone)).toBe('false');
    expect(count(t.clone)).toBe(before);
  });

  it('keeps a full clone full when the tip of the base branch is new', () => {
    const t = setup(false);
    const later = advanceMain(t);
    const before = count(t.clone);
    expect(has(t.clone, later)).toBe(false);
    expect(t.drift({ GITHUB_BASE_REF: 'main' }).status).toBe(0);
    expect(isShallow(t.clone)).toBe('false');
    expect(count(t.clone)).toBe(before);
    expect(git(t.clone, 'rev-parse', 'origin/main').trim()).toBe(later);
  });
});

describe('drift.sh, pull request, decoy ref', () => {
  it('ignores a ref whose name ends with the base ref name', () => {
    const t = setup(false);
    const lines = git(t.clone, 'ls-remote', 'origin', 'refs/heads/main').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(t.drift({ GITHUB_BASE_REF: 'main' }).status).toBe(0);
    expect(git(t.clone, 'rev-parse', 'origin/main').trim()).toBe(t.main);
  });
});

describe('drift.sh, pull request in a shallow clone', () => {
  it('fetches the tip by SHA in a depth 1 clone', () => {
    const t = setup(true);
    expect(has(t.clone, t.main)).toBe(false);
    const result = t.drift({ GITHUB_BASE_REF: 'main' });
    expect(result.status).toBe(0);
    expect(isShallow(t.clone)).toBe('true');
    // drift reads the baseline at the base commit, so it needs no merge base.
    expect(git(t.clone, 'show', 'origin/main:a.txt')).toBe('2');
  });

  it('keeps the history of a depth 5 clone, where the tip of the base branch is in the middle', () => {
    const t = setup(5);
    const before = count(t.clone);
    expect(has(t.clone, t.main)).toBe(true);
    expect(t.drift({ GITHUB_BASE_REF: 'main' }).status).toBe(0);
    expect(count(t.clone)).toBe(before);
    expect(git(t.clone, 'rev-parse', 'origin/main').trim()).toBe(t.main);
  });
});

describe('drift.sh, pull request, base not available', () => {
  it('skips with a notice when it cannot fetch the tip', () => {
    const t = setup(true);
    const result = t.drift({ GITHUB_BASE_REF: 'main', STUB_FETCH_FAILS: '1' });
    expect(result.status).toBe(0);
    expect(result.out).toBe(
      `::notice title=layerscope drift::Drift report skipped. Cannot fetch the base commit ${t.main.slice(0, 7)}. See the git error above.\n`,
    );
    expect(result.err).toContain('stub fetch error');
    expect(result.summary).toBe('');
  });

  it('skips with a notice when the base branch is not on origin', () => {
    const t = setup(false);
    const result = t.drift({ GITHUB_BASE_REF: 'gone' });
    expect(result.status).toBe(0);
    expect(result.out).toBe(
      '::notice title=layerscope drift::Drift report skipped. Cannot find the base branch "gone" on origin.\n',
    );
    expect(result.summary).toBe('');
  });

  it('shows the git error, and skips with a different notice, when ls-remote fails', () => {
    const t = setup(false);
    const result = t.drift({ GITHUB_BASE_REF: 'main', STUB_LS_REMOTE_FAILS: '1' });
    expect(result.status).toBe(0);
    expect(result.err).toContain('stub ls-remote error');
    expect(result.out).toBe(
      '::notice title=layerscope drift::Drift report skipped. Cannot read the branches of origin. See the git error above.\n',
    );
  });
});

describe('drift.sh, push and merge group', () => {
  it('uses BASE_SHA, which is the commit before a push or the base of a merge group', () => {
    const t = setup(false);
    const result = t.drift({ BASE_SHA: t.main });
    expect(result.status).toBe(0);
    expect(result.summary).toContain(`--base ${t.main}`);
    expect(isShallow(t.clone)).toBe('false');
  });

  it('keeps a full clone full when it must fetch the commit', () => {
    const t = setup(false);
    const later = advanceMain(t);
    const before = count(t.clone);
    expect(has(t.clone, later)).toBe(false);
    expect(t.drift({ BASE_SHA: later }).status).toBe(0);
    expect(has(t.clone, later)).toBe(true);
    expect(isShallow(t.clone)).toBe('false');
    expect(count(t.clone)).toBe(before);
  });

  it('does not fetch a commit that the clone has, so it keeps the history of a depth 5 clone', () => {
    const t = setup(5);
    const before = count(t.clone);
    expect(has(t.clone, t.mid)).toBe(true);
    expect(t.drift({ BASE_SHA: t.mid }).status).toBe(0);
    expect(count(t.clone)).toBe(before);
  });

  it('fetches a missing commit by SHA in a depth 1 clone', () => {
    const t = setup(true);
    expect(has(t.clone, t.first)).toBe(false);
    const result = t.drift({ BASE_SHA: t.first });
    expect(result.status).toBe(0);
    expect(isShallow(t.clone)).toBe('true');
    expect(has(t.clone, t.first)).toBe(true);
  });

  it('keeps the history of a depth 2 clone that does not have the commit', () => {
    const t = setup(2);
    const before = count(t.clone);
    expect(has(t.clone, t.first)).toBe(false);
    expect(t.drift({ BASE_SHA: t.first }).status).toBe(0);
    expect(count(t.clone)).toBe(before);
    expect(has(t.clone, t.first)).toBe(true);
  });
});

describe('drift.sh, events without a usable base', () => {
  it('skips with a notice, and shows the git error, when the commit cannot be fetched', () => {
    const t = setup(true);
    const result = t.drift({ BASE_SHA: 'a'.repeat(40) });
    expect(result.status).toBe(0);
    expect(result.out).toBe(
      '::notice title=layerscope drift::Drift report skipped. Cannot fetch the base commit aaaaaaa. See the git error above.\n',
    );
    expect(result.err).not.toBe('');
    expect(result.summary).toBe('');
  });

  it.each([
    ['empty', ''],
    ['all zeros', ZEROS],
  ])('skips with a notice when the event has no base commit (%s)', (_name, sha) => {
    const t = setup(false);
    const result = t.drift({ BASE_SHA: sha });
    expect(result.status).toBe(0);
    expect(result.out).toBe(
      '::notice title=layerscope drift::Drift report skipped. This event has no base commit.\n',
    );
    expect(result.summary).toBe('');
  });
});

describe('drift.sh, root and notices', () => {
  it('runs git in the root, which can be a subdirectory of the workspace', () => {
    const t = setup(true);
    const result = t.drift({ INPUT_ROOT: 'clone', BASE_SHA: t.first }, t.dir);
    expect(result.status).toBe(0);
    expect(result.out).toBe('');
    expect(has(t.clone, t.first)).toBe(true);
    expect(result.summary).toContain(`--base ${t.first}`);
  });

  it('shows the git error, and skips with a notice, when the root is not in a git repository', () => {
    const t = setup(false);
    const result = t.drift({ INPUT_ROOT: 'nowhere', BASE_SHA: t.main }, t.dir);
    expect(result.status).toBe(0);
    expect(result.out).toBe(
      '::notice title=layerscope drift::Drift report skipped. Cannot run git in "nowhere". See the git error above.\n',
    );
    expect(result.err).not.toBe('');
    expect(result.summary).toBe('');
  });

  it('shows the git error, and skips with the same notice, when git cannot read the repository', () => {
    const t = setup(false);
    // A broken HEAD makes git fail on every machine, with no dependence on the git configuration.
    writeFileSync(join(t.clone, '.git/HEAD'), 'not a ref\n');
    const result = t.drift({ BASE_SHA: t.main });
    expect(result.status).toBe(0);
    expect(result.err).not.toBe('');
    expect(result.out).toBe(
      '::notice title=layerscope drift::Drift report skipped. Cannot run git in ".". See the git error above.\n',
    );
    expect(result.summary).toBe('');
  });

  it('escapes %, CR and LF in a notice', () => {
    const t = setup(false);
    const result = t.drift({ INPUT_ROOT: `${t.dir}/100%\r\nroot`, BASE_SHA: t.main });
    expect(result.status).toBe(0);
    expect(result.out).toBe(
      `::notice title=layerscope drift::Drift report skipped. Cannot run git in "${t.dir}/100%25%0D%0Aroot". See the git error above.\n`,
    );
  });
});
