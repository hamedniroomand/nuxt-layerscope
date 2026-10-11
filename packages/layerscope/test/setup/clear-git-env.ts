import { LOCAL_GIT_ENV } from '#src/utils/git.ts';

// A git hook sets these. Test helpers that run `git commit` in a temp dir would write into the
// repository of the hook, so no test may see them.
for (const name of LOCAL_GIT_ENV) {
  Reflect.deleteProperty(process.env, name);
}
