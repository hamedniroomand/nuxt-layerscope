import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { unusedView } from '#src/devtools/views-api.ts';
import { findBlindSpots } from '#src/unused/blind-spots.ts';

import { writeProject } from './unused-extra-project.ts';
import { outsideProject } from './unused-outside-project.ts';

describe('the Unused view with a layer outside the project root', () => {
  it('gives both lines, the outside-root row and the scoped empty sentence', async () => {
    const root = outsideProject(
      {
        '../packages/ui/app/composables/useUiCaller.ts':
          'export const useUiCaller = () => useLocalUnused();\n',
      },
      { useUiCaller: '../packages/ui/app/composables/useUiCaller.ts' },
    );
    const view = await unusedView(await analyze({ rootDir: root, extraFiles: true }));
    expect(view.blindSpotLines).toEqual([
      'Not counted as uses: test files.',
      'Not listed (layers outside the project root): ui.',
    ]);
    expect(view.blindSpots).toContainEqual({ kind: 'outside-root', layers: ['ui'] });
    expect(view.emptyLine).toBe('No unused symbol found in the listed layers.');
  });
});

describe('a layer in a hoisted node_modules outside the project root', () => {
  it('gives package-layers only, not outside-root', async () => {
    const root = writeProject(
      { '../node_modules/ui/app/composables/useUi.ts': 'export const useUi = () => 1;\n' },
      {},
      "{ layers: { ui: { path: '../node_modules/ui' } } }",
      {},
      true,
    );
    const result = await analyze({ rootDir: root });
    expect(findBlindSpots(result).map(spot => spot.kind)).toEqual(['test-files', 'package-layers']);
  });
});
