// Checks that examples/shop does what its README says: the example passes with its baseline, and
// the files in `violations/` make exactly the expected rules fail. Both runs use a copy in a
// temporary folder, so the working tree stays as it is. Run `vp run nuxt-layerscope#build` first.
import { execFile } from 'node:child_process';
import { cp, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const exampleDir = join(import.meta.dirname, '..', 'examples', 'shop');
const bin = join(exampleDir, 'node_modules', 'nuxt-layerscope', 'dist', 'bin.mjs');

// Every finding the violations make: [rule, file]. Three come from the others: the shadowing
// `BaseButton` also makes `LoginForm` in `auth` use a component of `shop`, and the two layer
// cycles run through `OrdersTable` and `AccountMenu`.
const EXPECTED = [
  ['layer-boundary', 'layers/auth/app/components/AccountMenu.vue'],
  ['layer-boundary', 'layers/auth/app/components/LoginForm.vue'],
  ['layer-boundary', 'layers/shared/app/composables/useCartBadge.ts'],
  ['layer-boundary', 'layers/shop/server/api/order-count.get.ts'],
  ['layer-cycle', 'layers/admin/app/components/OrdersTable.vue'],
  ['layer-cycle', 'layers/auth/app/components/AccountMenu.vue'],
  ['layer-cycle', 'layers/shared/app/composables/useCartBadge.ts'],
  ['shadowed-component', 'layers/shared/app/components/BaseButton.vue'],
  ['unresolved-reference', 'layers/shop/app/utils/track.ts'],
];

async function copyExample(withViolations) {
  // The real path matters: layerscope compares real paths, and macOS temp folders are symlinks.
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'layerscope-example-')));
  await cp(exampleDir, dir, {
    recursive: true,
    filter: source => !/[/\\](node_modules|\.nuxt|\.output|violations)$/.test(source),
  });
  if (withViolations) {
    await cp(join(exampleDir, 'violations'), dir, { recursive: true });
  }
  await symlink(join(exampleDir, 'node_modules'), join(dir, 'node_modules'));
  return dir;
}

/** Copies the example, checks the copy and always removes it. A parse failure is a problem. */
async function checkCopy(withViolations) {
  const dir = await copyExample(withViolations);
  try {
    const args = [bin, 'check', dir, '--prepare', '--format', 'json'];
    let code = 0;
    let stdout = '';
    let stderr = '';
    try {
      ({ stdout, stderr } = await run('node', args, { maxBuffer: 64 * 1024 * 1024 }));
    } catch (error) {
      ({ code, stdout = '', stderr = '' } = error);
    }
    try {
      return { code, report: JSON.parse(stdout), problem: undefined };
    } catch {
      return {
        code,
        report: undefined,
        problem: `The check printed no JSON (exit ${code}).\nstdout: ${stdout.slice(0, 500)}\nstderr: ${stderr.slice(0, 500)}`,
      };
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const problems = [];

const base = await checkCopy(false);
if (base.problem !== undefined) {
  problems.push(base.problem);
}
if (base.code !== 0) {
  problems.push(`The example must exit 0 with its baseline, but it exited ${base.code}.`);
}

const violations = await checkCopy(true);
if (violations.problem !== undefined) {
  problems.push(violations.problem);
}
if (violations.code !== 1) {
  problems.push(`The violations must exit 1, but the check exited ${violations.code}.`);
}
const found = (violations.report?.findings ?? [])
  .map(finding => `${finding.rule} ${finding.file.slice(finding.file.indexOf('layers/'))}`)
  .toSorted();
const wanted = EXPECTED.map(([rule, file]) => `${rule} ${file}`).toSorted();
if (JSON.stringify(found) !== JSON.stringify(wanted)) {
  problems.push(`Wrong findings.\nExpected:\n${wanted.join('\n')}\nFound:\n${found.join('\n')}`);
}

// The example must run the code of this repository, not a copy from npm.
const linked = await realpath(join(exampleDir, 'node_modules', 'nuxt-layerscope'));
if (linked !== (await realpath(join(exampleDir, '..', '..', 'packages', 'layerscope')))) {
  problems.push('The example does not link the local nuxt-layerscope. Update its version range.');
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  `The example passes, and the violations fail with ${found.length} findings.\n`,
);
