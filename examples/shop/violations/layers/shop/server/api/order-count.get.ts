// Violation 3, Nitro util: `shop` uses `getOrderStore` from `admin`.
export default defineEventHandler(() => getOrderStore().orders.length);
