export interface Shortcut {
  /** `KeyboardEvent.key`, such as `j`, `/` or `Escape`. */
  key: string;
  /** What the key does, for the shortcut sheet. */
  label: string;
  run: () => unknown;
  /** Also runs while a text field has focus. Only `Escape` needs this. */
  inFields?: boolean;
}

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

export interface Shortcuts {
  /** Returns a function that removes the shortcut again. */
  register: (shortcut: Shortcut) => () => void;
  /** Runs the matching shortcut; `true` when one ran, so the caller can prevent the default. */
  handle: (event: KeyInput) => boolean;
  list: () => Shortcut[];
}

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isField(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  return (
    element !== null &&
    (FIELD_TAGS.has(element.tagName ?? '') || element.isContentEditable === true)
  );
}

/** One key map for the whole tab; views register their keys while they are mounted. */
export function createShortcuts(): Shortcuts {
  const shortcuts: Shortcut[] = [];
  return {
    register: shortcut => {
      shortcuts.push(shortcut);
      return (): void => {
        const index = shortcuts.indexOf(shortcut);
        if (index !== -1) {
          shortcuts.splice(index, 1);
        }
      };
    },
    handle: event => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return false;
      }
      const inField = isField(event.target);
      // The latest registration wins, so a mounted view can override a global key.
      const match = shortcuts.findLast(
        shortcut => shortcut.key === event.key && (!inField || shortcut.inFields === true),
      );
      match?.run();
      return match !== undefined;
    },
    list: () => [...shortcuts],
  };
}
