const SPECIAL = /[.+^${}()|[\]\\]/gu;

/**
 * A path glob as a RegExp over forward-slash paths: `*` and `?` stay in one segment, `**` crosses
 * segments (`a/**` is everything below `a`), and every other character is literal.
 */
export function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index);
    if (char === '*' && glob.charAt(index + 1) === '*') {
      // `**/` also matches no directory at all.
      const slash = glob.charAt(index + 2) === '/';
      source += slash ? '(?:.*/)?' : '.*';
      index += slash ? 2 : 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replaceAll(SPECIAL, String.raw`\$&`);
    }
  }
  return new RegExp(`^${source}$`, 'u');
}

/** Every edge is checked against the same few globs, so each one is compiled once. */
const compiled = new Map<string, RegExp>();

export function matchesGlob(glob: string, path: string): boolean {
  let pattern = compiled.get(glob);
  if (pattern === undefined) {
    pattern = globToRegExp(glob);
    compiled.set(glob, pattern);
  }
  return pattern.test(path);
}
