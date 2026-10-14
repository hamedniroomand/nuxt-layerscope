import { recordedComponents } from '#src/registry/component-files.ts';
import type {
  RegistryComponent,
  RegistryComponentDir,
  ShadowedComponent,
} from '#src/registry/schema.ts';
import { compareStrings } from '#src/utils/strings.ts';

import type { ComponentsDir } from './nuxt.ts';

// Same defaults as Nuxt's components module.
const COMPONENT_IGNORE = [
  '**/*{M,.m,-m}ixin.{js,ts,jsx,tsx}',
  '**/*.{d.ts,d.mts,d.cts,d.vue.ts,d.vue.mts,d.vue.cts}',
];

function withoutDot(extension: string): string {
  return extension.replace(/^\./u, '');
}

/** The component dirs with the glob that Nuxt scans them with, and the files that it matches. */
export async function recordComponentDirs(
  dirs: ComponentsDir[],
  extensions: string[],
): Promise<RegistryComponentDir[]> {
  const jobs = dirs.map(async dir => {
    const exts = (dir.extensions ?? extensions).map(ext => withoutDot(ext));
    const pattern =
      dir.pattern ?? (exts.length > 1 ? `**/*.{${exts.join(',')}}` : `**/*.${exts[0] ?? '*'}`);
    const ignore = [...COMPONENT_IGNORE, ...(dir.ignore ?? [])];
    const files = await recordedComponents(dir.path, pattern, ignore);
    return { path: dir.path, pattern, ignore, files };
  });
  const recorded = await Promise.all(jobs);
  return recorded;
}

/** The scanned components that Nuxt did not register, each with the file that won. */
export function shadowedBy(
  scanned: RegistryComponent[],
  registered: RegistryComponent[],
): ShadowedComponent[] {
  const files = new Set(registered.map(component => component.file));
  const shadowed = scanned
    .filter(component => !files.has(component.file))
    .flatMap(component => {
      // Nuxt replaces a component of the same name whose mode is `all` or the same.
      const winner = registered.find(
        other =>
          other.name === component.name &&
          (other.mode === 'all' || component.mode === 'all' || other.mode === component.mode),
      );
      return winner === undefined ? [] : [{ ...component, shadowedBy: winner.file }];
    });
  return shadowed.toSorted((a, b) => compareStrings(a.file, b.file));
}
