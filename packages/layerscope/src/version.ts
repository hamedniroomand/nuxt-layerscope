import { fileURLToPath } from 'node:url';

import { readJson } from '#src/utils/fs.ts';

/** Both `src/` and the bundled `dist/` sit next to package.json. */
export function packageVersion(): string {
  const pkg = readJson(fileURLToPath(new URL('../package.json', import.meta.url))) as {
    version?: string;
  };
  return pkg.version ?? '0.0.0';
}
