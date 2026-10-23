// The app shell: which screen is showing, the choices made so far, and
// click/input handling shared by every screen (via data-action attributes).

import type { TierId } from '../config/difficulty';
import type { RunSetup } from '../game/run';
import type { RunSession } from '../game/session';
import type { Cart } from '../generator/items';
import type { Ruleset } from '../rules/ruleset';
import { battleScreen, type BattleView } from './screens/battle';
import { betweenScreen } from './screens/between';
import { homeScreen } from './screens/home';
import { resultsScreen } from './screens/results';
import { teamScreen } from './screens/team';

export type ScreenId = 'home' | 'team' | 'battle' | 'between' | 'results';

export interface Screen {
  render(app: App): string;
  /** Click handlers keyed by `data-action`; they receive the element's data attributes. */
  actions: Record<string, (app: App, data: DOMStringMap) => void | Promise<void>>;
  /** Input/change handlers keyed by `data-input`. */
  inputs?: Record<string, (app: App, value: string, checked: boolean) => void>;
  /** Runs after each render, e.g. to scroll the battle log. */
  afterRender?(app: App): void;
}

const SCREENS: Record<ScreenId, Screen> = {
  home: homeScreen,
  team: teamScreen,
  battle: battleScreen,
  between: betweenScreen,
  results: resultsScreen,
};

export class App {
  screen: ScreenId = 'home';
  rules: Ruleset;
  tier: TierId = 'normal';
  includeChampion = true;
  seedInput = '';
  setup: RunSetup | null = null;
  cart: Cart = {};
  session: RunSession | null = null;
  battleView: BattleView | null = null;
  /** Between-fights item being aimed at a party member. */
  pendingItem: string | null = null;
  message: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    readonly rulesets: Ruleset[],
  ) {
    this.rules = rulesets[0];
    root.addEventListener('click', (event) => {
      const target = (event.target as Element).closest<HTMLElement>('[data-action]');
      if (!target || target.hasAttribute('disabled')) return;
      const handler = SCREENS[this.screen].actions[target.dataset.action!];
      if (handler) void this.run(() => handler(this, target.dataset));
    });
    const onInput = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const key = target.dataset?.input;
      const handler = key && SCREENS[this.screen].inputs?.[key];
      if (handler) handler(this, target.value, target.checked);
    };
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
  }

  go(screen: ScreenId) {
    this.screen = screen;
    this.message = null;
    this.render();
    window.scrollTo({ top: 0 });
  }

  render() {
    const screen = SCREENS[this.screen];
    this.root.innerHTML = screen.render(this);
    screen.afterRender?.(this);
  }

  /** Runs a handler, showing any error as a message instead of failing silently. */
  private async run(fn: () => void | Promise<void>) {
    try {
      await fn();
    } catch (error) {
      console.error(error);
      this.message = (error as Error).message;
      this.render();
    }
  }
}
