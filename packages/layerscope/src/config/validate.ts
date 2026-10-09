import { LayerscopeError } from '#src/errors.ts';
import type { LayerscopeConfig } from '#src/types.ts';

import { isPreset } from './presets.ts';
import { isRuleName, RESERVED_RULES, SEVERITIES } from './rules.ts';

const SCOPED_KEYS = new Set(['layer', 'only']);

function isNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validateScoped(entry: unknown, where: string): void {
  const scoped = entry as Partial<Record<string, unknown>> | null;
  if (typeof scoped !== 'object' || scoped === null || Array.isArray(scoped)) {
    throw new LayerscopeError(
      `${where} must hold layer names and { layer, only } entries, got ${JSON.stringify(entry)}`,
    );
  }
  const unknown = Object.keys(scoped).find(key => !SCOPED_KEYS.has(key));
  if (unknown !== undefined) {
    throw new LayerscopeError(`${where}: unknown key "${unknown}" in a { layer, only } entry`);
  }
  if (typeof scoped.layer !== 'string') {
    throw new LayerscopeError(`${where}: a { layer, only } entry needs a layer name in "layer"`);
  }
  if (!isNames(scoped.only) || scoped.only.length === 0) {
    throw new LayerscopeError(
      `${where}: "only" of layer "${scoped.layer}" must be a non-empty array of names or globs`,
    );
  }
}

/** The same layer twice is fine as plain names; a scoped entry has to be the only one for it. */
function validateAllow(allow: unknown, where: string): void {
  if (allow === undefined) {
    return;
  }
  if (!Array.isArray(allow)) {
    throw new LayerscopeError(`${where} must be an array of layer names`);
  }
  const counts = new Map<string, { plain: number; scoped: number }>();
  for (const entry of allow as unknown[]) {
    if (typeof entry !== 'string') {
      validateScoped(entry, where);
    }
    const layer = typeof entry === 'string' ? entry : (entry as { layer: string }).layer;
    const count = counts.get(layer) ?? { plain: 0, scoped: 0 };
    count[typeof entry === 'string' ? 'plain' : 'scoped'] += 1;
    counts.set(layer, count);
  }
  for (const [layer, { plain, scoped }] of counts) {
    if (scoped > 1 || (scoped === 1 && plain > 0)) {
      throw new LayerscopeError(
        `${where}: layer "${layer}" is listed more than once with an "only" list; merge them into one entry`,
      );
    }
  }
}

function validateExpose(expose: unknown, where: string): void {
  if (expose !== undefined && !isNames(expose)) {
    throw new LayerscopeError(`${where} must be an array of names or globs`);
  }
}

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
    validateAllow(layer.allow, `${file}: layers.${name}.allow`);
    validateExpose(layer.expose, `${file}: layers.${name}.expose`);
    if (layer.path !== undefined && layer.source !== undefined) {
      throw new LayerscopeError(`${file}: layers.${name} sets both "path" and "source"; use one`);
    }
  }
}
