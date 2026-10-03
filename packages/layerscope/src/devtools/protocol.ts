import type { UnusedRow } from '#src/report/unused.ts';
import type { WhyReport } from '#src/report/why.ts';
import type { BaselineEntry, Context, Finding, Suggestion } from '#src/types.ts';

/** Copy-only fix for a boundary finding whose suggestion is to allow the target layer. */
export interface AllowHint {
  kind: 'allow';
  /** The layer whose `allow` list grows. */
  layer: string;
  /** The layer to add. */
  add: string;
  /** Findings the change clears, from the analyzer's suggestion. */
  resolves: number;
  /** Files those findings are in. */
  files: number;
  /** How many of them the baseline already suppresses. */
  baselined: number;
  /** The `layers.<layer>` entry of the config, with the layer added. */
  snippet: string;
}

/** A finding as the tab receives it: relative paths for display, absolute ones for the editor. */
export interface TabFinding extends Finding {
  absFile: string;
  absTarget: string | null;
  /** The baseline key: rule, relative file, symbol and target layer. Not unique per row. */
  key: string;
  /** Present beyond the count its key had when the marker was set. */
  isNew: boolean;
  hint?: AllowHint;
}

export interface HotFile {
  /** Relative to the project root. */
  file: string;
  absFile: string;
  errors: number;
  warnings: number;
}

export interface LayerStat {
  name: string;
  /** Relative to the project root; `.` for the root layer. */
  root: string;
  /** Layers this layer may depend on; `null` when unrestricted. */
  allow: string[] | null;
  files: number;
  /** References from other layers into this layer. */
  refsIn: number;
  /** References from this layer into other layers. */
  refsOut: number;
}

export interface TabReport {
  version: number;
  source: string;
  notes: string[];
  absRoot: string;
  layers: { name: string; root: string }[];
  summary: { files: number; errors: number; warnings: number };
  findings: TabFinding[];
  baseline?: { file: string; suppressed: Finding[]; removable: BaselineEntry[] };
  hotFiles: HotFile[];
  layerStats: LayerStat[];
  /** Findings new since the marker. */
  newCount: number;
}

export interface SnapshotMeta {
  id: string;
  rev: number;
  /** Changes when the "new since" marker moves. */
  marker: number;
  analyzedAt: number;
  durationMs: number;
}

export interface ReportResponse extends SnapshotMeta {
  report: TabReport;
}

/** Read by the client from the shell's `<template id="config">`. */
export interface ShellConfig {
  /** Base of the tab, such as `/__layerscope`. */
  base: string;
  /** Vite's open-in-editor endpoint, such as `/_nuxt/__open-in-editor`. */
  openInEditor: string;
}

export interface SymbolEntry {
  name: string;
  kind: 'component' | 'auto-import';
  /** Owning layer; `null` for packages and Nuxt itself. */
  layer: string | null;
  /** Auto-import contexts; empty for components. */
  contexts: Context[];
}

export type TraceView = WhyReport;

export interface UnusedView {
  unused: UnusedRow[];
  /** The project renders components chosen at runtime, so some may be used after all. */
  possiblyUsed: boolean;
  /** Layer order for grouping. */
  layers: string[];
}

export interface BaselineView {
  /** Relative to the project root; `null` when there is no baseline file. */
  file: string | null;
  suppressed: TabFinding[];
  removable: BaselineEntry[];
}

export type { Suggestion };
