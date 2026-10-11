// Tokens first, so the cascade order of the bundled CSS stays fixed.
import './tokens.css';
import { createApp } from 'vue';

import App from './App.vue';
import { createTabContext } from './lib/app.ts';
import { TAB_CONTEXT } from './lib/context.ts';

createApp(App).provide(TAB_CONTEXT, createTabContext()).mount('#app');
