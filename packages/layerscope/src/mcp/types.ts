import type { ProjectSession } from './session.ts';

/** A JSON Schema, the subset that the tools use and `validateArgs` checks. */
type SchemaType = 'object' | 'string' | 'integer' | 'boolean' | 'array' | 'null';

export interface Schema {
  /** A list of types, such as `['object', 'null']`, says that the value can be any of them. */
  type?: SchemaType | SchemaType[];
  description?: string;
  enum?: string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean;
}

/** A failure that the assistant can read and act on: it becomes a result with `isError`. */
export class ToolError extends Error {}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  outputSchema: Schema;
  run: (args: Record<string, unknown>, session: ProjectSession) => Promise<object>;
}
