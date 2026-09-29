import { readFileSync } from 'node:fs';

import { FileAnalysis } from '#src/analyze/file-analysis.ts';
import { isCheckedFile } from '#src/analyze/files.ts';
import { boundaryFindings } from '#src/rules/layer-boundary.ts';
import { scanFile } from '#src/scan/index.ts';
import type { Finding } from '#src/types.ts';

import type { Project } from './load-project.ts';

export interface FileLint {
  /** Text the finding positions refer to: the full file, even when the linter passed less. */
  source: string;
  boundary: Finding[];
  unresolved: Finding[];
}

/**
 * Both rules lint the same text, so the last result per file is reused. A reloaded project
 * (registry or config changed) is another object, so results from before it are not reused.
 */
const lastLint = new Map<string, { project: Project; source: string; lint: FileLint }>();

/**
 * oxlint passes only the `<script>` of a `.vue` file to JS plugins, while the template matters
 * too; the saved file is read instead.
 */
function fullSource(file: string, text: string): string {
  const isPartialSfc = file.endsWith('.vue') && !/<(?:script|template)[\s>]/u.test(text);
  return isPartialSfc ? readFileSync(file, 'utf8') : text;
}

/** Lints the text the editor holds, which may differ from the file on disk. */
export function lintFile(file: string, text: string, project: Project): FileLint {
  const source = fullSource(file, text);
  const cached = lastLint.get(file);
  if (cached?.project === project && cached.source === source) {
    return cached.lint;
  }
  const layer = project.env.ownerOf(file);
  let lint: FileLint = { source, boundary: [], unresolved: [] };
  if (layer !== null && isCheckedFile(file, layer, project.config.ignore ?? [])) {
    const analysis = new FileAnalysis(file, source, layer, project.env).run(scanFile(source, file));
    lint = {
      source,
      boundary: boundaryFindings(analysis.edges, project.config),
      unresolved: analysis.unresolved,
    };
  }
  lastLint.set(file, { project, source, lint });
  return lint;
}
