// A local `useCart` shadows the auto-imported one from the web layer: not a violation.
const useCart = () => ({ total: 0 });

export function useAdminStats() {
  return { cart: useCart(), price: formatPrice(1) };
}
