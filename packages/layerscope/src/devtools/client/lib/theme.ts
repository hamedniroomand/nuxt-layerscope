import type { Ref } from 'vue';
import { ref } from 'vue';

/** Where a snapshot keeps the reader's theme; the shell's theme script reads it first. */
export const THEME_KEY = 'layerscope-theme';

export interface ThemeToggle {
  dark: Ref<boolean>;
  toggle: () => void;
}

/**
 * The theme button of a snapshot. Inside DevTools the panel decides the theme; a snapshot has no
 * panel, so the reader picks one, and the choice is kept for the next visit.
 */
export function useThemeToggle(doc: Document = document): ThemeToggle {
  const root = doc.documentElement;
  const dark = ref(root.classList.contains('dark'));
  return {
    dark,
    toggle: () => {
      dark.value = !dark.value;
      root.classList.toggle('dark', dark.value);
      try {
        localStorage.setItem(THEME_KEY, dark.value ? 'dark' : 'light');
      } catch {
        // Storage can be off (private mode); the choice then lasts until the page closes.
      }
    },
  };
}
