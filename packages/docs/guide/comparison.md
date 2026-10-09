# Compared with other tools

Other tools cover parts of this. layerscope is narrower: it resolves symbols exactly the way Nuxt
does, understands Nuxt layer semantics, and is built to fail a CI job.

|                                               | layerscope                           | [eslint-plugin-nuxt-layers] | [nuxt-fsd]      | [Archora]                     | [Nuxt DevTools]     |
| --------------------------------------------- | ------------------------------------ | --------------------------- | --------------- | ----------------------------- | ------------------- |
| Boundary rules on explicit imports            | ✓                                    | ✓                           | ✓ (FSD layers)  | ✓                             | –                   |
| Boundary rules on auto-imports and components | ✓                                    | –                           | –               | ✓                             | –                   |
| Resolves symbols from                         | Nuxt's registry or generated types   | import paths                | its own aliases | its own analyzer              | the running app     |
| Knows Nuxt layers (`extends`, `layers/`, npm) | ✓                                    | folder layout               | –               | not Nuxt-specific             | shows them          |
| CI gate                                       | exit codes, PR annotations, baseline | via ESLint                  | –               | exit codes, thresholds        | –                   |
| Scope                                         | Nuxt layer boundaries                | import boundaries           | FSD structure   | general architecture analyzer | dev-time inspection |

- **eslint-plugin-nuxt-layers** checks `import` statements against a layer map. It runs inside
  ESLint and the editor, but auto-imports have no import statement to check. The two work well
  together: ESLint for instant feedback on imports, layerscope in CI for everything. To move
  from one to the other, see [Migrate from eslint-plugin-nuxt-layers](./migrate-from-eslint-plugin-nuxt-layers).
- **nuxt-fsd** sets up Feature-Sliced Design in Nuxt and blocks cross-imports, but its own README
  notes that auto-imports do not respect those rules.
- **Archora** (`@archora/cli`) is a general frontend architecture analyzer that also resolves Nuxt
  auto-imported composables, alongside cycles, churn and bundle analysis. Pick it for a broad
  architecture report; pick layerscope for exact Nuxt layer boundaries as a CI gate.
- **Nuxt DevTools** shows components and auto-imports of a running app, but does not enforce rules.

[eslint-plugin-nuxt-layers]: https://github.com/alexanderop/eslint-plugin-nuxt-layers
[nuxt-fsd]: https://github.com/aabounegm/nuxt-fsd
[Archora]: https://github.com/archora-dev/archora
[Nuxt DevTools]: https://devtools.nuxt.com
