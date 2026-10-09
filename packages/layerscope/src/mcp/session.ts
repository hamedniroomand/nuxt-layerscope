import { isAbsolute, relative, resolve } from 'pathe';

import { Analyzer } from '#src/devtools/analyzer.ts';
import { computeEnvKey } from '#src/devtools/env-key.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { AnalyzeResult, Layer, SourceOption } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';
import { buildDirOrDefault } from '#src/watch/project.ts';

import { ToolError } from './types.ts';

/** Calls that come this soon after an analysis share it. */
const SHARE_MS = 300;

export interface SessionOptions {
  rootDir: string;
  configFile?: string;
  source: SourceOption;
  baseline: string;
  now?: () => number;
  /** A problem from before the server started, such as a failed `nuxi prepare`; shown once. */
  startupError?: string;
}

/**
 * The project the server answers about. The analysis stays in memory; each call checks the files
 * again (changed ones only are read), so an answer is never older than the call before it.
 */
export class ProjectSession {
  public readonly rootDir: string;
  private readonly analyzer: Analyzer;
  private readonly now: () => number;
  private last: { result: AnalyzeResult; at: number } | undefined;
  private pending: Promise<AnalyzeResult> | undefined;
  private startupError: string | undefined;

  public constructor(options: SessionOptions) {
    this.rootDir = resolve(options.rootDir);
    this.now = options.now ?? Date.now;
    this.startupError = options.startupError;
    this.analyzer = new Analyzer({
      rootDir: this.rootDir,
      baseline: options.baseline,
      analyze: { configFile: options.configFile, source: options.source },
      envKey: async (): Promise<string> =>
        computeEnvKey(this.rootDir, await buildDirOrDefault(this.rootDir, options.configFile)),
    });
  }

  /** The current result. A failure is thrown and not kept, so the next call tries again. */
  public async result(): Promise<AnalyzeResult> {
    if (this.startupError !== undefined) {
      const { startupError } = this;
      this.startupError = undefined;
      throw new ToolError(`${startupError}. The server goes on without it; call the tool again.`);
    }
    if (this.pending !== undefined) {
      const shared = await this.pending;
      return shared;
    }
    if (this.last !== undefined && this.now() - this.last.at < SHARE_MS) {
      return this.last.result;
    }
    this.pending = this.refresh().finally(() => {
      this.pending = undefined;
    });
    const result = await this.pending;
    return result;
  }

  private async refresh(): Promise<AnalyzeResult> {
    const { result } = await this.analyzer.refresh();
    this.last = { result, at: this.now() };
    return result;
  }

  /**
   * An absolute path for a path from the assistant, which is relative to the project root. A path
   * outside the project, also through a symlink, is refused: the tools only read this project.
   */
  public resolveInside(input: string): string {
    const root = realPath(this.rootDir);
    const path = realPath(isAbsolute(input) ? input : resolve(root, input));
    const inside = relative(root, path);
    if (inside === '..' || inside.startsWith('../') || isAbsolute(inside)) {
      throw new ToolError(`"${input}" is outside the project root. Use a path inside the project.`);
    }
    return path;
  }

  /**
   * Like `resolveInside`, but also accepts a file of a layer that lives outside the root, which
   * the project's own config names.
   */
  public resolveFile(input: string, layers: Layer[]): string {
    const path = realPath(isAbsolute(input) ? input : resolve(realPath(this.rootDir), input));
    const owner = createOwnerLookup(layers)(path);
    return owner === null ? this.resolveInside(input) : path;
  }

  /** The same file, whatever symlink the path went through. */
  public real(file: string): string {
    return realPath(file.startsWith('/') ? file : resolve(this.rootDir, file));
  }

  /** The path relative to the project root, for output. */
  public relative(file: string): string {
    return relative(realPath(this.rootDir), realPath(file));
  }
}
