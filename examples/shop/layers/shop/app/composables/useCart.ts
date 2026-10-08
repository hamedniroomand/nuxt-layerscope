interface CartLine {
  title: string;
  price: number;
}

export function useCart() {
  const lines = useState<CartLine[]>('cart', () => []);
  const total = computed(() => lines.value.reduce((sum, line) => sum + line.price, 0));
  // Accepted in `layerscope-baseline.json`: `shop` may use `shared` only, and `useUser` comes
  // from `auth`. It shows how an old project adopts layerscope. The fix is to pass the name in.
  const { user } = useUser();
  const add = (title: string, price: number) => {
    lines.value = [...lines.value, { title, price }];
    useNotice().show(`${title} added for ${user.value?.name ?? 'a guest'}`);
  };
  return { lines, total, add };
}
