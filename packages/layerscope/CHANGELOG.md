# Changelog

## 0.10.0

### Minor Changes

- [#200](https://github.com/hamedniroomand/nuxt-layerscope/pull/200) [`6b193f4`](https://github.com/hamedniroomand/nuxt-layerscope/commit/6b193f4eed52d6245c7f57b1755a15bafc9c7143) - The action accepts growth on a pull request with the label `layerscope: accept growth`: the `fail-on-growth` step then passes with a notice. A push and a merge queue run do not read the label.

- [#199](https://github.com/hamedniroomand/nuxt-layerscope/pull/199) [`32b00e1`](https://github.com/hamedniroomand/nuxt-layerscope/commit/32b00e1a2f995e2d36b4b3e2d39afed28878d9d6) - Add `drift --fail-on-growth` and the action input `fail-on-growth`. They fail when the code has errors that the baseline on the base branch does not have, also when the pull request adds them to the baseline. Before, the drift report showed the growth but could not fail the job.

- [#185](https://github.com/hamedniroomand/nuxt-layerscope/pull/185) [`94a14f1`](https://github.com/hamedniroomand/nuxt-layerscope/commit/94a14f1bd452722cb28920318b0e89a716885695) - Add `check --strict-baseline` and the action input `strict-baseline`. They fail the check when the baseline has fixed entries, so a fixed violation cannot come back while its entry is still in the file. The message tells you to run `layerscope check --update-baseline`. Without the option, fixed entries are listed as before and do not fail the check.

### Patch Changes

- [#184](https://github.com/hamedniroomand/nuxt-layerscope/pull/184) [`dc0f0f9`](https://github.com/hamedniroomand/nuxt-layerscope/commit/dc0f0f931c1c3bd8ea9b541c4d916a7a7f762205) - Arguments after `--` are used as positional arguments, for example a root that starts with `-`. Before, layerscope ignored them. A command line that has words after `--` can now stop with an error, or `check` can read them as the root and the files. Remove the words that are not a root or a file.

- [#195](https://github.com/hamedniroomand/nuxt-layerscope/pull/195) [`14fb71c`](https://github.com/hamedniroomand/nuxt-layerscope/commit/14fb71cfeefb7eb6bd3ec260b628da402c516442) - `drift` follows the tracked files that git renames between the base ref and the working tree. A renamed file with accepted violations no longer counts as added and fixed. A new violation in it still counts as added. `drift` follows a rename only when git finds at least 50% of the file the same, or 30% when the file moves to the same place in another layer, as `fix` moves it. So an unrelated file at the same place in another layer can take the accepted entries of a deleted file that name no target layer, such as `unresolved-reference` entries. `drift` also finds a renamed baseline file in the root at its old path on the base ref. A copy, a move to another layer for a finding that names a target layer, a rename that git does not find, an alias import of a renamed file, and a relative import that is not in the form that `fix` writes still count as added and fixed. If git fails while it lists the renames, `drift` stops with exit code `2`.

- [#189](https://github.com/hamedniroomand/nuxt-layerscope/pull/189) [`7b48459`](https://github.com/hamedniroomand/nuxt-layerscope/commit/7b48459a3ba117cfe718523c8794ae60edb283a8) - The `fix` line about other findings no longer says that they have suggestions. Some findings have none, for example `unresolved-reference`, `shadowed-component` and `layer-cycle`. The line now ends with "Run `layerscope check` to see them."

- [#194](https://github.com/hamedniroomand/nuxt-layerscope/pull/194) [`2e3737c`](https://github.com/hamedniroomand/nuxt-layerscope/commit/2e3737c36e3181dd302e7888b3f64312b142835a) - `init` counts code that it cannot read apart from unresolved references. JSON findings for such code have `unread: true`.

- [#198](https://github.com/hamedniroomand/nuxt-layerscope/pull/198) [`749a76d`](https://github.com/hamedniroomand/nuxt-layerscope/commit/749a76d4f9a7e6253fcff18f8e39760093b35be9) - `layerscope init` says "No references found." when the project has no references. Before, it said "All 0 references resolved."

- [#197](https://github.com/hamedniroomand/nuxt-layerscope/pull/197) [`41e4448`](https://github.com/hamedniroomand/nuxt-layerscope/commit/41e4448fb49af73cf1149d23e76d63ad80a962a5) - When layerscope drops a planned move, the "leave" suggestion of its findings no longer says that no layer can hold the file. It says that the plan drops the move.

- [#201](https://github.com/hamedniroomand/nuxt-layerscope/pull/201) [`059b3a0`](https://github.com/hamedniroomand/nuxt-layerscope/commit/059b3a03ca82453db6e2f1a171bc263538791939) - `fix` and the move suggestions of `check` read the names of a file with mlly, the parser that Nuxt uses. Type exports (`export type`, `export interface`) and `export * as name` are names, and so are the other forms that Nuxt reads, for example `export const a = 1, b = 2`. A relative `export * from` is read. An `export * from` a package or an alias, or one whose path does not resolve, can export any name, so it conflicts with any auto-import on the other side of a move. A default export keeps the case of its file name, unless the name has `-`, `_` or `.`. The `.tsx`, `.jsx`, `.cts` and `.cjs` files in the target are read too, and so are the server utils in sub dirs of the target, as Nitro reads them.

- [#193](https://github.com/hamedniroomand/nuxt-layerscope/pull/193) [`16e427e`](https://github.com/hamedniroomand/nuxt-layerscope/commit/16e427eac56fcf26eed42a1292f7066d268ce70b) - The `fix` note about the files that `check` and `fix` skip now says that they do not check the imports in these files. Before, it said that they do not read them, but layerscope loads `nuxt.config.*` to find the layers.

- [#196](https://github.com/hamedniroomand/nuxt-layerscope/pull/196) [`06e47cc`](https://github.com/hamedniroomand/nuxt-layerscope/commit/06e47cc36cdb0ff9777b23868b2ffc4d073fe7a9) - `fix` keeps a name with a dot when it rewrites an import to a file that it found through a symbolic link, or with a name in another letter case. Before, the end of the name was added again: `./x.module` for `x.module.ts` got `x.module.module`, and `./lib.v2` for `lib.v2/index.ts` got `lib.v2/index.v2`.

- [#190](https://github.com/hamedniroomand/nuxt-layerscope/pull/190) [`9d5536b`](https://github.com/hamedniroomand/nuxt-layerscope/commit/9d5536b0bfd3defcfbb9c54e4949df8c248e8ed7) - `check` reads `import()` in a template. An `import()` with a fixed path is now an import, so it can give `layer-boundary` findings and it counts as a use in `unused` and `why`. An `import()` with a path that is not a fixed string is reported by `unresolved-reference`, and `unused` lists the file as unread.

- [#188](https://github.com/hamedniroomand/nuxt-layerscope/pull/188) [`dc0de58`](https://github.com/hamedniroomand/nuxt-layerscope/commit/dc0de581c760dd204753f1351ce4d9fae53f1837) - The DevTools Unused view shows the "possibly used" banner only when it lists a component.

- [#180](https://github.com/hamedniroomand/nuxt-layerscope/pull/180) [`eb4b360`](https://github.com/hamedniroomand/nuxt-layerscope/commit/eb4b360f5d51d7af4b552c3cca7ae67c1da357ca) - `unused` marks global components "possibly used at runtime". When the project uses Nuxt Content, which can render any component by its name from a content file, `unused` marks every component. Each unused entry has a new `global` field, and `blindSpots` has a new `nuxt-content` kind. With `--source types`, `unused` finds only the `components/global/` dir and the `.global` suffix, and finds Nuxt Content only when `modules` names it as a string. The registry has new fields, so run `nuxi prepare` once after the update.

- [#186](https://github.com/hamedniroomand/nuxt-layerscope/pull/186) [`f49b9b3`](https://github.com/hamedniroomand/nuxt-layerscope/commit/f49b9b3899287446cb26b5c969f3ddd02ed10766) - `unused` shows the `shared` context for an auto-import in `shared/`. Before, it showed `app`. The DevTools Unused view shows each row as `layerscope unused` shows it, with `exposed` and "possibly used at runtime".

## 0.9.0

### Minor Changes

- [#175](https://github.com/hamedniroomand/nuxt-layerscope/pull/175) [`1a996f4`](https://github.com/hamedniroomand/nuxt-layerscope/commit/1a996f4b34fea16b58d89a28495ad94e2bdc8c43) - A new `baseline` key in `layerscope.config.ts` names the baseline file once. `check` (also with `--update-baseline`, `--summary` and `--watch`), `drift`, `fix`, `mcp` and the GitHub Action use it. `init --baseline` does not use it. The `--baseline` option and the `baseline` input of the action override it. The `baseline` input of the action now has no default value, so the key applies. `analyze()` accepts `baseline: true` for the file of the config.

- [#172](https://github.com/hamedniroomand/nuxt-layerscope/pull/172) [`f3e73b4`](https://github.com/hamedniroomand/nuxt-layerscope/commit/f3e73b42e7bdb83d1a7be5b861437539306660af) - `--config` is now relative to the project root, as `--baseline` is. Before, it was relative to the current directory. This changes a run with a root argument, for example `layerscope check apps/shop --config layerscope.config.ts`, and the `config` input of the GitHub Action with a `root` input. It applies to every command that takes `--config`, and `init` writes the file there. The `configFile` option of `analyze()` is now relative to `rootDir` too. An absolute path does not change.

### Patch Changes

- [#174](https://github.com/hamedniroomand/nuxt-layerscope/pull/174) [`052099f`](https://github.com/hamedniroomand/nuxt-layerscope/commit/052099fd4733434c3301330c484bc777476648a3) - Check a use of a component against each of its files when Nuxt keeps more than one file with the same name, for example `Pair.client.vue` in one layer and `Pair.server.vue` in another layer. Nuxt uses one file in the browser and one file on the server. Before, layerscope checked only one of the files, so a use of a layer that is not allowed could get no finding. `why`, `unused` and the DevTools trace now list each file. The `can_use` MCP tool answers with the first file that is not allowed. So `check` can report new findings after the update, also for a file that Nuxt does not use for a given use.

- [#177](https://github.com/hamedniroomand/nuxt-layerscope/pull/177) [`315779a`](https://github.com/hamedniroomand/nuxt-layerscope/commit/315779a4d568e8e3055929c7d07818522545593e) - Resolve more component uses as Nuxt does. These are now uses of the component: `resolveComponent()` with a template literal that has no `${}`, `resolveComponent()` with a kebab-case name such as `'cart-summary'`, and `h(CartSummary)` in a `.vue`, `.jsx` or `.tsx` file outside the `server/` dir, also when an import or a local binding has that name. Before, `unresolved-reference` reported the first two and an `h()` name with no binding as warnings, so a use of a layer that is not allowed got no `layer-boundary` finding.

- [#175](https://github.com/hamedniroomand/nuxt-layerscope/pull/175) [`1a996f4`](https://github.com/hamedniroomand/nuxt-layerscope/commit/1a996f4b34fea16b58d89a28495ad94e2bdc8c43) - The DevTools tab reads and writes the baseline file that the `baseline` key of `layerscope.config.ts` names. Before, the tab always wrote `layerscope-baseline.json`, so with another baseline file CI did not read what the tab wrote. The static snapshot of the tab uses the same file. Undo restores the file that the change wrote, also when the config names another file after the change.

- [#170](https://github.com/hamedniroomand/nuxt-layerscope/pull/170) [`a100d07`](https://github.com/hamedniroomand/nuxt-layerscope/commit/a100d076115ffdee91aa51c2110b8238f96b298a) - The stale check skips the new files that Nuxt ignores (`ignore`, `ignorePrefix` and `.nuxtignore`) in component dirs and in the auto-import dirs of the app. Before, a new test file such as `composables/useCart.spec.ts` stopped `check --watch` and the MCP server until `nuxi prepare`. Nitro auto-imports such files from its dirs, such as `server/utils` and `shared/utils`, so the check still reports them there. The registry has new fields, so run `nuxi prepare` once after the update.

- [#179](https://github.com/hamedniroomand/nuxt-layerscope/pull/179) [`6ebfb50`](https://github.com/hamedniroomand/nuxt-layerscope/commit/6ebfb5095c774d46faf748a6aeffa48eaaf3c7b5) - Fix two `unresolved-reference` messages. A component that Nuxt does not have is now `Nuxt has no component <X>`; before, the message named `components.d.ts` also when the source was the registry. A name that is an auto-import only in another context, or that is a component, now says so and no longer tells you to add it to `globals`, which would hide a real dependency.

- [#176](https://github.com/hamedniroomand/nuxt-layerscope/pull/176) [`ef84e57`](https://github.com/hamedniroomand/nuxt-layerscope/commit/ef84e57fb64f14967c3f72514b094097278f2681) - `unused` counts `<NuxtIsland name="X">` as a use of the island component `X`. Before, an island component that only `<NuxtIsland>` rendered was listed as unused. `<NuxtIsland :name>` and `resolveDynamicComponent(x)` with a value that is not a fixed string mark unused components as "possibly used at runtime". `check` also reads `<NuxtIsland name="X">`, so an island of another layer can give a `layer-boundary` finding. `check` sees this only with the registry, because the generated .d.ts files do not list island components.

- [#181](https://github.com/hamedniroomand/nuxt-layerscope/pull/181) [`38951c3`](https://github.com/hamedniroomand/nuxt-layerscope/commit/38951c339ecdaf33c418f502a1497df491bd2393) - `unused` and `check` read component tags in JSX (`.tsx` and `.jsx` files, and `<script lang="tsx">` and `<script lang="jsx">` blocks) outside the `server/` dir, such as `<CartBadge />` and `<cart-badge />`. Before, a component that only JSX used was listed as unused. A JSX tag that Nuxt has no component for now gives an `unresolved-reference` finding, as a template tag does.

## 0.8.1

### Patch Changes

- [#156](https://github.com/hamedniroomand/nuxt-layerscope/pull/156) [`fa655fc`](https://github.com/hamedniroomand/nuxt-layerscope/commit/fa655fc1f33f00479dbface661fa76f19a74cb21) - The stale check now stops with exit code 2 when it cannot open a component dir or an auto-import dir, for example because it has no read access, or cannot reach a file that the generated types refer to. Before, layerscope treated such a dir as empty, so it did not find a new component there and could use an old registry with no error. It also reported such a file as deleted. The message shows the path and the error code. A dir or file that does not exist is handled as before.

- [#161](https://github.com/hamedniroomand/nuxt-layerscope/pull/161) [`c4b1441`](https://github.com/hamedniroomand/nuxt-layerscope/commit/c4b1441a1ab609e14e9b36ed097b33b6c31be995) - `drift` now finds the `--baseline` file in the same way as `check`, so an absolute path and a path with backslashes now work. `drift` stops with exit code 2 and a message when the baseline is outside the git repository, or when the baseline is a symbolic link on the base ref. Before, `drift` counted the base as empty with no message, or said that the link is not valid JSON. On a file system that ignores case, `drift` now also finds a baseline file name in the wrong case.

- [#164](https://github.com/hamedniroomand/nuxt-layerscope/pull/164) [`31c3ecf`](https://github.com/hamedniroomand/nuxt-layerscope/commit/31c3ecf6d216727c6d507c0061262150a3c2d692) - `drift` now counts only the findings of rules that the current config sets to `error`. Before, `drift` counted a warning on the base as added on each pull request when the base baseline did not have it.

- [#165](https://github.com/hamedniroomand/nuxt-layerscope/pull/165) [`f437aac`](https://github.com/hamedniroomand/nuxt-layerscope/commit/f437aac628be34a216288137c6df689fe6f973a3) - Check an explicit import of an npm or workspace layer by its package name, for example `@acme/ui-layer/app/composables/useAcme`, and a `require()` of it. Before, such an import was always allowed. The import resolves to the file in the layer, with the `exports` of the layer's `package.json` when it has them. A path that the layer does not have or does not export is reported by `unresolved-reference`. An import of a layer by its package name that Node cannot find from the importing file is now reported by `unresolved-reference`. A layer with a `package.json` that exists but cannot be read, or that is not valid JSON, now stops the run with an error.

- [#166](https://github.com/hamedniroomand/nuxt-layerscope/pull/166) [`5b094c5`](https://github.com/hamedniroomand/nuxt-layerscope/commit/5b094c5f4ddf37b068ba681537d6454c2c5f8148) - Under `nuxi dev`, the module now writes the registry again after you add or delete a file, also when Nuxt does not generate its templates again, for example after you add a server util. Before, `check --watch` and the MCP server stopped with the stale error until `nuxi prepare` ran, and the DevTools tab kept the old symbols. After you delete a server util or remove its exports, the registry no longer lists its auto-imports.

- [#161](https://github.com/hamedniroomand/nuxt-layerscope/pull/161) [`c4b1441`](https://github.com/hamedniroomand/nuxt-layerscope/commit/c4b1441a1ab609e14e9b36ed097b33b6c31be995) - `check` reports (SARIF and GitLab), `drift` and `fix` now find the git repository when the name of its dir ends with a space.

- [#160](https://github.com/hamedniroomand/nuxt-layerscope/pull/160) [`a34fcfb`](https://github.com/hamedniroomand/nuxt-layerscope/commit/a34fcfb176e3e69d59096c7a8ebf1467f153087e) - `check --watch` and the MCP server now run the stale check on each run, not only when the generated files change. A new component or auto-import file, or a deleted one, now gives the stale error until `nuxi prepare` writes the generated files again. Under `nuxi dev`, the layerscope module writes the registry again after such a change. Before this change, `check --watch` and the MCP server kept the old symbol table with no error.

- [#163](https://github.com/hamedniroomand/nuxt-layerscope/pull/163) [`728c67d`](https://github.com/hamedniroomand/nuxt-layerscope/commit/728c67dfc5926e4dfc2667b5bde3f9c5aeba09e4) - `check --watch` now checks again after it starts to watch a layer dir outside the project root. A file saved in such a dir during the first check is now in the report. An error from the file watcher no longer stops the watch, also an error at the start for a dir that it cannot read. layerscope prints a warning, and the watch goes on.

## 0.8.0

### Minor Changes

- [#150](https://github.com/hamedniroomand/nuxt-layerscope/pull/150) [`6b98d05`](https://github.com/hamedniroomand/nuxt-layerscope/commit/6b98d05dfe636a45cc8876f30c636b1999be4a53) - The GitHub Action writes the findings of the check to the job summary, up to 200 findings, because GitHub shows at most 10 error and 10 warning annotations for each step. The new option `--summary <file>` of `check` writes that list. It works only with `--format github`.

- [#138](https://github.com/hamedniroomand/nuxt-layerscope/pull/138) [`6eb05c0`](https://github.com/hamedniroomand/nuxt-layerscope/commit/6eb05c0c34d5c1f1d00296378206858833ec8ea9) - `layerscope unused` now lists what it does not count. It lists each file that layerscope could not read in full: a parse error, an unread template, an `import()` or `require()` with a path that is not a fixed string, or an `import.meta.glob()`. When such a file exists, the report does not say that every symbol is referenced.

  The last line of the text report names the other uses that are not counted: test files, files that match `ignore`, and files in layers installed as packages. The JSON report has a new `blindSpots` field, and the DevTools Unused view shows the same data. `findBlindSpots` is a new export of `nuxt-layerscope/api`.

- [#142](https://github.com/hamedniroomand/nuxt-layerscope/pull/142) [`4a7fdc5`](https://github.com/hamedniroomand/nuxt-layerscope/commit/4a7fdc528188c9b09ed36810f7695cdb90a6918f) - `layerscope unused` counts more uses. It now counts the uses in `nuxt.config.*`, in the Nuxt `modules/` dir, in files of extra auto-import and component dirs, and in the project files that counted files import.
  A symbol that only one of these files uses is no longer listed as unused. `check`, `fix` and `why` do not change: they do not read these files.

  `analyze` has a new `extraFiles` option (default `false`) that turns this on for `unused` and the DevTools Unused view.

- [#146](https://github.com/hamedniroomand/nuxt-layerscope/pull/146) [`7ffda4e`](https://github.com/hamedniroomand/nuxt-layerscope/commit/7ffda4e3e3a936395d911fdfd8ac1abbf29e89c8) - `layerscope unused` does not list the symbols of a layer outside the project root that is not installed as a package, such as a workspace package, because another app can use them. The text report names these layers in a second line. When a layer is not listed, an empty list says "No unused symbol found in the listed layers." and not that every symbol is referenced.

  The JSON report has a new `outside-root` entry in `blindSpots`, and `findBlindSpots` returns the same new kind. The DevTools Unused view shows the same lines. In the view data, `blindSpotLine` is now `blindSpotLines`, a list.

- [#144](https://github.com/hamedniroomand/nuxt-layerscope/pull/144) [`3a97f57`](https://github.com/hamedniroomand/nuxt-layerscope/commit/3a97f5746f0d3b137b2658660263a7233736c902) - `layerscope unused` counts a `typeof x` in a type, such as `ReturnType<typeof useCart>`, and an `import type` when `typeImports` is `'ignore'`. `check` does not change.

### Patch Changes

- [#140](https://github.com/hamedniroomand/nuxt-layerscope/pull/140) [`4d69b7b`](https://github.com/hamedniroomand/nuxt-layerscope/commit/4d69b7bc647be8b4e49f4d5f5ac6d8a320782ec3) - The drift step of the GitHub Action no longer makes a shallow or full clone shallower. It now finds the base commit for pull requests, pushes and merge queues, and fetches it when the clone does not have it. If the event has no base commit, or the fetch fails, the step skips the report and prints a notice.

- [#143](https://github.com/hamedniroomand/nuxt-layerscope/pull/143) [`c56ab6b`](https://github.com/hamedniroomand/nuxt-layerscope/commit/c56ab6bcdfd2b0f951c6ad4c188c63113bce4d0d) - The drift comment of the GitHub Action now posts one comment for each root. Later runs update the comment that the same account wrote, so steps with different roots no longer overwrite each other, and the action no longer edits a comment that another account wrote. If drift fails, the comment says so. On a `pull_request` event from a fork, or when the action cannot post the comment, it prints a notice or a warning. A failed comment does not fail the step. A new `comment` output says what the action did.

- [#145](https://github.com/hamedniroomand/nuxt-layerscope/pull/145) [`29e516a`](https://github.com/hamedniroomand/nuxt-layerscope/commit/29e516ad8005e4e43dbcedabeeee3714aebd25af) - The GitHub Action runs the nuxt-layerscope version of its own release when the project does not install it, so a tag pins the CLI too. The step that posts the comment is separate from the steps that run the CLI, so the action does not give its token to the CLI.

- [#151](https://github.com/hamedniroomand/nuxt-layerscope/pull/151) [`d08d5dc`](https://github.com/hamedniroomand/nuxt-layerscope/commit/d08d5dcc8747ae8b36b121d8410d2212f3d7a254) - The stale check now finds a new auto-import file, such as a composable that overrides one of a lower layer. layerscope stops with exit code 2 and asks you to run "nuxi prepare" again. This check uses the registry of the module. The `types` source does not check auto-import files.

  The registry has a new `importDirs` field. A registry that an earlier release wrote does not have it. With `--source auto`, layerscope then falls back to the `.d.ts` files and prints a note. With `--source registry`, it stops with exit code 2. Run "nuxi prepare" again.

  When the module cannot read the auto-import dirs of Nuxt, it prints a warning with the reason and writes `importDirs: null`. Then layerscope prints a note and does not check auto-import files.

- [#139](https://github.com/hamedniroomand/nuxt-layerscope/pull/139) [`b218ee0`](https://github.com/hamedniroomand/nuxt-layerscope/commit/b218ee04b49ee9447b2f7fb672aee75ad1433ff6) - Fix path checks on case-insensitive file systems and on Windows. Layerscope now uses the real case of a path and forward slashes. `--prepare` now starts `npx` on Windows and shows the error when it cannot start.

- [#152](https://github.com/hamedniroomand/nuxt-layerscope/pull/152) [`00c2411`](https://github.com/hamedniroomand/nuxt-layerscope/commit/00c24114b5434af7c737491731ddef85fe0856d9) - `check --watch` uses the shared test for layers outside the project root, so a project root of `/` works.

## 0.7.0

### Minor Changes

- [#137](https://github.com/hamedniroomand/nuxt-layerscope/pull/137) [`91a4ae1`](https://github.com/hamedniroomand/nuxt-layerscope/commit/91a4ae171c6cf6a7de1ba1c65cfa51273ac32793) - `fix --apply` makes the planned moves. It uses `git mv` for a file that git tracks, and it rewrites the relative imports in the importers and in the moved file.

  Before the first change, it checks the plan again. It stops, and changes nothing, when:

  - the git working tree has changes or untracked files, or the root is not in a git repository;
  - git does not track a file to move or edit, or a file is in a submodule;
  - a file is marked assume-unchanged or skip-worktree, a target is outside the git repository or in another repository, or two moves have the same target;
  - a file or a target dir has a symbolic link in its path, or a file has more than one hard link;
  - a file to edit is not UTF-8 text, or is not what the plan says;
  - a target path exists, or two target paths differ only in letter case;
  - git would refuse a move, for example a target outside a sparse checkout.

  See the CLI reference for all checks.

  `--allow-dirty` skips the git checks (repository, clean tree, tracked files, submodules). If a step fails, `fix` stops and lists what is done and what is not. It then tells you to use `git status` and `git diff` to see the changes and git to undo them. `fix` needs one of `--dry-run` and `--apply`, not both. `--allow-dirty` works only with `--apply`. `fix` also counts the baseline entries that name a moved file, because they do not match after the move.

- [#125](https://github.com/hamedniroomand/nuxt-layerscope/pull/125) [`78508c0`](https://github.com/hamedniroomand/nuxt-layerscope/commit/78508c0aff89ab74a9d33a2041f61a76e057483a) - `fix` plans moves that you can trust more. The root layer can be a move target. A target must permit every user and each dependency of the file, with `allow` and `expose`. The new path is checked: no file is there, no other move uses it, and Nuxt finds the file there. A move that breaks `check` together with another move is dropped. `fix` lists only the imports that change, and keeps the extension, the query and the `index` style of each specifier. It uses the baseline, and it has the new `--baseline` option. The footer says to run `layerscope check --prepare`, and one line counts the findings that have no move. The SARIF and GitLab reports now have the suggestion of each finding. The `leave` suggestion for a use of a feature layer by `root` says to change the code.

- [#122](https://github.com/hamedniroomand/nuxt-layerscope/pull/122) [`ca4f916`](https://github.com/hamedniroomand/nuxt-layerscope/commit/ca4f91656553d1e18488d40b5721d33c6b247b38) - check now reads TypeScript syntax in a template when the component has a TypeScript script. It reports code that it cannot read as unresolved-reference findings: a template that it cannot parse, a template with a lang other than HTML or with src, a dynamic import() or require(), and import.meta.glob(). It no longer drops this code silently. An import() or require() with a template literal that has no ${} is now read as a fixed path, so it can give new layer-boundary findings.

- [#128](https://github.com/hamedniroomand/nuxt-layerscope/pull/128) [`3fc449a`](https://github.com/hamedniroomand/nuxt-layerscope/commit/3fc449aad7e6714f628a583c5d60cc542c4b89c8) - layerscope now checks files in dirs named `modules` that are not the Nuxt modules dir, for example `app/modules/` in Nuxt 4 and `server/modules/`. Before, it skipped a `modules/` or `public/` dir at the top of each scanned dir. Now it skips only the `modules` and `public` dirs that Nuxt uses for each layer (`dir.modules` and `dir.public`). A `layerscope.config.*` file is now skipped only in the layer root, so such a file in `app/` or `server/` is checked. layerscope can report new findings in these dirs, for example layer-boundary and unused findings. Review them, or update your baseline.

  `registry.json` now stores the `modules` and `public` dirs of each layer. Run `nuxi prepare` once after you update. Until then, `check` and `unused` read the generated `.d.ts` files, `--source registry` stops with an error, and the ESLint and oxlint plugins do not load the project.

- [#134](https://github.com/hamedniroomand/nuxt-layerscope/pull/134) [`c727c6d`](https://github.com/hamedniroomand/nuxt-layerscope/commit/c727c6d8ca6d3888862fec8f1c97b68948fcfdbe) - layerscope now checks the files in a `serverDir`, `srcDir` or shared dir outside the layer root, for example `serverDir: '../api'`. Before, `check`, `unused` and the ESLint and oxlint plugins skipped them with no note. An import of such a file counted as an import from outside every layer. layerscope can report new findings in these files, for example layer-boundary and unused findings. Review them, or update your baseline. `check --watch` now also watches such a dir.

  A file outside the project root has a path that starts with `../` in reports and in the baseline. For a file outside its layer root, the path that the `only` and `expose` globs match starts with `../` too, for example `../api/utils/**`. A source dir that is outside its layer root but inside the project root now belongs to its layer, not to the root layer. In ESLint and oxlint, set the `root` option for files outside the project root.

- [#124](https://github.com/hamedniroomand/nuxt-layerscope/pull/124) [`92ff133`](https://github.com/hamedniroomand/nuxt-layerscope/commit/92ff13379742ac5f814508ce835e4c7362f3e512) - A baselined layer cycle now stays accepted when the file of its first use changes. This is the case when you delete that file, or add a use in a file that sorts earlier. A `layer-cycle` entry in the baseline now matches by its chain of layers, not by its file. Old baselines still match, with one exception. layerscope now picks the cycle in a fixed way. When two cycles of the same length go through one layer, it always shows the same one. In that case layerscope can report a baselined cycle as new once after the upgrade. Run `layerscope check --update-baseline` to accept it. Entries for the same cycle in an old baseline are merged into one entry with a `count`. The text output no longer adds the target layer to a cycle entry. The SARIF and GitLab fingerprints of `layer-cycle` findings change once.

### Patch Changes

- [#132](https://github.com/hamedniroomand/nuxt-layerscope/pull/132) [`6d4db9f`](https://github.com/hamedniroomand/nuxt-layerscope/commit/6d4db9f87892df5e0860e5bcc19f5bf2aed7bb42) - layerscope now names the file in every error about an invalid baseline file: an empty file, a file that is not JSON, or a directory. A file from a newer layerscope now tells you to update layerscope, not to create the file again. `drift` now stops with an error when the baseline at the base ref is an empty file, is not JSON, or is a directory. Before, it read such a file as an empty baseline, and every finding showed as added. `--baseline ""` is refused with a clear message. A baseline file that cannot be read, for example because of its permissions, now stops the run with an error. Before, it was read as no baseline.

- [#131](https://github.com/hamedniroomand/nuxt-layerscope/pull/131) [`59c4a75`](https://github.com/hamedniroomand/nuxt-layerscope/commit/59c4a750ac448a6f29ff8db4e557aadc5c3fcda0) - `fix` lists each import of a moved file, also when a file imports the same file more than once. Before, it listed only the first import. The suggestion of `check` (also `suggestion.impact.imports` in JSON output and the MCP `suggest` tool) now counts each import to update, so the number can be higher than before. `fix --dry-run` now shows the column of each import.

- [`a7328a2`](https://github.com/hamedniroomand/nuxt-layerscope/commit/a7328a2e16e19a881fad5e340555b5680eaa9b8f) - `init --dry-run`, `check --update-baseline` and `fix --dry-run` now work when you write the flag before the root. Before, the flag took the root as its value, so the command did not use the root. `init --dry-run app` worked on the current dir, and it could write `layerscope.config.ts` there. `check --update-baseline app` checked the current dir and wrote no baseline. `fix --dry-run app` stopped with an error.

## 0.6.3

### Patch Changes

- [#101](https://github.com/hamedniroomand/nuxt-layerscope/pull/101) [`11f0229`](https://github.com/hamedniroomand/nuxt-layerscope/commit/11f022934aa6d6b133d087e1587c4d26c1bab7e2) - `init` uses the Nuxt build directory and treats every layerscope config file name the same.

- [#99](https://github.com/hamedniroomand/nuxt-layerscope/pull/99) [`30e2465`](https://github.com/hamedniroomand/nuxt-layerscope/commit/30e2465b33dc023dcd932e6d3db9297778006134) - `init` says when it found no data from the Nuxt module and reads symbols from the generated types.

## 0.6.2

### Patch Changes

- [#93](https://github.com/hamedniroomand/nuxt-layerscope/pull/93) [`556c358`](https://github.com/hamedniroomand/nuxt-layerscope/commit/556c3581bb25503cc2c991dc31072b36aa6e1cf2) - layerscope runs git correctly from a git hook in a linked worktree.

- [#93](https://github.com/hamedniroomand/nuxt-layerscope/pull/93) [`dfa80ff`](https://github.com/hamedniroomand/nuxt-layerscope/commit/dfa80ff65abceb35db8856db688758f8c7d636b3) - `init` says when the .nuxt data may be older than nuxt.config.

## 0.6.1

### Patch Changes

- [#90](https://github.com/hamedniroomand/nuxt-layerscope/pull/90) [`a2e3824`](https://github.com/hamedniroomand/nuxt-layerscope/commit/a2e38240b26ca1b5ac716a3911fc66b78e8c2f74) - The `layerscope init` refusal names the keys that are set in the `layerscope` key of `nuxt.config`, and tells you to run `init --prepare`. The suggestion for root code that uses a feature layer, under a preset with `root` as its base, says to move the code to root or remove the use. The root hint is short on each finding when the note gives the full text.

## 0.6.0

### Minor Changes

- [#88](https://github.com/hamedniroomand/nuxt-layerscope/pull/88) [`2f785bc`](https://github.com/hamedniroomand/nuxt-layerscope/commit/2f785bc54599aa0961fd96ce699519ec4f9d005e) - `layerscope init` can suggest a preset with `root` as its base, such as `preset: { name: 'features', base: ['root'] }`, when shared code is in root and the feature layers use only root. The suggestion shows the object form when the base is not the default one.

- [#83](https://github.com/hamedniroomand/nuxt-layerscope/pull/83) [`f33f116`](https://github.com/hamedniroomand/nuxt-layerscope/commit/f33f1168eaebde305cb424d8142bed0885d38f36) - Explain `root` in the `allow` hint. When a layer's `allow` does not list `root`, the suggestion says that `root` is a layer, and `check` and `watch` add one note per layer. The docs describe `root` and `shared/`.

- [#85](https://github.com/hamedniroomand/nuxt-layerscope/pull/85) [`3a749a0`](https://github.com/hamedniroomand/nuxt-layerscope/commit/3a749a0f04f6633a3b77415992f90f3df2aa015a) - Allow `root` as a base layer of a preset, for example `preset: { name: 'features', base: ['root'] }`, so feature layers can use the project's own code without a hand-written `allow`. `root` is always the lowest base layer. Under that preset, `root` may use no other layer unless `layers.root.allow` says so. The allow hint names the preset base when the preset gave the layer its `allow`.

### Patch Changes

- [#87](https://github.com/hamedniroomand/nuxt-layerscope/pull/87) [`d518257`](https://github.com/hamedniroomand/nuxt-layerscope/commit/d5182575306e2e7e366bb3e626572fc373ebb2aa) - Do not report `<component :is>` when the bound value can only be a native HTML or SVG element name, such as a string literal, a ternary of them, or a prop typed as element names or defaulting to one.

## 0.5.0

### Minor Changes

- [#76](https://github.com/hamedniroomand/nuxt-layerscope/pull/76) [`aa2f8d6`](https://github.com/hamedniroomand/nuxt-layerscope/commit/aa2f8d6118f959ce6cc026375339b5dc5d019a60) - New option `typeImports`. With `'ignore'`, a type-only import makes no dependency, so no rule reports it and it is not in the graph. The forms are `import type`, `import { type A }` with `type` on every name, `export type ... from` and `import type x = require(...)`. An import with value names still counts, with the value names only. The default is `'check'`, which keeps the old result.

## 0.4.0

- `require('...')` calls are scanned, also through `createRequire(...)`, and so are `.cjs` and
  `.cts` files. Before, a boundary break through CommonJS code was skipped with no finding. A
  destructured `require` takes the names as a named import does, so `expose` and `only` lists
  apply. `require.resolve(...)` and a `require()` with a value that is not a string literal are
  not counted. `check --staged`, `--changed` and file arguments select `.cjs` and `.cts` files.
- A `layerscope.config.mjs` or `.js` is read again when its content changes in a long-running
  process: `check --watch`, the DevTools tab and `layerscope mcp`. Before, Node kept the first
  copy until the process restarted. A file that the config imports is still read once.
- New preset `features`: a core and a UI kit build up, and every other layer may use them but not
  each other. `layered` and `features` take base layers by name with
  `preset: { name, base: [...] }`, and `features` picks `core`, `base`, `shared` or `common`, then
  `ui` or `design-system`, when you give none. `layerscope init` suggests the strictest preset that
  fits today's dependencies. The MCP `layers` tool now returns `preset` as `{ name, base }` and not
  as a name.
- A guide for moving from eslint-plugin-nuxt-layers: how to convert the layer map, how to run both
  tools, and what differs.
- `layerscope check --staged`, `--changed`, `--since <ref>` and file arguments check only some
  files: the project loads as always, but only the selected files are read and reported. It fits a
  pre-commit hook, with `lint-staged` (file names are read as files) or `--staged`. A file outside
  the project or in no layer is skipped with a note, and nothing selected exits `0` at once. A
  check of some files gives no fix suggestions. `--since` diffs from the merge base with the ref,
  and `--changed` exits `2` with a hint when a shallow or detached checkout has no base branch.
- `pnpm bench` in `packages/layerscope` measures `check` on a generated project of any size, or on
  your own with `--project`: a one-shot run, a run with `nuxi prepare`, and a long-running process
  that reads the cache. The new performance page has the numbers and the method.
- `layerscope mcp` starts a read-only MCP server over stdio, so coding assistants can ask
  focused questions: `check`, `why`, `layers`, `can_use`, `suggest` and `graph`. The analysis stays
  in memory, and each call reads only the files that changed. Paths outside the project are refused.
  Setup for Claude Code, Cursor and VS Code is on the coding assistants page.
- A layer can allow only part of another layer: an entry of `allow` can be `{ layer: 'web', only: ['useCart'] }`.
  `only` takes names and globs on the file path. Any other use of that layer is a `layer-boundary`
  finding that names the entry. The suggestion of a boundary finding proposes a scoped entry when up to
  three names cause the findings. For TypeScript users: `allow` in the config type is now
  `(string | { layer: string; only: string[] })[]`.
- A layer can list its public API in `expose`, with names and globs. The new rule `layer-internal`
  (default `error`) reports a use of any other symbol from another layer, for every kind of
  dependency: auto-imports, components, server utils, shared utils, explicit imports and `#imports`.
  It only looks at layers that set `expose`. The ESLint plugin has the matching rule, and
  `layerscope why` and `unused` show whether a symbol is exposed. Findings of the JSON report have
  the new optional fields `scoped` and `exposed`, and a suggestion can have `only` and `expose`.
- `layerscope check --watch` checks again after each change and shows what is new and what is
  fixed. It analyzes only the changed file, and runs in full when files are added or deleted or
  when a config file or the Nuxt registry changes. It works with every output format and never
  exits with `1`.
- The DevTools tab and `check --watch` no longer run in full when `nuxi dev` writes a generated
  file again with the same content. The environment key now hashes the content.
- `layerscope check --format sarif` writes a SARIF 2.1.0 log for GitHub code scanning. Findings
  that the baseline accepts are included as suppressed results.
- `layerscope check --format gitlab` writes a GitLab Code Quality report for the merge request
  widget. Both formats use paths relative to the git root, so a Nuxt project in a subdirectory
  matches the files in the repository, and one fingerprint for each finding, from the baseline key.

## 0.3.1

- The DevTools tab no longer keeps a `shadowed-component` finding after you delete, rename or move
  the file that causes it. The module now writes the shadowed components of the last scan only,
  so the tab updates without a restart of `nuxi dev`.
- `layerscope check --prepare` no longer prints Node's `WASI is an experimental feature` warning,
  which appears where oxc-parser uses its wasm fallback, such as StackBlitz. Other warnings stay.
- New example project, `examples/shop`: four layers with the layered preset, a baseline, and a
  `violations/` overlay that triggers every rule. Run it locally or on StackBlitz. CI checks its
  findings on every change.

## 0.3.0

- The DevTools tab is a new prebuilt Vue client with six views: Overview, Findings, Trace,
  Unused, Graph and Baseline. Its theme follows Nuxt DevTools, or the OS theme
  when you open `/__layerscope` directly. The server-rendered page is removed;
  `/__layerscope?format=json` still returns the check report.
- Findings filter by severity, rule, layer pair, file and text, with the filters kept in the URL
  hash. Each boundary finding shows its suggestion; an "allow" suggestion comes with a config
  snippet to copy and the findings it resolves. The tab never writes config. Long lists render
  a frame at a time, so a large project opens without a pause.
- Trace lists every use of a component or auto-import, grouped by layer, as `layerscope why`
  does. Unused and Baseline show what `layerscope unused` and the baseline file hold. Each view
  can copy the matching CLI command.
- The Graph view shows which layer depends on which, how much, and where the rules break, with
  dashed edges and `!N` badges for violations. Selecting a layer or an edge shows its files and
  symbols. A Table view shows the same numbers as a matrix and opens first above 15 layers. The
  graph loads as a separate chunk, only when needed.
- The tab updates while you code. An open tab re-runs the analysis 200 ms after a change and says
  what changed ("+2 violations, -1 fixed"). New findings get a `NEW` chip, a "New only" filter
  and the `n` key; `p` pauses. While the tab is closed or hidden, a change does no work. Events
  come from `/__layerscope/events`; when the stream fails, the tab polls `/api/state`.
- Findings can be accepted into `layerscope-baseline.json` from the tab: one row (`i`), a picked
  set (`x` and shift-click) or a whole group, always after an inline confirm. Undo is one click
  for 10 s, and the Baseline view keeps it until the next write and can remove entries. The file
  matches what `check --update-baseline` writes. Writes need a token that only the tab knows,
  come only from the same origin, and are refused when the findings changed in the meantime.
- Keyboard: `1` to `6`, `/`, `r`, `j`, `k`, `o`, `t`, `i`, `x`, `n`, `p`, `e`, `Esc`, and `?`
  for a sheet of every shortcut. The tab passes an axe audit, and every text color has a
  contrast of 4.5:1 or more in both themes.
- Large projects re-run much faster in the tab: suggestions are indexed, the analysis yields to
  the event loop between batches, and the loaded symbols are kept until the registry changes.
- `layerscope: { devtools: { static: true } }` publishes a read-only snapshot of the tab:
  `nuxi build` and `nuxi generate` write `/__layerscope/` to the public output, with paths
  relative to the project. The snapshot has no live updates and no writes, and works on any static
  host.
- New JSON endpoints under `/__layerscope/api`: `symbols`, `trace`, `unused`, `baseline`,
  `graph`, `edge`, `node`, `live/*` and `baseline/*`. `report` adds absolute paths (`absRoot`,
  `absFile`, `absTarget`), `hotFiles` and per-layer `layerStats`.

## 0.2.0

- `layerscope init` writes a starter `layerscope.config.ts` with the smallest `allow` map the
  project passes with, prints every allowed edge and how many references could not be resolved,
  and with `--baseline` accepts what is left. It never replaces a config without `--force`.
- Each `layer-boundary` finding carries a suggestion (`move`, `allow` or `leave`) with its impact,
  in the text, JSON and GitHub outputs. `layerscope fix --dry-run` prints the planned file
  moves and the imports they break.
- New `layer-cycle` rule (off by default) reports cycles between layers with the full chain.
- New `preset` option (`layered`, `stacked`) fills `allow` for layers that do not set it.
- `layerscope drift` says how many violations the code adds and fixes against the baseline on a
  base ref. The GitHub Action writes it, with the baseline size, to the job summary, and posts it
  on the pull request with `comment: true`.
- The JSON report has a JSON Schema, shipped as `nuxt-layerscope/schema/report-1.json`.
- The docs publish `/llms.txt` and `/llms-full.txt` and have a guide for coding assistants.

## 0.1.4

- Packages that Nuxt hoists into the generated tsconfig `paths` (`ofetch`, `consola`, `h3`, `defu`,
  `nitropack`) are no longer reported as unresolved imports.
- The DevTools tab serves JSON endpoints under `/__layerscope/api` (`state`, `report`, `rerun`),
  with an `ETag` revision that only changes when the findings, layers or notes change.
- `eslint --cache` no longer keeps stale results: `configs.recommended` carries a digest of the
  registry and the layer config, so ESLint discards cached results when either changes.
- The ESLint plugin no longer reuses a file's last result after the registry or config changed,
  which showed stale findings in editors until the file's text changed.
- The DevTools tab re-analyzes only files that changed since the last run.
- The DevTools tab reads `layerscope-baseline.json`, so accepted findings are left out and counted
  as "in baseline", like `layerscope check`.

## 0.1.3

- Notes and the `--verbose` line are printed after the report, in every command, so they are the
  last thing on screen. `note:` is highlighted in a terminal.
- `layerscope check` lists files with errors after files with only warnings, so the errors stay
  next to the summary in a long report.
- The text report colors severities, rule names and the summary in a terminal. `NO_COLOR` and
  `FORCE_COLOR` are honoured.

## 0.1.2

- A note appears when `nuxt.config` is newer than the registry, because changes to its
  `layerscope` key only apply after `nuxi prepare`, `dev` or `build`.
- Layer errors caused by the `layerscope` key of `nuxt.config` name it as their source.

## 0.1.1

- Names inside type syntax are no longer reported as unresolved references: labeled tuple members
  (`defineEmits<{ close: [value: boolean] }>()`) and parameters of function types
  (`(...next: T[]) => void`) and `typeof` queries in types.
- `$fetch` is a known global, so it is no longer reported in server code.
- The docs show `defineConfig` imported from `nuxt-layerscope` in every `layerscope.config.ts` sample.

## 0.1.0

Initial release.
