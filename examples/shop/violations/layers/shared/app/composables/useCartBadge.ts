// Violation 1, auto-import: `shared` uses `useCart` from `shop`.
// Together with `shop` using `shared`, this is a layer cycle (violation 4).
export function useCartBadge() {
  return computed(() => useCart().lines.value.length);
}
