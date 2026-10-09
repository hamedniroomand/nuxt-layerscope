import { join } from 'pathe';

import { isFile } from '#src/utils/fs.ts';

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '.vue', '.json'];
// Tried last, so an import that resolved before the CommonJS files were scanned still does.
const COMMONJS_EXTENSIONS = ['.cts', '.cjs'];

function withTsExtension(path: string): string | null {
  const jsExt = /\.([cm]?)js$/u.exec(path);
  if (!jsExt) {
    return null;
  }
  const base = path.slice(0, -jsExt[0].length);
  return [`${base}.${jsExt[1]}ts`, `${base}.tsx`].find(candidate => isFile(candidate)) ?? null;
}

/** Bundler-style lookup: exact, added extension, `.js` → `.ts`, then `index.*`. */
export function resolveFile(path: string): string | null {
  const direct = [path, ...EXTENSIONS.map(ext => path + ext)].find(candidate => isFile(candidate));
  if (direct !== undefined) {
    return direct;
  }
  return (
    withTsExtension(path) ??
    EXTENSIONS.map(ext => join(path, `index${ext}`)).find(candidate => isFile(candidate)) ??
    COMMONJS_EXTENSIONS.flatMap(ext => [path + ext, join(path, `index${ext}`)]).find(candidate =>
      isFile(candidate),
    ) ??
    null
  );
}
