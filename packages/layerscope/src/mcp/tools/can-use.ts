import { contextOf } from '#src/analyze/files.ts';
import { fullLayers, scopedEntries } from '#src/config/allow.ts';
import type { ProjectSession } from '#src/mcp/session.ts';
import { ToolError } from '#src/mcp/types.ts';
import type { Tool } from '#src/mcp/types.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { SymbolTarget } from '#src/nuxt/symbols.ts';
import { edgeStatus } from '#src/rules/edge-status.ts';
import { componentName } from '#src/rules/exposure.ts';
import type { AllowEntry, AnalyzeResult, Context, Edge, Layer, ScopedAllow } from '#src/types.ts';

const CONTEXTS: Context[] = ['app', 'server', 'shared'];

/** Every status a result can have; the same words as `why` and the graph use, plus `partial`. */
const STATUSES = [
  'same-layer',
  'external',
  'unrestricted',
  'allowed',
  'partial',
  'not-allowed',
  'not-exposed',
] as const;

interface From {
  layer: Layer;
  file: string | null;
}

function layerNamed(result: AnalyzeResult, name: string): Layer | undefined {
  return result.layers.find(layer => layer.name === name);
}

function resolveFrom(input: string, result: AnalyzeResult, session: ProjectSession): From {
  const named = layerNamed(result, input);
  if (named !== undefined) {
    return { layer: named, file: null };
  }
  const file = session.resolveFile(input, result.layers);
  const layer = createOwnerLookup(result.layers)(file);
  if (layer === null) {
    const known = result.layers.map(candidate => candidate.name).join(', ');
    throw new ToolError(`"${input}" is not a layer or a file in a layer. Layers: ${known}`);
  }
  return { layer, file };
}

interface Found {
  kind: 'component' | 'auto-import';
  target: SymbolTarget;
}

function findSymbol(name: string, from: From, result: AnalyzeResult): Found | undefined {
  const wanted = componentName(name);
  for (const [key, target] of result.symbols.components) {
    if (componentName(key) === wanted) {
      return { kind: 'component', target };
    }
  }
  const contexts = from.file === null ? CONTEXTS : [contextOf(from.file, from.layer)];
  for (const context of contexts) {
    const target = result.symbols.imports[context].get(name);
    if (target !== undefined) {
      return { kind: 'auto-import', target };
    }
  }
  return undefined;
}

function reasonOf(status: string, edge: Edge, result: AnalyzeResult): string {
  const { fromLayer, toLayer } = edge;
  const allow = result.config.layers?.[fromLayer]?.allow;
  const expose = result.config.layers?.[toLayer ?? '']?.expose;
  switch (status) {
    case 'same-layer':
      return 'Same layer: always allowed.';
    case 'external':
      return 'A package or a virtual module: always allowed.';
    case 'unrestricted':
      return `Layer "${fromLayer}" has no allow list, so it may use every layer.`;
    case 'allowed':
      return `Layer "${fromLayer}" may use layer "${toLayer}".`;
    case 'not-exposed':
      return `Layer "${toLayer}" keeps "${edge.symbol}" internal: it exposes only ${(expose ?? []).join(', ') || 'nothing'}. Use one of those, or ask the owner of the layer. Do not widen expose or allow unless the user says the dependency is intended.`;
    default:
      return `Layer "${fromLayer}" may not use layer "${toLayer}": its allow list is ${
        allow?.length === 0 ? 'empty' : JSON.stringify(allow)
      }. Move the symbol to a layer both may use, or ask the user before changing allow.`;
  }
}

type LayerStatus = 'same-layer' | 'unrestricted' | 'allowed' | 'partial' | 'not-allowed';

function layerStatus(
  same: boolean,
  allow: AllowEntry[] | undefined,
  toName: string,
  scoped: ScopedAllow | undefined,
): LayerStatus {
  if (same) {
    return 'same-layer';
  }
  if (allow === undefined) {
    return 'unrestricted';
  }
  if (fullLayers(allow).includes(toName)) {
    return 'allowed';
  }
  return scoped === undefined ? 'not-allowed' : 'partial';
}

