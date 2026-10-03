// On purpose: nothing uses this auto-import, so the Unused view lists it.
export function formatDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}
