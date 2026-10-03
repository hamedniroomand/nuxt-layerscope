export function useTheme() {
  const dark = useState('theme-dark', () => false);
  const toggle = () => {
    dark.value = !dark.value;
    // On purpose: `base` reaches up into `ui`. This is the one finding in layerscope-baseline.json,
    // accepted as a known exception, so the Baseline view has an entry.
    useToast().show(dark.value ? 'Dark theme' : 'Light theme');
  };
  return { dark, toggle };
}
