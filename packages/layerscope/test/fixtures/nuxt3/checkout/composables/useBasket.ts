export function useBasket() {
  const money = useMoney();
  return { money, items: ref<string[]>([]) };
}
