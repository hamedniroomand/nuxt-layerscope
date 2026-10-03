/**
 * Baseline writes run one after another, so two requests never interleave a read-modify-write.
 * The queue also keeps what the last write replaced, for one level of undo.
 */
export interface Writes {
  /** Runs `task` after every write queued before it. */
  run: <T>(task: () => Promise<T>) => Promise<T>;
  /** Counts writes; the undo of a write is refused once a newer write happened. */
  readonly latest: number;
  /** Records a write and the text it replaced; returns the write's id. */
  record: (before: string | null) => number;
  /** The text the latest write replaced, if it can still be undone. */
  undoable: (writeId: number) => { before: string | null } | undefined;
  /** The latest write was undone; it cannot be undone twice. */
  forget: () => void;
}

/** A failed write is answered on its own request; the queue moves on. */
const ignore = (): undefined => undefined;

export function createWrites(): Writes {
  let chain: Promise<unknown> = Promise.resolve();
  let latest = 0;
  let last: { before: string | null } | undefined;
  return {
    run: async task => {
      const next = chain.then(task, task);
      // A failed write releases the queue for the next one.
      chain = next.catch(ignore);
      const value = await next;
      return value;
    },
    get latest(): number {
      return latest;
    },
    record: before => {
      latest += 1;
      last = { before };
      return latest;
    },
    undoable: writeId => (writeId === latest ? last : undefined),
    forget: () => {
      last = undefined;
    },
  };
}
