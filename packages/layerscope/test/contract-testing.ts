/**
 * Core runtime that the DevTools client tests use to build real server data. Only client tests
 * can import it, through the `#contract-testing` alias.
 */
export { keyOf } from '#src/baseline/index.ts';
export { edgeView, graphView, nodeView } from '#src/devtools/graph-api.ts';
export { THEME_SCRIPT } from '#src/devtools/shell.ts';
export { makeEdge, makeFinding, makeLayer, makeResult } from '#test/factories.ts';
