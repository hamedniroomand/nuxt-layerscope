const NODE_MODULES = '/node_modules/';

/** Package name of a bare specifier or of a path inside node_modules. */
export function packageName(specifier: string): string {
  const index = specifier.lastIndexOf(NODE_MODULES);
  const bare = index === -1 ? specifier : specifier.slice(index + NODE_MODULES.length);
  const parts = bare.split('/');
  return bare.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}
