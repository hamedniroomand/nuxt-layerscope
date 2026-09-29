export function useAuth() {
  const fmt = useFormat();
  return { user: ref<string | null>(null), fmt };
}
