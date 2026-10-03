const items = [
  { title: 'Notebook', price: 1200 },
  { title: 'Pencil set', price: 450 },
  { title: 'Desk lamp', price: 3900 },
];

export function getCartStore() {
  return { items };
}
