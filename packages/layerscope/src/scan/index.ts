import { scanModule } from './script.ts';
import type { FileScan } from './types.ts';
import { scanVue } from './vue.ts';

export function scanFile(source: string, file: string): FileScan {
  return file.endsWith('.vue') ? scanVue(source, file) : scanModule(source, file);
}
