export function formatMoney(cents: number) {
  return `${(cents / 100).toFixed(2)} EUR`;
}
