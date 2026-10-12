// These tests run bash scripts with a stub gh, so they need a Unix shell. CI runs on Ubuntu only.
import { mkdirSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { setup } from './action-helpers.ts';

type Fixture = ReturnType<typeof setup>;

const PR = { GITHUB_BASE_REF: 'main', INPUT_COMMENT: 'true', PR_NUMBER: '7' };
const MARKER = '<!-- layerscope:. -->';
const SHOP_MARKER = '<!-- layerscope:apps%2Fshop -->';

interface Node {
  databaseId: number;
  body: string;
  viewerDidAuthor: boolean;
}

function comments(nodes: Node[], hasNextPage = false): unknown {
  const page = { hasNextPage, endCursor: hasNextPage ? 'c1' : null };
  return { data: { repository: { pullRequest: { comments: { pageInfo: page, nodes } } } } };
}

const own = (databaseId: number, marker: string): Node => ({
  databaseId,
  body: `${marker}\n### layerscope\n\nold`,
  viewerDidAuthor: true,
});

const none = (t: Fixture): Record<string, string> => ({
  ...PR,
  STUB_GRAPHQL: t.answer(comments([])),
});

describe('drift.sh, report without a comment', () => {
  it('writes the report when jq is not installed and comment is false', () => {
    const t = setup(false);
    const result = t.drift({ GITHUB_BASE_REF: 'main', PR_NUMBER: '7' });
    expect(result.status).toBe(0);
    expect(result.summary).toContain('**adds 1**');
    expect(result.gh).toBe('');
    expect(result.output).toBe('comment=skipped\n');
  });

  it('says skipped when the event has no base commit', () => {
    const t = setup(false);
    const result = t.drift({ INPUT_COMMENT: 'true', PR_NUMBER: '7', BASE_SHA: '' });
    expect(result.gh).toBe('');
    expect(result.output).toBe('comment=skipped\n');
  });
});

describe('drift.sh, new comment', () => {
  it('creates a comment with the marker and the plain heading for the root .', () => {
    const t = setup(false);
    const result = t.drift(none(t));
    expect(result.status).toBe(0);
    expect(result.gh).toContain('gh pr comment 7 --body-file');
    expect(result.gh).toContain(`${MARKER}\n### layerscope\n\n**adds 1**`);
    expect(result.summary.startsWith('### layerscope\n\n**adds 1**')).toBe(true);
    expect(result.output).toBe('comment=created\n');
    expect(result.postStatus).toBe(0);
    expect(result.out).not.toContain('Drift failed');
  });

  it('gives gh the host and the repository, which a subfolder root needs', () => {
    const t = setup(false);
    const result = t.drift(none(t));
    expect(result.gh).toContain('[GH_REPO=github.com/owner/repo GH_HOST=github.com]');
  });

  it('uses the host of the server for GitHub Enterprise', () => {
    const t = setup(false);
    const result = t.drift({ ...none(t), GITHUB_SERVER_URL: 'https://ghe.example.com' });
    expect(result.gh).toContain('[GH_REPO=ghe.example.com/owner/repo GH_HOST=ghe.example.com]');
  });

  it('posts from a workspace that is not a repository', () => {
    const t = setup(false);
    const result = t.drift({ ...none(t), INPUT_ROOT: 'clone' }, t.dir);
    expect(result.status).toBe(0);
    expect(result.gh).toContain('gh pr comment 7');
    expect(result.output).toBe('comment=created\n');
  });
});

describe('drift.sh, new comment, gh and its host', () => {
  it('warns, and keeps the status, when gh has no repository to use', () => {
    const t = setup(false);
    const result = t.drift({ ...none(t), INPUT_ROOT: 'clone', GITHUB_SERVER_URL: '' }, t.dir);
    expect(result.status).toBe(0);
    expect(result.gh).not.toContain('gh pr comment');
    expect(result.output).toBe('comment=failed\n');
    expect(result.postStatus).toBe(0);
  });

  it('passes the owner and the name as strings, and pages with the cursor', () => {
    const t = setup(false);
    const result = t.drift({ ...none(t), GITHUB_REPOSITORY: 'owner/123' });
    expect(result.gh).toContain('-f owner=owner -f name=123 -F number=7');
    expect(result.gh).toContain('--paginate');
    expect(result.gh).toContain('after:$endCursor');
  });
});

describe('drift.sh, root in the heading and the marker', () => {
  const root = (t: Fixture, name: string, input = name): ReturnType<Fixture['drift']> => {
    mkdirSync(join(t.clone, name), { recursive: true });
    return t.drift({ ...none(t), INPUT_ROOT: input });
  };

  it('names a root that is not . in backticks', () => {
    const t = setup(false);
    const result = root(t, 'apps/shop');
    expect(result.gh).toContain(`${SHOP_MARKER}\n### layerscope: \`apps/shop\`\n\n`);
    expect(result.summary.startsWith('### layerscope: `apps/shop`\n')).toBe(true);
  });

  it('drops a leading ./ and a trailing /', () => {
    const t = setup(false);
    const result = root(t, 'apps/shop', './apps/shop/');
    expect(result.gh).toContain(`${SHOP_MARKER}\n### layerscope: \`apps/shop\`\n`);
  });

  it('drops every leading ./ and every trailing /', () => {
    const t = setup(false);
    const result = root(t, 'apps/shop', '././apps/shop//');
    expect(result.gh).toContain(`${SHOP_MARKER}\n### layerscope: \`apps/shop\`\n`);
  });

  it('encodes the root in the marker so it cannot end the comment', () => {
    const t = setup(false);
    const result = root(t, 'a-->b');
    expect(result.gh).toContain('<!-- layerscope:a--%3Eb -->\n');
  });

  it('uses a longer fence for a root with a backtick', () => {
    const t = setup(false);
    const result = root(t, 'a`b');
    expect(result.gh).toContain('### layerscope: `` a`b ``\n');
  });
});

describe('drift.sh, roots that strip to nothing', () => {
  it.each(['./', './/', '././', './//'])(
    'reads %s as the root . and never as an empty root',
    input => {
      const t = setup(false);
      const result = t.drift({ ...none(t), INPUT_ROOT: input });
      expect(result.gh).toContain(`${MARKER}\n### layerscope\n`);
      expect(result.gh).not.toContain('layerscope:\n');
    },
  );
});

describe('drift.sh, edit of a comment', () => {
  it('edits the last comment that the same account wrote with the marker', () => {
    const t = setup(false);
    const graphql = t.answer(comments([own(5, MARKER), own(9, MARKER)]));
    const result = t.drift({ ...PR, STUB_GRAPHQL: graphql });
    expect(result.gh).toContain('gh api --method PATCH repos/owner/repo/issues/comments/9');
    expect(result.gh).not.toContain('gh pr comment');
    expect(result.gh).toContain(`${MARKER}\n### layerscope\n\n**adds 1**`);
    expect(result.output).toBe('comment=updated\n');
    expect(result.postStatus).toBe(0);
    expect(result.out).not.toContain('Drift failed');
  });

  it('finds the comment on a later page', () => {
    const t = setup(false);
    const graphql = t.answer(comments([own(5, MARKER)], true), comments([own(8, MARKER)]));
    const result = t.drift({ ...PR, STUB_GRAPHQL: graphql });
    expect(result.gh).toContain('issues/comments/8');
  });

  it('does not edit the comment of another root', () => {
    const t = setup(false);
    const result = t.drift({ ...PR, STUB_GRAPHQL: t.answer(comments([own(5, SHOP_MARKER)])) });
    expect(result.gh).not.toContain('PATCH');
    expect(result.gh).toContain('gh pr comment 7');
    expect(result.out).not.toContain('::notice');
  });
});

describe('drift.sh, edit of a comment, other accounts and failures', () => {
  it('does not edit a comment with the marker that another account wrote', () => {
    const t = setup(false);
    const foreign: Node = { ...own(5, MARKER), viewerDidAuthor: false };
    const result = t.drift({ ...PR, STUB_GRAPHQL: t.answer(comments([foreign])) });
    expect(result.gh).not.toContain('PATCH');
    expect(result.gh).toContain('gh pr comment 7');
    expect(result.out).toContain(
      '::notice title=layerscope drift::A comment with the layerscope marker exists, but another account wrote it. The action posts a new comment.',
    );
  });

  it('posts a new comment with a warning when the edit fails', () => {
    const t = setup(false);
    const graphql = t.answer(comments([own(5, MARKER)]));
    const result = t.drift({ ...PR, STUB_GRAPHQL: graphql, STUB_PATCH_STATUS: '1' });
    expect(result.status).toBe(0);
    expect(result.out).toContain(
      '::warning title=layerscope drift::Could not update the comment. The action posts a new comment.',
    );
    expect(result.gh).toContain('gh pr comment 7');
    expect(result.output).toBe('comment=created\n');
  });
});

describe('drift.sh, a failed call of gh', () => {
  const WARNING =
    '::warning title=layerscope drift::Could not post the pull request comment. See the error above.\n';

  it('warns, and keeps the status, when the query fails', () => {
    const t = setup(false);
    const result = t.drift({ ...none(t), STUB_GRAPHQL_FAILS: '1' });
    expect(result.status).toBe(0);
    expect(result.out).toBe(WARNING);
    expect(result.err).toContain('HTTP 502');
    expect(result.gh).not.toContain('gh pr comment');
    expect(result.summary).toContain('**adds 1**');
    expect(result.output).toBe('comment=failed\n');
    expect(result.postStatus).toBe(0);
  });

  it('warns, and keeps the status, when the new comment is refused', () => {
    const t = setup(false);
    const result = t.drift({ ...none(t), STUB_CREATE_STATUS: '1' });
    expect(result.status).toBe(0);
    expect(result.out).toBe(WARNING);
    expect(result.output).toBe('comment=failed\n');
    expect(result.postStatus).toBe(0);
  });

  it('keeps the status of drift when drift and gh both fail', () => {
    const t = setup(false);
    const result = t.drift({ ...none(t), STUB_LS_STATUS: '2', STUB_GRAPHQL_FAILS: '1' });
    expect(result.status).toBe(2);
    expect(result.out).toBe(WARNING);
    expect(result.output).toBe('comment=failed\n');
    expect(result.postStatus).toBe(0);
  });
});

describe('drift.sh, failure and forks', () => {
  it('changes the comment when drift fails, and keeps the exit status', () => {
    const t = setup(false);
    const graphql = t.answer(comments([own(5, MARKER)]));
    const result = t.drift({ ...PR, STUB_GRAPHQL: graphql, STUB_LS_STATUS: '2' });
    expect(result.status).toBe(2);
    expect(result.gh).toContain('issues/comments/5');
    expect(result.gh).toContain(
      `${MARKER}\n### layerscope\n\nThe drift report failed. See the log of this job: https://github.com/owner/repo/actions/runs/99.\n`,
    );
    expect(result.out).toContain(
      '::warning title=layerscope drift::Drift failed. The pull request comment now says so.',
    );
    expect(result.summary).toBe('');
    expect(result.output).toBe('comment=updated\n');
  });

  it('does not call gh when drift fails and comment is false', () => {
    const t = setup(false);
    const result = t.drift({ GITHUB_BASE_REF: 'main', PR_NUMBER: '7', STUB_LS_STATUS: '2' });
    expect(result.status).toBe(2);
    expect(result.gh).toBe('');
  });

  it('skips the comment on a pull_request event from a fork, and keeps the summary', () => {
    const t = setup(false);
    const result = t.drift({ ...PR, IS_FORK: 'true' });
    expect(result.status).toBe(0);
    expect(result.gh).toBe('');
    expect(result.out).toBe(
      '::notice title=layerscope drift::Comment skipped. The token of a pull_request event from a fork is read-only. The report is in the job summary.\n',
    );
    expect(result.summary).toContain('**adds 1**');
    expect(result.output).toBe('comment=skipped\n');
  });

  it('says only that the token is read-only when drift fails on a fork', () => {
    const t = setup(false);
    const result = t.drift({ ...PR, IS_FORK: 'true', STUB_LS_STATUS: '2' });
    expect(result.status).toBe(2);
    expect(result.out).toBe(
      '::notice title=layerscope drift::Comment skipped. The token of a pull_request event from a fork is read-only.\n',
    );
  });
});
