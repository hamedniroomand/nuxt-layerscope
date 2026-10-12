#!/usr/bin/env bash
# Writes the drift report to the job summary, and to the pull request when INPUT_COMMENT is true.
# The comment of a root has a marker on its first line. The run edits only a comment that has this
# marker and that the same account wrote.
# A pull request compares with the tip of its base branch (GITHUB_BASE_REF). A push or a merge group
# compares with BASE_SHA, the commit before the push or the base of the merge group. BASE_SHA is
# empty for an event without a base.
set -euo pipefail

# The output `comment` says what the run did with the comment: created, updated, skipped or failed.
comment_result=skipped
write_output() { echo "comment=$comment_result" >> "${GITHUB_OUTPUT:-/dev/null}"; }
# A failed append must not change the exit status of the step.
trap 'write_output || true' EXIT

# Prints a notice. The message is escaped as the workflow commands of GitHub need.
skip() {
  local message="$1"
  message="${message//%/%25}"
  message="${message//$'\r'/%0D}"
  message="${message//$'\n'/%0A}"
  echo "::notice title=layerscope drift::$message"
  exit 0
}

# The CLI runs git in the root, so the script does the same. The root can be a subdirectory of the
# workspace, for example with actions/checkout and `path`.
git() { command git -C "$INPUT_ROOT" "$@"; }
# Only stdout is hidden: a git error, for example "dubious ownership", must show in the log.
if ! git rev-parse --git-dir > /dev/null; then
  skip "Drift report skipped. Cannot run git in \"$INPUT_ROOT\". See the git error above."
fi

# A full clone must stay full, and a shallow clone must not get shallower: only a shallow clone
# fetches with --depth, and only when it does not have the base commit.
depth=()
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then depth=(--depth=1); fi

# Makes sure the clone has the commit $1. Skips the report when it cannot fetch the commit.
need_commit() {
  if ! git cat-file -e "$1^{commit}" 2> /dev/null; then
    # The git error stays visible, so an authentication or network problem shows in the log.
    if ! git fetch --no-tags ${depth[@]+"${depth[@]}"} origin "$1"; then
      skip "Drift report skipped. Cannot fetch the base commit ${1:0:7}. See the git error above."
    fi
  fi
}

if [ -n "${GITHUB_BASE_REF:-}" ]; then
  # The current tip of the base branch. ls-remote also matches the end of other ref names, such as
  # refs/heads/decoy/refs/heads/main, so keep only the exact ref.
  ref="refs/heads/$GITHUB_BASE_REF"
  # A failed ls-remote (network, authentication) is not a missing branch. The git error stays visible.
  if ! lines="$(git ls-remote origin "$ref")"; then
    skip 'Drift report skipped. Cannot read the branches of origin. See the git error above.'
  fi
  tip="$(awk -v ref="$ref" '$2 == ref { print $1 }' <<< "$lines")"
  if [ -z "$tip" ]; then
    skip "Drift report skipped. Cannot find the base branch \"$GITHUB_BASE_REF\" on origin."
  fi
  need_commit "$tip"
  git update-ref "refs/remotes/origin/$GITHUB_BASE_REF" "$tip"
  base="origin/$GITHUB_BASE_REF"
else
  base="${BASE_SHA:-}"
  case "$base" in
    '' | 0000000000000000000000000000000000000000) skip 'Drift report skipped. This event has no base commit.' ;;
  esac
  need_commit "$base"
fi

args=(drift "$INPUT_ROOT" --format markdown --base "$base" --baseline "$INPUT_BASELINE")
if [ -n "$INPUT_CONFIG" ]; then args+=(--config "$INPUT_CONFIG"); fi
if [ "$INPUT_PREPARE" = "true" ]; then args+=(--prepare); fi

# The root as the reader sees it: no leading ./ and no trailing /.
label="$INPUT_ROOT"
while [[ "$label" == ./* ]]; do label="${label#./}"; done
label="${label%/}"
if [ -z "$label" ]; then label=.; fi

if [ "$label" = . ]; then
  heading='### layerscope'
else
  # A code span with more backticks than any run in the root, so the root cannot end it.
  fence='`'
  while [[ "$label" == *"$fence"* ]]; do fence+='`'; done
  if [ "${#fence}" -gt 1 ]; then
    heading="### layerscope: $fence $label $fence"
  else
    heading="### layerscope: $fence$label$fence"
  fi
fi

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
  # Enterprise. On GitHub Enterprise Server, gh also needs GH_ENTERPRISE_TOKEN. The action does not
  # set it, so the comment fails with a warning there.
  if [ -n "${GITHUB_SERVER_URL:-}" ]; then
    export GH_HOST="${GITHUB_SERVER_URL#*://}"
    export GH_REPO="$GH_HOST/$GITHUB_REPOSITORY"
  fi
  if ! publish "$1"; then
    comment_result=failed
    echo '::warning title=layerscope drift::Could not post the pull request comment. See the error above.'
  fi
}

wants_comment() { [ "$INPUT_COMMENT" = "true" ] && [ -n "${PR_NUMBER:-}" ]; }

# A pull_request event from a fork has a read-only token. pull_request_target has a write token.
fork_notice() {
  echo "::notice title=layerscope drift::Comment skipped. The token of a pull_request event from a fork is read-only.$1"
}

report="$(mktemp)"
text="$(mktemp)"
status=0
"$(dirname "$0")/layerscope.sh" "${args[@]}" > "$report" || status=$?

if [ "$status" -ne 0 ]; then
  # An old comment must not keep the numbers of an older run.
  if wants_comment; then
    if [ "${IS_FORK:-false}" = "true" ]; then
      fork_notice ''
    else
      printf '%s\n\nThe drift report failed. See the log of this job: %s/%s/actions/runs/%s.\n' \
        "$heading" "${GITHUB_SERVER_URL:-https://github.com}" "$GITHUB_REPOSITORY" "${GITHUB_RUN_ID:-}" > "$text"
      try_publish "$text"
      if [ "$comment_result" != failed ]; then
        echo '::warning title=layerscope drift::Drift failed. The pull request comment now says so.'
      fi
    fi
  fi
  exit "$status"
fi

# The report starts with the line "### layerscope". Put the root in it.
{
  printf '%s\n' "$heading"
  tail -n +2 "$report"
} > "$text"
cat "$text" >> "$GITHUB_STEP_SUMMARY"
if wants_comment; then
  if [ "${IS_FORK:-false}" = "true" ]; then
    fork_notice ' The report is in the job summary.'
  else
    try_publish "$text"
  fi
fi
