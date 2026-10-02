import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';

/** A built client stand-in, with a file next to it that must stay unreachable. */
export function fakeAssets(): string {
  const root = mkdtempSync(join(tmpdir(), 'layerscope-assets-'));
  const dir = join(root, 'devtools');
  mkdirSync(dir);
  writeFileSync(join(dir, 'client.js'), 'console.log(1)');
  writeFileSync(join(dir, 'client.css'), 'body{}');
  writeFileSync(join(root, 'secret.js'), 'secret');
  return dir;
}
