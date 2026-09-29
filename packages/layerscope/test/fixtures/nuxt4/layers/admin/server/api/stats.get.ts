export default defineEventHandler(() => ({
  rows: useDb().query('stats'),
  carts: getCartStore().size,
}));
