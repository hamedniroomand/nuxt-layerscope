const orders = [
  { id: 101, user: 'Ada', total: 5100 },
  { id: 102, user: 'Linus', total: 450 },
];

export function getOrderStore() {
  return { orders };
}
