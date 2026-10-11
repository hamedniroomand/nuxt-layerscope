/**
 * Copies `text`; `false` when the browser refuses, which happens in iframes without the
 * clipboard permission. The caller then shows the text selected for a manual copy.
 */
export async function copyText(
  text: string,
  // Missing outside secure contexts, whatever the DOM types say.
  clipboard = globalThis.navigator.clipboard as Pick<Clipboard, 'writeText'> | undefined,
): Promise<boolean> {
  if (clipboard === undefined) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
