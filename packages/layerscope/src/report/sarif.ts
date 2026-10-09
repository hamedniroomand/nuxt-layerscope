import { pathToFileURL } from 'node:url';

import { DEFAULT_SEVERITY, ruleSeverity } from '#src/config/rules.ts';
import type { AnalyzeResult, Finding, RuleName, Severity } from '#src/types.ts';
import { packageVersion } from '#src/version.ts';

import { fingerprints } from './fingerprint.ts';
import { repoPath } from './paths.ts';

const SITE = 'https://layerscope.kitdev.space/';
const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

// A record, so a new rule does not build until it has a description.
const DESCRIPTIONS: Record<RuleName, string> = {
  'layer-boundary': 'A file uses a layer that its own layer does not allow.',
  'layer-cycle': 'Layers depend on each other in a cycle.',
  'layer-internal': 'A file uses a symbol that its layer does not expose.',
  'unresolved-reference':
    'A reference cannot be resolved: an unknown identifier, component or import, a dynamic component, or a file that cannot be parsed.',
  'shadowed-component': 'A component is replaced by a component of the same name in another layer.',
};

const RULES = Object.keys(DEFAULT_SEVERITY) as RuleName[];

const LEVELS: Record<Severity, string> = { error: 'error', warn: 'warning', off: 'none' };

/** A file URI with a trailing slash, as SARIF wants for a base. */
function directoryUri(root: string): string {
  const { href } = pathToFileURL(root);
  return href.endsWith('/') ? href : `${href}/`;
}

function location(file: string, root: string): { artifactLocation: object } {
  return { artifactLocation: { uri: repoPath(file, root), uriBaseId: '%SRCROOT%' } };
}

function toResult(
  finding: Finding,
  root: string,
  fingerprint: string,
  suppressed: boolean,
): object {
  return {
    ruleId: finding.rule,
    ruleIndex: RULES.indexOf(finding.rule),
    level: LEVELS[finding.severity],
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          ...location(finding.file, root),
          region: { startLine: finding.line, startColumn: finding.column },
        },
      },
    ],
    ...(finding.target !== null && {
      relatedLocations: [
        {
          id: 1,
          physicalLocation: location(finding.target, root),
          message: { text: `${finding.symbol} resolves here` },
        },
      ],
    }),
    partialFingerprints: { 'layerscope/v1': fingerprint },
    ...(suppressed && {
      suppressions: [{ kind: 'external', justification: 'layerscope baseline' }],
    }),
  };
}

/**
 * A SARIF 2.1.0 log for code scanning. Paths are relative to `repoRoot` (default: the project
 * root). Findings the baseline accepts are included as suppressed results.
 */
export function formatSarif(
  result: AnalyzeResult,
  _cwd: string,
  _paint: unknown,
  repoRoot: string = result.rootDir,
): string {
  const ids = fingerprints(result);
  const results = [
    ...result.findings.map(finding => toResult(finding, repoRoot, ids.get(finding) ?? '', false)),
    ...(result.baseline?.suppressed ?? []).map(finding =>
      toResult(finding, repoRoot, ids.get(finding) ?? '', true),
    ),
  ];
  const log = {
    $schema: SCHEMA,
    version: '2.1.0',
    runs: [
      {
        originalUriBaseIds: { '%SRCROOT%': { uri: directoryUri(repoRoot) } },
        tool: {
          driver: {
            name: 'nuxt-layerscope',
            version: packageVersion(),
            informationUri: SITE,
            rules: RULES.map(rule => ({
              id: rule,
              shortDescription: { text: DESCRIPTIONS[rule] },
              helpUri: `${SITE}reference/rules#${rule}`,
              defaultConfiguration: { level: LEVELS[ruleSeverity(result.config, rule)] },
            })),
          },
        },
        results,
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
