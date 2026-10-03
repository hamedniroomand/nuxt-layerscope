import type { App } from 'vue';

import Card from './components/Card.vue';
import CardGroup from './components/CardGroup.vue';
import Mermaid from './components/Mermaid.vue';
import ReadMore from './components/ReadMore.vue';
import Screenshot from './components/Screenshot.vue';
import Steps from './components/Steps.vue';

/** The components that Markdown pages use without an import. */
export function registerComponents(app: App): void {
  app.component('Card', Card);
  app.component('CardGroup', CardGroup);
  app.component('Mermaid', Mermaid);
  app.component('ReadMore', ReadMore);
  app.component('Screenshot', Screenshot);
  app.component('Steps', Steps);
}
