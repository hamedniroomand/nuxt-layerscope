---
'nuxt-layerscope': patch
---

`unused` and `check` read component tags in JSX (`.tsx`, `.jsx` and `<script lang="tsx">`) outside the `server/` dir, such as `<CartBadge />` and `<cart-badge />`. Before, a component that only JSX used was listed as unused. A JSX tag that Nuxt has no component for now gives an `unresolved-reference` finding, as a template tag does.
