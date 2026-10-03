export function useOrders() {
  const orders = useState('orders', () => [
    { id: 1001, total: 1650 },
    { id: 1002, total: 3900 },
  ]);
  return { orders };
}
