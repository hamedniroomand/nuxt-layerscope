# Sourced by drift.sh and check.sh. Functions that name the root of the action in a heading.

# The root as the reader sees it: no leading ./ and no trailing /. A root of only slashes is `.`.
root_label() {
  local label="$INPUT_ROOT"
  while [[ "$label" == ./* ]]; do label="${label#./}"; done
  while [[ "$label" == */ ]]; do label="${label%/}"; done
  if [ -z "$label" ]; then label=.; fi
  printf '%s' "$label"
}

# The heading of a section: `### <title>`, and the root in a code span unless it is `.`. The code
# span has more backticks than any run in the root, so the root cannot end it.
root_heading() {
  local title="$1" label fence
  label="$(root_label)"
  if [ "$label" = . ]; then
    printf '### %s' "$title"
    return
  fi
  fence='`'
  while [[ "$label" == *"$fence"* ]]; do fence+='`'; done
  if [ "${#fence}" -gt 1 ]; then
    printf '### %s: %s %s %s' "$title" "$fence" "$label" "$fence"
  else
    printf '### %s: %s%s%s' "$title" "$fence" "$label" "$fence"
  fi
}
