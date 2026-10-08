export default defineEventHandler(() => {
  // `admin` may use `auth`: this is the exception in `layerscope.config.ts`.
  if (getSessionUser().role !== 'admin') {
    throw createError({ statusCode: 403 });
  }
  return getOrderStore().orders;
});
