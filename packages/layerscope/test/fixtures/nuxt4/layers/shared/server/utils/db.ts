export function useDb() {
  return { query: (sql: string) => sql };
}
