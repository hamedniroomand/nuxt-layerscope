import { relative } from 'pathe';

import { summarize } from '#src/report/summary.ts';
import type { AnalyzeResult, Finding } from '#src/types.ts';
import { plural } from '#src/utils/strings.ts';

import { escapeHtml } from './html.ts';
import { PAGE_SCRIPT, PAGE_STYLE } from './page-assets.ts';

export interface PageInput {
  result: AnalyzeResult;
  /** Vite's open-in-editor endpoint, such as `/_nuxt/__open-in-editor`. */
  openInEditor: string;
}

function fileLink(file: string, line: number, column: number, input: PageInput): string {
  const label = `${relative(input.result.rootDir, file)}:${line}:${column}`;
  const target = escapeHtml(`${file}:${line}:${column}`);
  return `<a href="#" data-open="${target}">${escapeHtml(label)}</a>`;
}

function layersTable(input: PageInput): string {
  const rows = input.result.layers.map(layer => {
    const allow = input.result.config.layers?.[layer.name]?.allow;
    const allowed =
      allow === undefined ? '<em>unrestricted</em>' : escapeHtml(allow.join(', ') || '—');
    const root = relative(input.result.rootDir, layer.root) || '.';
    return `<tr><td>${escapeHtml(layer.name)}</td><td><code>${escapeHtml(root)}</code></td><td>${allowed}</td></tr>`;
  });
  return `<table><thead><tr><th>Layer</th><th>Root</th><th>May depend on</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function findingItem(finding: Finding, input: PageInput): string {
  const target =
    finding.target === null
      ? ''
      : `<div class="target">→ ${fileLink(finding.target, 1, 1, input)}</div>`;
  return `<li class="${finding.severity}"><span class="badge">${finding.severity}</span> ${escapeHtml(finding.message)} <span class="rule">${finding.rule}</span><div>${fileLink(finding.file, finding.line, finding.column, input)}</div>${target}</li>`;
}

function findingsList(input: PageInput): string {
  const { findings } = input.result;
  if (findings.length === 0) {
    return '<p class="ok">✔ No problems</p>';
  }
  return `<ul class="findings">${findings.map(finding => findingItem(finding, input)).join('')}</ul>`;
}

function summaryLine(result: AnalyzeResult): string {
  const { errors, warnings } = summarize(result.findings);
  const source = result.source === 'registry' ? 'module registry' : 'generated .d.ts files';
  return `${plural(result.files.length, 'file')} in ${plural(result.layers.length, 'layer')} · ${plural(errors, 'error')}, ${plural(warnings, 'warning')} · symbols from the ${source}`;
}

function document(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>layerscope</title><style>${PAGE_STYLE}</style></head><body>${body}<script>${PAGE_SCRIPT}</script></body></html>`;
}

/** The DevTools tab: layers, their allowed dependencies and current findings. */
export function renderPage(input: PageInput): string {
  const notes = input.result.notes.map(note => `<p class="note">${escapeHtml(note)}</p>`).join('');
  return document(
    `<header><h1>layerscope</h1><button data-reload>Re-run</button></header><p class="summary">${summaryLine(input.result)}</p>${notes}<h2>Layers</h2>${layersTable(input)}<h2>Findings</h2>${findingsList(input)}<template id="open-endpoint">${escapeHtml(input.openInEditor)}</template>`,
  );
}

export function renderError(message: string): string {
  return document(
    `<header><h1>layerscope</h1><button data-reload>Re-run</button></header><p class="error-message">${escapeHtml(message)}</p>`,
  );
}
