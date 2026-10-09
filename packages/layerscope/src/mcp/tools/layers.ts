import { isScoped } from '#src/config/allow.ts';
import { describePreset } from '#src/config/presets.ts';
import { DEFAULT_SEVERITY, ruleSeverity } from '#src/config/rules.ts';
import { layerStats } from '#src/devtools/stats.ts';
import type { Tool } from '#src/mcp/types.ts';
import type { RuleName } from '#src/types.ts';

export const layersTool: Tool = {
  name: 'layers',
  title: 'List the layers',
  description:
    'The layers of the project, what each one may use (`allow`: null means unrestricted), what ' +
    'it makes public (`expose`: null means all of it), the rule severities, and the preset (null ' +
    'without one) with the base layers that it picked.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  outputSchema: {
    type: 'object',
    required: ['layers', 'rules'],
    properties: {
      layers: { type: 'array' },
      rules: { type: 'object' },
    },
  },
  async run(_args, session) {
    const result = await session.result();
    const { config } = result;
    const layers = layerStats(result).map(stat => {
      const rule = config.layers?.[stat.name];
      return {
        name: stat.name,
        root: stat.root,
        files: stat.files,
        refsIn: stat.refsIn,
        refsOut: stat.refsOut,
        allow: rule?.allow?.map(entry => (isScoped(entry) ? entry : { layer: entry })) ?? null,
        expose: rule?.expose ?? null,
      };
    });
    const rules = Object.fromEntries(
      (Object.keys(DEFAULT_SEVERITY) as RuleName[]).map(rule => [rule, ruleSeverity(config, rule)]),
    );
    return { layers, preset: describePreset(config, result.layers), rules };
  },
};
