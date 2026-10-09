import type { ProjectSession } from './session.ts';

/** A JSON Schema, the subset that the tools use and `validateArgs` checks. */
export interface Schema {
  type?: 'object' | 'string' | 'integer' | 'boolean' | 'array';
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
