// Stands in for the analytics script tag, which defines `analytics` on the page at runtime.
// layerscope does not follow this assignment, so `exportCsv.ts` still shows the warning.
export default defineNuxtPlugin(() => {
  (globalThis as { analytics?: unknown }).analytics = {
    track: (name: string) => {
      console.info(`[analytics] ${name}`);
    },
  };
});
