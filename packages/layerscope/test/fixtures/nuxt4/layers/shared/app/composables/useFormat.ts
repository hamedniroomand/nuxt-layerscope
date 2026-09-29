export function useFormat() {
  return { price: (n: number) => formatPrice(n) };
}
