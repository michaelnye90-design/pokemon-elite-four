import { DIFFICULTY, TIER_ORDER, type TierId } from '../../config/difficulty';
import { createRun } from '../../game/run';
import type { Screen } from '../app';
import { esc } from '../dom';
import { cleanName, saveSettings } from '../settings';

/** What each tier means, in player terms (values live in src/config/difficulty.ts). */
const TIER_BLURB: Record<TierId, string> = {
  easy: 'Your team is clearly stronger, you get plenty of items, and the opponent picks moves at random.',
  normal: 'An even fight: your best Pokémon matches the Champion’s, the trainers use their real items, and the opponent goes for strong, super-effective moves.',
  hard: 'Your team is a little weaker with fewer items. The opponent switches smartly, heals when low, and sets up.',
  expert: 'A weaker team and few items. The opponent thinks a turn ahead and expects your switches.',
  nightmare: 'A much weaker team and barely any items. Opponents get the most healing items. (Same AI as Expert for now.)',
};

/** Generations planned; only those with a ruleset can be played. */
const GENERATIONS = [
  { gen: 1, region: 'Kanto', games: 'Yellow' },
  { gen: 2, region: 'Johto', games: 'Gold / Silver / Crystal' },
  { gen: 3, region: 'Hoenn', games: 'Ruby / Sapphire / Emerald' },
];

export const homeScreen: Screen = {
  render(app) {
    const gens = GENERATIONS.map(({ gen, region, games }) => {
      const available = app.rulesets.some((r) => r.gen === gen);
      const selected = app.rules.gen === gen;
      return `
        <button class="choice${selected ? ' selected' : ''}" data-action="gen" data-gen="${gen}" ${available ? '' : 'disabled'} aria-pressed="${selected}">
          <span class="choice-title">Gen ${gen} · ${esc(region)}</span>
          <span class="choice-sub">${available ? esc(games) : 'Coming later'}</span>
        </button>`;
    }).join('');

    const tiers = TIER_ORDER.map((tier) => {
      const selected = app.tier === tier;
      return `
        <button class="choice tier-${tier}${selected ? ' selected' : ''}" data-action="tier" data-tier="${tier}" aria-pressed="${selected}">
          <span class="choice-title">${esc(DIFFICULTY[tier].label)}</span>
          <span class="choice-sub">${esc(TIER_BLURB[tier])}</span>
        </button>`;
    }).join('');

    return `
      <section class="screen home">
        <header class="hero">
          <h1>Elite Four Challenge</h1>
          <p>Take on the Elite Four with a random team. No healing between fights except the items you bring.</p>
        </header>
        <h2>Generation</h2>
        <div class="choices gens">${gens}</div>
        <h2>Difficulty</h2>
        <div class="choices tiers">${tiers}</div>
        <h2>Options</h2>
        <div class="options">
          <label class="field-label">Your name
            <input type="text" data-input="name" value="${esc(app.playerName)}" maxlength="7" spellcheck="false" autocomplete="off">
          </label>
          <label class="check"><input type="checkbox" data-input="champion" ${app.includeChampion ? 'checked' : ''}> Fight the Champion after the Elite Four</label>
          <label class="field-label">Seed <span class="hint">(optional; replays a run)</span>
            <input type="text" data-input="seed" value="${esc(app.seedInput)}" placeholder="random" maxlength="32" spellcheck="false" autocomplete="off">
          </label>
        </div>
        ${app.message ? `<p class="error">${esc(app.message)}</p>` : ''}
        <div class="actions"><button class="primary" data-action="start">Get my team</button></div>
      </section>`;
  },

  actions: {
    gen(app, data) {
      const rules = app.rulesets.find((r) => r.gen === Number(data.gen));
      if (rules) app.rules = rules;
      app.render();
    },
    tier(app, data) {
      app.tier = data.tier as TierId;
      app.render();
    },
    start(app) {
      const seed = app.seedInput.trim().toLowerCase();
      app.setup = createRun(app.rules, app.tier, seed || undefined);
      app.cart = {};
      app.go('team');
    },
  },

  inputs: {
    name(app, value) {
      app.settings.playerName = cleanName(value);
      saveSettings(app.settings);
    },
    champion(app, _value, checked) {
      app.includeChampion = checked;
    },
    seed(app, value) {
      app.seedInput = value;
    },
  },
};
