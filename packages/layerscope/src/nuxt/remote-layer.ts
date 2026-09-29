import { basename, dirname } from 'pathe';

/** c12 clones remote layers into `node_modules/.c12`, or into `~/.cache/c12` without one. */
const CLONE_DIRS = new Set(['.c12', 'c12']);

/**
 * c12 names a clone after the first three word segments of its `extends` source plus a hash of
 * the whole source (`github:org/repo#v1` → `github_org_repo_<hash>`). The hash changes with the
 * ref, so names and config matching use the prefix only.
 */
function clonePrefix(source: string): string {
  return source.replaceAll(/\W+/gu, '_').split('_').slice(0, 3).join('_');
}

/** The clone name without its hash, so it survives ref changes; `null` for other layers. */
export function remoteLayerName(root: string): string | null {
  if (!CLONE_DIRS.has(basename(dirname(root)))) {
    return null;
  }
  const name = basename(root);
  const hashStart = name.lastIndexOf('_');
  return hashStart === -1 ? name : name.slice(0, hashStart);
}

/** Whether the layer at `root` was cloned from this `extends` source. */
export function isClonedFrom(root: string, source: string): boolean {
  return remoteLayerName(root) === clonePrefix(source);
}
