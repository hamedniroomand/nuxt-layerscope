import { LayerscopeError } from '#src/errors.ts';
import type { LayerscopeConfig } from '#src/types.ts';

import { isPreset } from './presets.ts';
import { isRuleName, RESERVED_RULES, SEVERITIES } from './rules.ts';

export function validateConfig(config: LayerscopeConfig, file: string): void {
  if (config.preset !== undefined && !isPreset(config.preset)) {
    throw new LayerscopeError(`${file}: unknown preset "${String(config.preset)}"`);
  }
  for (const [rule, severity] of Object.entries(config.rules ?? {})) {
    if (!isRuleName(rule) && !RESERVED_RULES.has(rule)) {
      throw new LayerscopeError(`${file}: unknown rule "${rule}"`);
    }
    if (!SEVERITIES.has(String(severity))) {
      throw new LayerscopeError(
        `${file}: rule "${rule}" must be "off", "warn" or "error", got ${JSON.stringify(severity)}`,
      );
    }
  }
  for (const [name, layer] of Object.entries(config.layers ?? {})) {
    if (layer.allow !== undefined && !Array.isArray(layer.allow)) {
      throw new LayerscopeError(`${file}: layers.${name}.allow must be an array of layer names`);
    }
    if (layer.path !== undefined && layer.source !== undefined) {
      throw new LayerscopeError(`${file}: layers.${name} sets both "path" and "source"; use one`);
    }
  }
}
