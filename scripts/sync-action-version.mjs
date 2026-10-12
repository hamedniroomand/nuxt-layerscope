// Sets the default of the `version` input in action.yml to the version of the workspace package, so
// an action tag runs the nuxt-layerscope of its own release when the project does not install it.
// `changeset version` runs it, so the release pull request changes the default with the version.
// Usage: node scripts/sync-action-version.mjs [repository root]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? join(import.meta.dirname, '..');
const { version } = JSON.parse(
  readFileSync(join(root, 'packages/layerscope/package.json'), 'utf8'),
);
const file = join(root, 'action.yml');
const text = readFileSync(file, 'utf8');

// The value of the first `default:` line after `  version:`. A comment or a CRLF after the value
// stays as it is.
const pattern = /^(  version:\r?\n(?: {4}.*\r?\n)*? {4}default: )([^\s#]+)/mu;
const match = pattern.exec(text);
if (match === null) {
  throw new Error('Could not find the default line of the version input in action.yml.');
}

if (match[2] === version) {
  console.log(`The action already runs nuxt-layerscope ${version}.`);
} else {
  writeFileSync(
    file,
    text.replace(pattern, (_match, prefix) => `${prefix}${version}`),
  );
  console.log(`The action now runs nuxt-layerscope ${version}.`);
}
