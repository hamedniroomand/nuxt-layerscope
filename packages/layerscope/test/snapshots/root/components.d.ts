
import type { DefineComponent, SlotsType } from 'vue'
type LazyComponent<T> = DefineComponent<{}, {}, {}, {}, {}, {}, {}, { hydrated: () => void }> & T

export const BaseButton: typeof import("../layers/shared/app/components/BaseButton.vue")['default']
export const NuxtLink: typeof import("../node_modules/nuxt/dist/app/components/nuxt-link")['default']
export const LazyBaseButton: LazyComponent<typeof import("../layers/shared/app/components/BaseButton.vue")['default']>


export const componentNames: string[]
