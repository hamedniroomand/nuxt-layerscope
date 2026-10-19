---
'nuxt-layerscope': patch
---

`fix` rewrites an `import()` in a template at the position that the template compiler gives, not at the first match of its text. Before, a string such as `"import('./a')"` before the real `import('./a')` got the rewrite, and the real import kept the old path. When the quotes of the path are an HTML character reference, such as `&quot;`, `fix` now stops and tells you to use `'` or `"` as the quote. An `import()` that layerscope cannot place exactly in a template expression, for example when the same expression has an HTML character reference such as `&amp;&amp;`, is not rewritten now (before, it often was): `fix` stops and says how to change the template.
