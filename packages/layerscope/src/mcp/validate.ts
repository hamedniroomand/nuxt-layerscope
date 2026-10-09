import type { Schema } from './types.ts';

function typeError(path: string, expected: string): string {
  return `${path} must be ${expected}`;
}

function checkInteger(schema: Schema, value: unknown, path: string): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return typeError(path, 'an integer');
  }
  const low = schema.minimum !== undefined && value < schema.minimum;
  const high = schema.maximum !== undefined && value > schema.maximum;
  return low || high
    ? `${path} must be between ${schema.minimum ?? '-∞'} and ${schema.maximum ?? '∞'}`
    : null;
}

function checkScalar(schema: Schema, value: unknown, path: string): string | null {
  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      return typeError(path, 'a string');
    }
    return schema.enum !== undefined && !schema.enum.includes(value)
      ? `${path} must be one of ${schema.enum.join(', ')}`
      : null;
  }
  if (schema.type === 'boolean') {
    return typeof value === 'boolean' ? null : typeError(path, 'a boolean');
  }
  return schema.type === 'integer' ? checkInteger(schema, value, path) : null;
}

type Check = (schema: Schema, value: unknown, path: string) => string | null;

function checkObject(schema: Schema, value: unknown, path: string, check: Check): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return typeError(path === '' ? 'arguments' : path, 'an object');
  }
  const record = value as Record<string, unknown>;
  const properties = schema.properties ?? {};
  const missing = (schema.required ?? []).find(key => record[key] === undefined);
  if (missing !== undefined) {
    return `${missing} is required`;
  }
  const unknown = Object.keys(record).find(key => !Object.hasOwn(properties, key));
  if (unknown !== undefined && schema.additionalProperties === false) {
    return `unknown argument "${unknown}"; the arguments are ${Object.keys(properties).join(', ') || 'none'}`;
  }
  for (const [key, child] of Object.entries(properties)) {
    const error = record[key] === undefined ? null : check(child, record[key], key);
    if (error !== null) {
      return error;
    }
  }
  return null;
}

function checkArray(schema: Schema, value: unknown, path: string, check: Check): string | null {
  if (!Array.isArray(value)) {
    return typeError(path, 'an array');
  }
  const items = schema.items;
  const bad = items === undefined ? -1 : value.findIndex(item => check(items, item, path) !== null);
  return bad === -1 ? null : `${path}[${bad}] must be a string`;
}

function validate(schema: Schema, value: unknown, path: string): string | null {
  if (schema.type === 'object') {
    return checkObject(schema, value, path, validate);
  }
  return schema.type === 'array'
    ? checkArray(schema, value, path, validate)
    : checkScalar(schema, value, path);
}

/** The message of the first problem in the arguments of a tool call, or `null` when they fit. */
export function validateArgs(schema: Schema, args: unknown): string | null {
  return validate(schema, args ?? {}, '');
}
