#!/usr/bin/env bash
# Posts the report that drift.sh built as the comment of the pull request. Only gh and node run in
# this script: it has the token, and the CLI never runs here. REPORT_DIR is the folder of drift.sh.
# The comment of a root has a marker on its first line. The run edits only a comment that has this
# marker and that the same account wrote.
set -euo pipefail

# The output `comment` says what the run did with the comment: created, updated, skipped or failed.
comment_result=skipped
write_output() { echo "comment=$comment_result" >> "${GITHUB_OUTPUT:-/dev/null}"; }
# A failed append must not change the exit status of the step.
trap 'write_output || true' EXIT

dir="${REPORT_DIR:-}"
state=skipped
if [ -n "$dir" ] && [ -f "$dir/state" ]; then state="$(cat "$dir/state")"; fi
if [ "${INPUT_COMMENT:-}" != "true" ] || [ -z "${PR_NUMBER:-}" ] || [ "$state" = skipped ]; then
  exit 0
fi

# A pull_request event from a fork has a read-only token. pull_request_target has a write token.
if [ "${IS_FORK:-false}" = "true" ]; then
  suffix=''
  if [ "$state" = report ]; then suffix=' The report is in the job summary.'; fi
  echo "::notice title=layerscope drift::Comment skipped. The token of a pull_request event from a fork is read-only.$suffix"
  exit 0
fi

label="$(cat "$dir/label")"

# The marker is the first line of the comment of this root. It is built only when the run posts a
# comment, so a missing node cannot stop the report.
marker() {
  local encoded
  encoded="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$label")" || return 1
  printf '<!-- layerscope:%s -->' "$encoded"
}

# Finds the comment of this root that the same account wrote, and updates it. Else it posts a new
# comment. The text is in the file $1. Returns 1 when a call of gh fails.
publish() {
  local text="$1" mark found own_id foreign body
  mark="$(marker)" || return 1
  body="$(mktemp)"
  { printf '%s\n' "$mark"; cat "$text"; } > "$body"
  # gh pages the query itself (--paginate sets $endCursor) and runs --jq on each page.
  # shellcheck disable=SC2016
  found="$(gh api graphql --paginate \
    -f owner="${GITHUB_REPOSITORY%%/*}" -f name="${GITHUB_REPOSITORY#*/}" -F number="$PR_NUMBER" \
    -f query='query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){comments(first:100,after:$endCursor){pageInfo{hasNextPage endCursor}nodes{databaseId body viewerDidAuthor}}}}}' \
    --jq ".data.repository.pullRequest.comments.nodes[] | select(.body | startswith(\"$mark\")) | \"\\(.viewerDidAuthor)\\t\\(.databaseId)\"")" || return 1
  # viewerDidAuthor is about the account. With GITHUB_TOKEN, that is github-actions[bot].
  own_id="$(awk -F'\t' '$1 == "true" { id = $2 } END { print id }' <<< "$found")"
  foreign="$(awk -F'\t' '$1 == "false" { n++ } END { print n + 0 }' <<< "$found")"
  if [ -n "$own_id" ]; then
    if gh api --method PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$own_id" -F "body=@$body" > /dev/null; then
      comment_result=updated
      return 0
    fi
    echo '::warning title=layerscope drift::Could not update the comment. The action posts a new comment.'
  elif [ "$foreign" != "0" ]; then
    echo '::notice title=layerscope drift::A comment with the layerscope marker exists, but another account wrote it. The action posts a new comment.'
  fi
  gh pr comment "$PR_NUMBER" --body-file "$body" > /dev/null || return 1
  comment_result=created
}

# A failed call must not fail the step: the job summary has the report.
try_publish() {
  # gh needs the repository and the host: the root can be a subfolder, and the server can be GitHub
  # Enterprise. On GitHub Enterprise Server, gh reads GH_ENTERPRISE_TOKEN, which action.yml sets.
  if [ -n "${GITHUB_SERVER_URL:-}" ]; then
    export GH_HOST="${GITHUB_SERVER_URL#*://}"
    export GH_REPO="$GH_HOST/$GITHUB_REPOSITORY"
  fi
  if ! publish "$1"; then
    comment_result=failed
    echo '::warning title=layerscope drift::Could not post the pull request comment. See the error above.'
  fi
}

try_publish "$dir/text.md"
# An old comment must not keep the numbers of an older run.
if [ "$state" = failed ] && [ "$comment_result" != failed ]; then
  echo '::warning title=layerscope drift::Drift failed. The pull request comment now says so.'
fi
