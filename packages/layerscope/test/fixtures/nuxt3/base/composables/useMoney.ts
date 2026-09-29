export const useMoney = () => ({ format: (n: number) => roundCents(n).toString() });
