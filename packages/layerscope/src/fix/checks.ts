import { lstatSync, readdirSync } from 'node:fs';

import { basename, dirname, join, normalize, relative } from 'pathe';

import { realPath } from '#src/utils/fs.ts';

import { isInside } from './git-state.ts';
import { existingDir, exists, isSymlink } from './paths.ts';
import type { PlannedMove } from './types.ts';

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

export function moveRefusals(moves: PlannedMove[], cwd: string): string[] {
  const refusals: string[] = [];
  const targets = new Set<string>();
  for (const move of moves) {
    if (!isRegularFile(move.from)) {
      refusals.push(`${relative(cwd, move.from)} is not a file now. Run the command again.`);
    }
    if (exists(move.to)) {
      refusals.push(
        `${relative(cwd, move.to)} exists, so ${relative(cwd, move.from)} cannot move there.`,
      );
    } else if (targets.has(move.to)) {
      refusals.push(`Two moves have the same target: ${relative(cwd, move.to)}.`);
    }
    targets.add(move.to);
  }
  return refusals;
}

/** The names in a dir. A test can give its own, so that it does not need a file system. */
export type Listing = (dir: string) => string[];

/** The name in the dir of the target that has the same letters in another case, if any. */
function sameInOtherCase(move: PlannedMove, list: Listing): string | undefined {
  try {
    const name = basename(move.to).toLowerCase();
    return list(dirname(move.to)).find(
      entry =>
        entry.toLowerCase() === name &&
        entry !== basename(move.to) &&
        join(dirname(move.to), entry) !== move.from,
    );
  } catch {
    return undefined;
  }
}

/** A case-insensitive file system treats two paths that differ only in case as one file. */
export function caseRefusals(
  moves: PlannedMove[],
  cwd: string,
  list: Listing = readdirSync,
): string[] {
  const refusals: string[] = [];
  const seen = new Map<string, string>();
  for (const move of moves) {
    const key = move.to.toLowerCase();
    const other = seen.get(key);
    if (other !== undefined && other !== move.to) {
      refusals.push(
        `${relative(cwd, move.to)} and ${relative(cwd, other)} differ only in letter case. A case-insensitive file system treats them as one file, so layerscope will not move both.`,
      );
    }
    seen.set(key, move.to);
    const entry = sameInOtherCase(move, list);
    if (entry !== undefined) {
      refusals.push(
        `${relative(cwd, move.to)} differs only in letter case from ${relative(cwd, join(dirname(move.to), entry))}. A case-insensitive file system treats them as one file, so layerscope will not move there.`,
      );
    }
  }
  return refusals;
}

interface Probe {
  path: string;
  /** The dir or file that the path names, as written. */
  written: string;
  /** Where it is, with each link followed. */
  real: string;
  /** The file itself is a symbolic link. */
  link: boolean;
  /** A symbolic link is in the path: one that points nowhere is too. */
  linkInPath: boolean;
  /** Another name in the file system is the same file: a change shows there too. */
  hardLinked: boolean;
}

function hardLinks(path: string): boolean {
  try {
    return lstatSync(path).nlink > 1;
  } catch {
    return false;
  }
}

function probeFile(path: string): Probe {
  const real = normalize(realPath(path));
  const link = isSymlink(path);
  return {
    path,
    written: normalize(path),
    real,
    link,
    linkInPath: link || real !== normalize(path),
    hardLinked: !link && hardLinks(path),
  };
}

function probeTarget(path: string): Probe {
  const dir = existingDir(path);
  const real = normalize(realPath(dir));
  return {
    path,
    written: normalize(dir),
    real,
    link: false,
    linkInPath: isSymlink(dir) || real !== normalize(dir),
    hardLinked: false,
  };
}

/**
 * A link in a path makes a change go to another place than the path says. A symbolic link sends a
 * file edit to the file that it points at, and a move to the dir that it points at. A hard link
 * is the same file under another name. Each file to change and each target dir must be what its
 * path says, and inside the repository when there is one. This holds with `--allow-dirty` too.
 */
export function pathRefusals(
  files: Set<string>,
  targets: string[],
  top: string | null,
  cwd: string,
): string[] {
  const probes = [
    ...[...files].map(file => probeFile(file)),
    ...targets.map(target => probeTarget(target)),
  ];
  return probes.flatMap(({ path, real, link, linkInPath, hardLinked }) => {
    const name = relative(cwd, path);
    if (link) {
      return [`${name} is a symbolic link, so layerscope does not change it.`];
    }
    if (linkInPath) {
      return [`${name} has a symbolic link in its path, so layerscope does not change it.`];
    }
    if (hardLinked) {
      return [
        `${name} has more than one hard link, so a change to it can change another file too. Update its imports by hand.`,
      ];
    }
    return top !== null && !isInside(real, top)
      ? [`${name} is outside the git repository, so layerscope does not change it.`]
      : [];
  });
}
