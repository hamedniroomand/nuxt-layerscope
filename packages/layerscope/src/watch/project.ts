import { resolve, join } from 'pathe';

import { prepareNuxt } from '#src/analyze/prepare.ts';
import { findConfigFile, loadConfig } from '#src/config/load.ts';
import type { Finding } from '#src/types.ts';

/** The config file in use, or `undefined` when there is none or it cannot be found. */
export function configPathOf(rootDir: string, configFile?: string): string | undefined {
  try {
    return findConfigFile(rootDir, configFile) ?? undefined;
  } catch {
    // A missing file is reported by the run.
    return undefined;
  }
}

export async function buildDirOf(rootDir: string, configFile?: string): Promise<string> {
  const config = await loadConfig(rootDir, configFile);
  return resolve(rootDir, config.buildDir ?? '.nuxt');
}

/** The build dir, or the default one when the config cannot be loaded. */
export async function buildDirOrDefault(rootDir: string, configFile?: string): Promise<string> {
  const dir = await buildDirOf(rootDir, configFile).catch(() => join(rootDir, '.nuxt'));
  return dir;
}

export function prepareProject(rootDir: string): void {
  prepareNuxt(rootDir);
}

/**
 * Whether a finding may come from stale auto-imports. Code that layerscope cannot read (`unread`)
 * does not, so `nuxi prepare` would not change it.
 */
export function needsPrepareHint(findings: Finding[]): boolean {
  return findings.some(
    finding => finding.rule === 'unresolved-reference' && finding.unread !== true,
  );
}
