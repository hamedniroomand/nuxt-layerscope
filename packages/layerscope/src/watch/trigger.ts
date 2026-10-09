/**
 * Debounces `run`: it starts after `delayMs` without a call, or after `maxWaitMs` if calls keep
 * coming. Runs never overlap: a call during a run gives exactly one more run after it.
 */
export class Trigger {
  private readonly run: () => Promise<void>;
  private readonly delayMs: number;
  private readonly maxWaitMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstTouch = 0;
  private running: Promise<void> | undefined;
  private again = false;
  private stopped = false;

  public constructor(run: () => Promise<void>, delayMs: number, maxWaitMs: number) {
    this.run = run;
    this.delayMs = delayMs;
    this.maxWaitMs = maxWaitMs;
  }

  /** Asks for a run; many calls in a short time give one run. */
  public touch(): void {
    if (this.stopped) {
      return;
    }
    const now = Date.now();
    this.firstTouch = this.firstTouch === 0 ? now : this.firstTouch;
    clearTimeout(this.timer);
    const wait = Math.min(this.delayMs, this.firstTouch + this.maxWaitMs - now);
    this.timer = setTimeout(
      () => {
        this.start();
      },
      Math.max(0, wait),
    );
  }

  /** Resolves when no run is pending or running. */
  public async idle(): Promise<void> {
    while (this.running !== undefined || this.timer !== undefined) {
      // eslint-disable-next-line no-await-in-loop -- waits for each run in turn
      await (this.running ?? this.pause());
    }
  }

  public stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async pause(): Promise<void> {
    await new Promise<void>(resolve => {
      setTimeout(resolve, this.delayMs);
    });
  }

  private start(): void {
    this.timer = undefined;
    this.firstTouch = 0;
    if (this.stopped) {
      return;
    }
    if (this.running !== undefined) {
      this.again = true;
      return;
    }
    this.running = this.run()
      .catch(() => {
        // The run reports its own errors.
      })
      .finally(() => {
        this.running = undefined;
        if (this.again) {
          this.again = false;
          this.start();
        }
      });
  }
}
