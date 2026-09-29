import { randomUUID } from 'node:crypto';

import { AnalysisCache } from '#src/analyze/cache.ts';
import type { AnalyzeOptions } from '#src/analyze/index.ts';
import type { AnalyzeResult } from '#src/types.ts';

export interface Snapshot {
  /** Identifies this analyzer, so a revision from before a restart never matches. */
  id: string;
  rev: number;
  analyzedAt: number;
  durationMs: number;
  result: AnalyzeResult;
}

export interface AnalyzerOptions {
  rootDir: string;
  /** Baseline file relative to `rootDir`. */
  baseline: string;
  envKey: () => Promise<string> | string;
  /** Defaults to `analyze`, imported on first use so it stays out of Nuxt's startup. */
  run?: (options: AnalyzeOptions) => Promise<AnalyzeResult>;
}

/** The output the revision tracks; the symbol table and edges are large and derived from it. */
function fingerprint(result: AnalyzeResult): string {
  return JSON.stringify([
    result.findings,
    result.baseline?.suppressed,
    result.layers.map(layer => layer.name),
    result.files.length,
    result.notes,
  ]);
}

/** Analyzes lazily, shares one run between concurrent callers, and reuses per-file work. */
export class Analyzer {
  private readonly options: AnalyzerOptions;
  private readonly id = randomUUID();
  private readonly cache = new AnalysisCache();
  private snapshot: Snapshot | undefined;
  private lastFingerprint = '';
  private dirty = true;
  private inflight: Promise<Snapshot> | undefined;
  private queued: Promise<Snapshot> | undefined;

  public constructor(options: AnalyzerOptions) {
    this.options = options;
  }

  public get current(): Snapshot | undefined {
    return this.snapshot;
  }

  /** Marks the snapshot stale; the next `get` re-analyzes. Does no work itself. */
  public invalidate(): void {
    this.dirty = true;
  }

  public async get(): Promise<Snapshot> {
    if (this.snapshot !== undefined && !this.dirty) {
      return this.snapshot;
    }
    const running = this.inflight ?? this.start();
    const snapshot = await running;
    return snapshot;
  }

  /** Always analyzes after the call: a run already in flight may predate the request. */
  public async refresh(): Promise<Snapshot> {
    if (this.inflight === undefined) {
      const snapshot = await this.start();
      return snapshot;
    }
    // Everyone who asks while a run is in flight shares the one run queued behind it.
    this.queued ??= this.afterInflight();
    const snapshot = await this.queued;
    return snapshot;
  }

  private async afterInflight(): Promise<Snapshot> {
    await Promise.allSettled([this.inflight]);
    this.queued = undefined;
    const snapshot = await this.refresh();
    return snapshot;
  }

  private async start(): Promise<Snapshot> {
    this.inflight = this.analyze().finally(() => {
      this.inflight = undefined;
    });
    const snapshot = await this.inflight;
    return snapshot;
  }

  private async analyze(): Promise<Snapshot> {
    // Cleared before the run, so an invalidation that lands mid-run is kept for the next request.
    this.dirty = false;
    const started = Date.now();
    try {
      const run = this.options.run ?? (await import('#src/analyze/index.ts')).analyze;
      const result = await run({
        rootDir: this.options.rootDir,
        baseline: this.options.baseline,
        cache: this.cache,
        envKey: await this.options.envKey(),
      });
      const next = fingerprint(result);
      const changed = this.snapshot !== undefined && next !== this.lastFingerprint;
      this.lastFingerprint = next;
      this.snapshot = {
        id: this.id,
        rev: (this.snapshot?.rev ?? 0) + (changed ? 1 : 0),
        analyzedAt: Date.now(),
        durationMs: Date.now() - started,
        result,
      };
      return this.snapshot;
    } catch (error) {
      this.dirty = true;
      throw error;
    }
  }
}
