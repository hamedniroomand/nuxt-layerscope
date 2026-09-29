import { useCart } from '#layers/web/app/composables/useCart';

export const exportCsv = () => JSON.stringify(useCart());
