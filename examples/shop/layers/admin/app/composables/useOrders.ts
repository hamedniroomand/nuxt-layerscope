export function useOrders() {
  const { user } = useUser();
  const { data: orders } = useFetch('/api/orders', { immediate: user.value?.role === 'admin' });
  return { orders };
}
