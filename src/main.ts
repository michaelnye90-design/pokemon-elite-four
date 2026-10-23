import '@fontsource/press-start-2p/400.css';
import './style.css';
import './ui/scene.css';
import { LEGAL_NOTICE } from './legal';
import { gen1 } from './rules/gen1';
import { App } from './ui/app';

const root = document.querySelector<HTMLElement>('#app')!;
const footer = document.querySelector<HTMLElement>('#legal')!;

footer.innerHTML = `<p>${LEGAL_NOTICE}</p><p>Battles run on the <a href="https://github.com/pkmn/ps" rel="noopener">Pokémon Showdown</a> simulator (MIT); sprites are loaded from Pokémon Showdown.</p>`;

const app = new App(root, [gen1]);
app.render();

// Handy for debugging in the browser console during development only.
if (import.meta.env.DEV) (window as unknown as { app: App }).app = app;
