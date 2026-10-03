import { summarize } from '#src/report/summary.ts';

import type { Snapshot } from './analyzer.ts';
import type { FindingDelta, KeyCounts } from './finding-keys.ts';
import { countKeys, diffKeys, findingKey, markNew } from './finding-keys.ts';

export interface LiveEvent {
  id: string;
  rev: number;
  /** Changes when the marker moves, so a cached report is fetched again. */
  marker: number;
  analyzedAt: number;
  durationMs: number;
  summary: { errors: number; warnings: number };
  delta: FindingDelta;
  newCount: number;
}

export interface LiveState {
  clients: number;
  paused: boolean;
}

/** What a connected tab receives, as server-sent event name and data. */
export type LiveMessage =
  | { event: 'snapshot'; data: LiveEvent }
  | { event: 'state'; data: { live: LiveState } }
  | { event: 'error'; data: { error: string } };

/** The slice of `Analyzer` live updates drive. */
export interface LiveTarget {
  invalidate: () => void;
  refresh: () => Promise<Snapshot>;
}

export interface LiveOptions {
  /** Quiet time after the last change before a run starts. */
  delayMs?: number;
  /** Longest a run waits while changes keep coming. */
  maxWaitMs?: number;
  now?: () => number;
}

type Listener = (message: LiveMessage) => void;

/**
 * Live updates for open tabs. With no tab connected, or while paused, a change only marks the
 * analysis stale, as before; with a tab connected it starts a debounced re-run.
 */
export class Live {
  private readonly target: () => LiveTarget;
  private readonly delayMs: number;
  private readonly maxWaitMs: number;
  private readonly now: () => number;
  private readonly listeners = new Set<Listener>();
  private paused = false;
  private pending = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstChange: number | undefined;
  private counts: KeyCounts = new Map();
  private markerCounts: KeyCounts | undefined;
  private markerVersion = 0;
  private last: Snapshot | undefined;

  public constructor(target: () => LiveTarget, options: LiveOptions = {}) {
    this.target = target;
    this.delayMs = options.delayMs ?? 200;
    this.maxWaitMs = options.maxWaitMs ?? 1000;
    this.now = options.now ?? Date.now;
  }

  public get state(): LiveState {
    return { clients: this.listeners.size, paused: this.paused };
  }

  public get marker(): number {
    return this.markerVersion;
  }

  /** Adds a tab; the returned function removes it again. */
  public connect(listener: Listener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.cancel();
      }
    };
  }

  /** A watched file changed. */
  public invalidate(): void {
    this.target().invalidate();
    if (this.listeners.size === 0) {
      return;
    }
    if (this.paused) {
      this.pending = true;
      return;
    }
    this.schedule();
  }

  public pause(): void {
    this.paused = true;
    // A run that was due is kept for the resume.
    if (this.timer !== undefined) {
      this.pending = true;
    }
    this.cancel();
    this.broadcast({ event: 'state', data: { live: this.state } });
  }

  public resume(): void {
    this.paused = false;
    if (this.pending && this.listeners.size > 0) {
      this.schedule();
    }
    this.broadcast({ event: 'state', data: { live: this.state } });
  }

  /** Every finding present now stops being new. */
  public resetMarker(): void {
    this.markerCounts = this.counts;
    this.markerVersion += 1;
    if (this.last !== undefined) {
      this.emit(this.last, { added: [], removed: [] });
    }
  }

  /** Called with every new snapshot, whatever started the run. */
  public observe(snapshot: Snapshot): void {
    const counts = countKeys(snapshot.result.findings, snapshot.result.rootDir);
    // The first run marks what was there when the tab opened.
    this.markerCounts ??= counts;
    const delta = diffKeys(this.counts, counts);
    this.counts = counts;
    this.last = snapshot;
    this.emit(snapshot, delta);
  }

  /** Per finding of `snapshot`, in report order: its key and whether it is new. */
  public keysOf(snapshot: Snapshot): { keys: string[]; isNew: boolean[] } {
    const { findings, rootDir } = snapshot.result;
    const keys = findings.map(finding => findingKey(finding, rootDir));
    return { keys, isNew: markNew(keys, this.markerCounts ?? countKeys(findings, rootDir)) };
  }

  private broadcast(message: LiveMessage): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  private emit(snapshot: Snapshot, delta: FindingDelta): void {
    if (this.listeners.size === 0) {
      return;
    }
    const data: LiveEvent = {
      id: snapshot.id,
      rev: snapshot.rev,
      marker: this.markerVersion,
      analyzedAt: snapshot.analyzedAt,
      durationMs: snapshot.durationMs,
      summary: summarize(snapshot.result.findings),
      delta,
      newCount: this.keysOf(snapshot).isNew.filter(Boolean).length,
    };
    this.broadcast({ event: 'snapshot', data });
  }

  private schedule(): void {
    this.pending = false;
    const now = this.now();
    this.firstChange ??= now;
    clearTimeout(this.timer);
    const wait = Math.min(this.delayMs, Math.max(0, this.firstChange + this.maxWaitMs - now));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.firstChange = undefined;
      this.target()
        .refresh()
        .catch((error: unknown) => {
          this.broadcast({ event: 'error', data: { error: (error as Error).message } });
        });
    }, wait);
    // A pending run never keeps the process alive.
    this.timer.unref();
  }

  private cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.firstChange = undefined;
  }
}
