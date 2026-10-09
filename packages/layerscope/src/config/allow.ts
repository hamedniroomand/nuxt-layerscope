import type { AllowEntry, ScopedAllow } from '#src/types.ts';

export function isScoped(entry: AllowEntry): entry is ScopedAllow {
  return typeof entry !== 'string';
}

export function entryLayer(entry: AllowEntry): string {
  return isScoped(entry) ? entry.layer : entry;
}

/** Every layer the list names, whole or scoped. A scoped entry is a real dependency too. */
export function allowedLayers(allow: AllowEntry[]): string[] {
  return allow.map(entry => entryLayer(entry));
}

/** The layers `allow` gives whole. */
export function fullLayers(allow: AllowEntry[]): string[] {
  return allow.filter(entry => !isScoped(entry)).map(entry => entryLayer(entry));
}

/** The scoped entries of `allow`. */
export function scopedEntries(allow: AllowEntry[]): ScopedAllow[] {
  return allow.filter(entry => isScoped(entry));
}

export function mentionsLayer(allow: AllowEntry[], layer: string): boolean {
  return allow.some(entry => entryLayer(entry) === layer);
}
