export function useCart() {
  trackEvent('cart');
  return { total: formatPrice(0) };
}
