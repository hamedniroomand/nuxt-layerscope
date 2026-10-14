import type { SymbolTable } from '#src/nuxt/symbols.ts';
import type { Context } from '#src/types.ts';

import { CONTEXTS } from './files.ts';

/** Runtime registrations (plugins, `app.component`, `vueApp.use`) are invisible statically. */
export const GLOBALS_HINT =
  'if it is registered at runtime, add it to "globals" in layerscope.config.ts';

/**
 * Why a free name is not resolved in `context`. The `globals` hint is only for a name that no layer
 * has: for a known name, it would hide the use of another layer.
 */
export function unresolvedName(name: string, context: Context, table: SymbolTable): string {
  // The caller looked in `context` first, so these are the other contexts.
  const others = CONTEXTS.filter(other => table.imports[other].has(name));
  if (others.length > 0) {
    const where = `${others.join(' and ')} ${others.length > 1 ? 'contexts' : 'context'}`;
    return `"${name}" is an auto-import only in the ${where}, not in the ${context} context`;
  }
  if (table.components.has(name)) {
    // `#components` is a module of the app build only; Nitro does not have it.
    return context === 'app'
      ? `"${name}" is a component, not an auto-import: use it in a template, or import it from "#components"`
      : `"${name}" is a component, not an auto-import in the ${context} context`;
  }
  return `"${name}" is not a local binding, a known global or an auto-import in the ${context} context; ${GLOBALS_HINT}`;
}
