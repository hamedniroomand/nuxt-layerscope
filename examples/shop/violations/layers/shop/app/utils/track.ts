// Violation 5, unresolved reference: `analytics` is not a local name, a known global or an
// auto-import.
export function track(event: string) {
  analytics.track(event);
}
