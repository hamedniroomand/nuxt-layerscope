import { join } from 'pathe';
import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { collectFiles, isCheckedFile } from '#src/analyze/files.ts';
import { analyze } from '#src/analyze/index.ts';
import { createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { resolveLayers } from '#src/nuxt/layers.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { OutputFormat } from '#src/report/index.ts';
import { formatResult, OUTPUT_FORMATS } from '#src/report/index.ts';
import { findUnused } from '#src/unused/index.ts';

import type { OutsideServerProject } from './outside-server-project.ts';
import { createOutsideServerProject, writeOutsideRegistry } from './outside-server-project.ts';

/** `check`, `unused` and the plugins on a project whose `serverDir` is `../api`. */
let project: OutsideServerProject;

beforeAll(() => {
  project = createOutsideServerProject();
});

describe('a serverDir outside the project root: check', () => {
  it('reports a boundary violation in a file of that dir', async () => {
    const result = await analyze({ rootDir: project.root });
    expect(result.files).toContain(project.files.violation);
    expect(
      result.findings.filter(finding => finding.file === project.files.violation),
    ).toMatchObject([{ rule: 'layer-boundary', fromLayer: 'root', toLayer: 'shop' }]);
  });

  it('counts an import of a file in that dir as an import of the root layer', async () => {
    const result = await analyze({ rootDir: project.root });
    expect(
      result.findings.filter(finding => finding.file === project.files.shopImport),
    ).toMatchObject([{ rule: 'layer-boundary', fromLayer: 'shop', toLayer: 'root' }]);
  });

  it('checks a file of that dir that is given by its path', async () => {
    const result = await analyze({ rootDir: project.root, only: [project.files.violation] });
    expect(result.findings.map(finding => finding.file)).toEqual([project.files.violation]);
  });

  it('gives collectFiles and isCheckedFile the same answer for the files of that dir', async () => {
    const layers = await resolveLayers(project.root, {});
    const collected = await collectFiles(layers, createOwnerLookup(layers), []);
    const root = layers.find(layer => layer.name === 'root');
    for (const file of [project.files.violation, project.files.helper]) {
      expect(collected.get(file)?.name, file).toBe('root');
      expect(root && isCheckedFile(file, root, []), file).toBe(true);
    }
  });
});

describe('a serverDir outside the project root: baseline and reports', () => {
  it('keys the findings by a path with a leading ../ and the baseline accepts them', async () => {
    const result = await analyze({ rootDir: project.root });
    const baseline = createBaseline(result.findings, project.root);
    expect(baseline.entries.map(entry => entry.file)).toContain('../api/utils/x.ts');
    writeBaseline(join(project.root, 'layerscope-baseline.json'), baseline);
    const accepted = await analyze({ rootDir: project.root, baseline: 'layerscope-baseline.json' });
    expect(accepted.findings).toEqual([]);
    expect(accepted.baseline?.suppressed).toHaveLength(2);
  });

  /** The path of the violation, as each format writes it. */
  function pathIn(format: OutputFormat, text: string): string | undefined {
    const first = <T>(items: T[]): T | undefined => items.at(0);
    if (format === 'text') {
      return text.split('\n').find(line => line.endsWith('x.ts'));
    }
    if (format === 'github') {
      return /file=([^,]*x\.ts),/u.exec(text)?.[1];
    }
    const data: unknown = JSON.parse(text);
    if (format === 'json') {
      const { findings } = data as { findings: { file: string }[] };
      return findings.find(finding => finding.file.endsWith('x.ts'))?.file;
    }
    if (format === 'gitlab') {
      const issues = data as { location: { path: string } }[];
      return issues.map(issue => issue.location.path).find(path => path.endsWith('x.ts'));
    }
    const { runs } = data as {
      runs: {
        results: { locations: { physicalLocation: { artifactLocation: { uri: string } } }[] }[];
      }[];
    };
    const uris = (first(runs)?.results ?? []).flatMap(result =>
      result.locations.map(location => location.physicalLocation.artifactLocation.uri),
    );
    return uris.find(uri => uri.endsWith('x.ts'));
  }

  it.each(OUTPUT_FORMATS)(
    'writes the path of the file as ../api/utils/x.ts in the %s report',
    async format => {
      const result = await analyze({ rootDir: project.root });
      expect(pathIn(format, formatResult(result, format, project.root))).toBe('../api/utils/x.ts');
    },
  );
});

describe('a serverDir outside the project root: unused', () => {
  it('lists an auto-import of that dir that nothing uses, and not one that is used', async () => {
    await writeOutsideRegistry(project, [
      { name: 'srvUsed', from: project.files.helper },
      { name: 'srvUnused', from: project.files.unusedHelper },
    ]);
    const result = await analyze({ rootDir: project.root, source: 'registry' });
    const names = findUnused(result).map(item => item.name);
    expect(names).toContain('srvUnused');
    expect(names).not.toContain('srvUsed');
  });
});
