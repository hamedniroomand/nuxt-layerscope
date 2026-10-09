import type { Rule } from 'eslint';
import { relative } from 'pathe';

import type { Finding } from '#src/types.ts';

import type { FileLint } from './lint-file.ts';
import { lintFile } from './lint-file.ts';
import { reportLocation } from './location.ts';
import { projectFor } from './project.ts';

interface RuleOptions {
  /** Nuxt project root, relative to the working dir. Found from the file by default. */
  root?: string;
}

const OPTIONS_SCHEMA = [
  {
    type: 'object',
    properties: { root: { type: 'string' } },
    additionalProperties: false,
  },
];

function describeFinding(finding: Finding, rootDir: string): string {
  if (finding.target === null) {
    return finding.message;
  }
  const where = `${finding.symbol} → ${relative(rootDir, finding.target)}`;
  if (finding.rule === 'layer-internal') {
    return `${finding.message}: ${where} (exposed by "${finding.toLayer}": ${finding.exposed?.join(', ') ?? ''})`;
  }
  if (finding.rule !== 'layer-boundary') {
    return finding.message;
  }
  const scoped = (finding.scoped ?? []).map(
    entry => `${entry.layer} (only ${entry.only.join(', ')})`,
  );
  const all = [...(finding.allowed ?? []), ...scoped];
  const allowed = all.length === 0 ? 'no other layers' : all.join(', ');
  return `${finding.message}: ${where} (allowed for "${finding.fromLayer}": ${allowed})`;
}

function createRule(
  description: string,
  pick: (lint: FileLint) => Finding[],
  reportsSetup: boolean,
): Rule.RuleModule {
  return {
    meta: {
      type: 'problem',
      docs: { description },
      schema: OPTIONS_SCHEMA,
    },
    create(context) {
      const [options] = context.options as (RuleOptions | undefined)[];
      return {
        'Program:exit'(): void {
          const load = projectFor(context.filename, options?.root);
          if (!load.ok) {
            // Reported once, by the boundary rule, so a missing registry is not a wall of errors.
            if (reportsSetup) {
              context.report({
                loc: { line: 1, column: 0 },
                message: `layerscope: ${load.message}`,
              });
            }
            return;
          }
          const { project } = load;
          const { text } = context.sourceCode;
          const lint = lintFile(context.filename, text, project);
          for (const finding of pick(lint)) {
            const { line, column, outside } = reportLocation(finding, lint.source, text);
            const message = describeFinding(finding, project.rootDir);
            context.report({
              loc: { line, column: column - 1 },
              message: outside ? `${message} (template line ${finding.line})` : message,
            });
          }
        },
      };
    },
  };
}

export const rules: Record<string, Rule.RuleModule> = {
  'layer-boundary': createRule(
    'Disallow dependencies, including auto-imports, into layers this layer may not use',
    lint => lint.boundary,
    true,
  ),
  'layer-internal': createRule(
    'Disallow uses of symbols that their layer does not expose',
    lint => lint.internal,
    false,
  ),
  'unresolved-reference': createRule(
    'Report identifiers, components and imports that cannot be resolved',
    lint => lint.unresolved,
    false,
  ),
};
