const products = [
  { id: 1, title: 'Notebook', price: 1200 },
  { id: 2, title: 'Pencil set', price: 450 },
  { id: 3, title: 'Desk lamp', price: 3900 },
];

export function getProductStore() {
  return { products };
}
