# Docs scripts

## `screenshots.ts`

Captures the DevTools tab for the docs and the READMEs:

- every view in light and dark, at 1200 x 720 CSS pixels and scale 2, in
  `public/devtools/<view>-<theme>.png`,
- the README hero, the Graph view in a frame like the DevTools panel, in
  `public/devtools/hero-<theme>.webp` (1600 px wide),
- the social card, `public/og-image.png`, from `og-image.html`,
- `public/devtools/manifest.json`, with the package version and the last commit of the playground,
  so you can see when the images are older than the UI.

Run it from the repository root:

```sh
vp run nuxt-layerscope#build
vp run docs#screenshots
```

The script starts `nuxi dev` on [the playground](https://github.com/hamedniroomand/nuxt-layerscope/tree/main/packages/playground) on a free port and stops it at
the end. Stop other dev servers of the playground first (`vp run playground`): Nuxt lets only one
run at a time. The pictures show the playground as it is committed, including its baseline file, so
commit or stash your changes to it first.

It uses the Chrome that is installed on your machine. If Playwright cannot find it, set
`CHROME_PATH` to the Chrome binary.

The script fails when a page does not load, when an image is blank, or when a PNG is larger than
300 KB. Two runs on the same UI give the same files. CI does not run it.
