import type { BaselineEntry, Finding, Suggestion } from '#src/types.ts';

/** A finding as the tab receives it: relative paths for display, absolute ones for the editor. */
export interface TabFinding extends Finding {
  absFile: string;
  absTarget: string | null;
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
}

export interface SnapshotMeta {
  id: string;
  rev: number;
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

export type { Suggestion };