function layerReason(
  status: LayerStatus,
  from: string,
  toName: string,
  scoped: ScopedAllow | undefined,
  exposed: string[] | null,
): string {
  const only = exposed === null ? '' : `, but only what it exposes: ${exposed.join(', ')}`;
  const reasons: Record<LayerStatus, string> = {
    'same-layer': 'Same layer: always allowed.',
    unrestricted: `Layer "${from}" has no allow list, so it may use every layer${only}.`,
    allowed: `Layer "${from}" may use layer "${toName}"${only}.`,
    partial: `Layer "${from}" may use only ${scoped?.only.join(', ') ?? ''} from layer "${toName}".`,
    'not-allowed': `Layer "${from}" may not use layer "${toName}". Ask the user before changing allow.`,
  };
  return reasons[status];
}

function checkLayer(from: From, toName: string, result: AnalyzeResult): object {
  if (layerNamed(result, toName) === undefined) {
    throw new ToolError(`"${toName}" is not a layer or a known symbol.`);
  }
  const allow = result.config.layers?.[from.layer.name]?.allow;
  const scoped = scopedEntries(allow ?? []).find(entry => entry.layer === toName);
  const exposed = result.config.layers?.[toName]?.expose ?? null;
  const status = layerStatus(from.layer.name === toName, allow, toName, scoped);
  return {
    allowed: status === 'same-layer' || status === 'unrestricted' || status === 'allowed',
    status,
    reason: layerReason(status, from.layer.name, toName, scoped, exposed),
    from: { layer: from.layer.name, ...(from.file === null ? {} : { file: from.file }) },
    to: { layer: toName, kind: 'layer' },
    only: scoped?.only ?? null,
    exposed,
  };
}

export const canUseTool: Tool = {
  name: 'can_use',
  title: 'May this file or layer use that symbol or layer?',
  description:
    'Whether a layer, or the layer of a file, may use a layer or a symbol (an auto-import or a ' +
    'component), and why not. It applies the rules of `check`: `allow`, scoped `allow` and ' +
    '`expose`. Ask before you use a symbol from another layer.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['from', 'to'],
    properties: {
      from: { type: 'string', description: 'A layer name, or a path of a file in the project.' },
      to: { type: 'string', description: 'A layer name, or a symbol name.' },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['allowed', 'status', 'reason', 'from', 'to'],
    properties: {
      allowed: { type: 'boolean' },
      status: { type: 'string', enum: [...STATUSES] },
      reason: { type: 'string' },
      from: { type: 'object' },
      to: { type: 'object' },
    },
  },
  async run(args, session) {
    const result = await session.result();
    const from = resolveFrom(String(args.from), result, session);
    const to = String(args.to);
    const found = findSymbol(to, from, result);
    if (found === undefined) {
      return checkLayer(from, to, result);
    }
    const { target, kind } = found;
    const owner = target.file === null ? null : createOwnerLookup(result.layers)(target.file);
    const edge: Edge = {
      file: from.file ?? '',
      line: 1,
      column: 1,
      kind,
      symbol: to,
      fromLayer: from.layer.name,
      to: owner === null ? null : target.file,
      toLayer: owner?.name ?? null,
      external: owner === null ? (target.module ?? 'unknown') : null,
    };
    const status = edgeStatus(edge, result.config, result.layers);
    return {
      allowed: status !== 'not-allowed' && status !== 'not-exposed',
      status,
      reason: reasonOf(status, edge, result),
      from: {
        layer: from.layer.name,
        ...(from.file === null ? {} : { file: session.relative(from.file) }),
      },
      to: {
        layer: owner?.name ?? null,
        kind,
        symbol: to,
        ...(edge.to === null ? {} : { file: session.relative(edge.to) }),
      },
    };
  },
};
