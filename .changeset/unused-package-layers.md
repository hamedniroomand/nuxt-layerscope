---
'nuxt-layerscope': minor
---

`layerscope unused` does not list the symbols of a layer outside the project root that is not installed as a package, such as a workspace package, because another app can use them. The text report names these layers in a second line. When a layer is not listed, an empty list says "No unused symbol found in the listed layers." and not that every symbol is referenced.

The JSON report has a new `outside-root` entry in `blindSpots`, and `findBlindSpots` returns the same new kind. The DevTools Unused view shows the same lines. In the view data, `blindSpotLine` is now `blindSpotLines`, a list.
