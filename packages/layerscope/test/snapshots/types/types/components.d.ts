
import type { DefineComponent, SlotsType } from 'vue'
type HydrationStrategies = {
  hydrateOnVisible?: IntersectionObserverInit | true
}
type LazyComponent<T> = DefineComponent<HydrationStrategies, {}, {}, {}, {}, {}, {}, { hydrated: () => void }> & T

interface _GlobalComponents {
  BaseButton: typeof import("../../layers/shared/app/components/BaseButton.vue")['default']
  NuxtLink: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-link")['default']
  LazyBaseButton: LazyComponent<typeof import("../../layers/shared/app/components/BaseButton.vue")['default']>
}

declare module 'vue' {
  export interface GlobalComponents extends _GlobalComponents { }
}

export {}
