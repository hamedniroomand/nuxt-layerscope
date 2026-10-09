// Sets the range of nuxt-layerscope in examples/shop to the version of the workspace package, and
// updates the lockfile. `changeset version` runs it, so the release pull request keeps the
// example linked to the local package: a range that the new version does not match makes pnpm
// install the package from npm, and a frozen install then fails.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'));

const { version } = read('packages/layerscope/package.json');
const exampleFile = join(root, 'examples/shop/package.json');
const example = read('examples/shop/package.json');
const range = `^${version}`;

if (example.devDependencies['nuxt-layerscope'] === range) {
  console.log(`The example already uses nuxt-layerscope ${range}.`);
} else {
  example.devDependencies['nuxt-layerscope'] = range;
  writeFileSync(exampleFile, `${JSON.stringify(example, null, 2)}\n`);
  console.log(`The example now uses nuxt-layerscope ${range}.`);
}

execFileSync('pnpm', ['install', '--lockfile-only'], { cwd: root, stdio: 'inherit' });
