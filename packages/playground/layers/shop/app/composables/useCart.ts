interface CartLine {
  title: string;
  price: number;
}

export function useCart() {
  const lines = useState<CartLine[]>('cart', () => []);
  const total = computed(() => lines.value.reduce((sum, line) => sum + line.price, 0));
  const add = (title: string, price: number) => {
    lines.value = [...lines.value, { title, price }];
    useToast().show(`${title} added`);
  };
  // On purpose: `shop` may use `ui` and `base` only, and `useOrders` comes from `admin`. A
  // layer-boundary error.
  const { orders } = useOrders();
  return { lines, total, add, orders };
}
