// `npm run break` copies the files in `violations/` into the project, so the check fails.
// `npm run reset` removes them again. The files are all new, so nothing is overwritten.
import { cpSync, existsSync, readdirSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const overlay = join(root, 'violations');
const files = readdirSync(overlay, { recursive: true, encoding: 'utf8' }).filter(path =>
  statSync(join(overlay, path)).isFile(),
);
const command = process.argv[2];

if (command === 'break') {
  for (const path of files) {
    cpSync(join(overlay, path), join(root, path), { recursive: true });
  }
  process.stdout.write(`Added ${files.length} files with violations. Run "npm run check".\n`);
} else if (command === 'reset') {
  let removed = 0;
  for (const path of files) {
    if (existsSync(join(root, path))) {
      rmSync(join(root, path));
      removed += 1;
      // Remove the folders that the copy made and that are empty now.
      for (let dir = join(root, dirname(path)); dir !== root; dir = dirname(dir)) {
        if (readdirSync(dir).length > 0) {
          break;
        }
        rmdirSync(dir);
      }
    }
  }
  process.stdout.write(`Removed ${removed} files.\n`);
} else {
  process.stderr.write('Use "break" or "reset".\n');
  process.exit(1);
}
