import { DIFFICULTY } from '../../config/difficulty';
import { createRun } from '../../game/run';
import { RunSession } from '../../game/session';
import { addItem, autoFill, cartCost, removeItem } from '../../generator/items';
import type { App, Screen } from '../app';
import { esc, typeBadge } from '../dom';
import { sprite } from '../sprites';
import { startBattleView } from './battle';

const CATEGORY_LABEL: Record<string, string> = { healing: 'Healing', revive: 'Revives', status: 'Status cures', battle: 'Battle items', held: 'Held items' };

function moveChip(app: App, id: string): string {
  const move = app.rules.data.moves.find((m) => m.id === id);
  if (!move) return esc(id);
  return `<span class="move-chip type-${esc(move.type.toLowerCase())}">${esc(move.name)}</span>`;
}

export const teamScreen: Screen = {
  render(app) {
    const setup = app.setup!;
    const speciesData = (name: string) => app.rules.data.species.find((s) => s.name === name)!;

    const cards = setup.team.map((set, i) => {
      const s = speciesData(set.species);
      return `
        <article class="mon-card">
          <div class="mon-card-sprite">${sprite(set.species, app.rules.gen, 'p2', 1)}</div>
          <div class="mon-card-body">
            <h3>${esc(set.species)} <span class="level">Lv ${set.level}</span>${i === 0 ? ' <span class="lead">Lead</span>' : ''}</h3>
            <div class="types">${s.types.map(typeBadge).join('')} <span class="bst" title="Base stat total">BST ${s.bst}</span></div>
            <div class="moves">${set.moves.map((m) => moveChip(app, m)).join('')}</div>
            ${i > 0 ? `<button class="link" data-action="lead" data-index="${i}">Make lead</button>` : ''}
          </div>
        </article>`;
    }).join('');

    const spent = cartCost(app.cart, setup.shop);
    const left = setup.budget - spent;
    const groups = [...new Set(setup.shop.map((i) => i.category))].map((category) => {
      const rows = setup.shop.filter((i) => i.category === category).map((item) => {
        const count = app.cart[item.id] ?? 0;
        return `
          <li class="shop-row">
            <span class="shop-name">${esc(item.name)}${item.notSoldInGame ? ' <span class="hint">(not sold in-game)</span>' : ''}</span>
            <span class="shop-cost">${item.cost} pt</span>
            <span class="stepper">
              <button data-action="remove" data-id="${esc(item.id)}" ${count === 0 ? 'disabled' : ''} aria-label="Remove ${esc(item.name)}">−</button>
              <span class="count" aria-live="polite">${count}</span>
              <button data-action="add" data-id="${esc(item.id)}" ${item.cost > left ? 'disabled' : ''} aria-label="Add ${esc(item.name)}">+</button>
            </span>
          </li>`;
      }).join('');
      return `<h3>${esc(CATEGORY_LABEL[category] ?? category)}</h3><ul class="shop-list">${rows}</ul>`;
    }).join('');

    return `
      <section class="screen team">
        <header class="screen-head">
          <h1>Your team</h1>
          <p class="meta">${esc(DIFFICULTY[setup.tier].label)} · seed <code>${esc(setup.seed)}</code></p>
        </header>
        <div class="team-grid">${cards}</div>
        <div class="actions left"><button data-action="reroll">New random team</button></div>

        <h2>Item shop</h2>
        <p class="budget"><strong>${left}</strong> of ${setup.budget} points left</p>
        <div class="actions left">
          <button data-action="autofill">Auto-fill</button>
          <button data-action="clear" ${spent === 0 ? 'disabled' : ''}>Clear</button>
        </div>
        <div class="shop">${groups}</div>

        ${app.message ? `<p class="error">${esc(app.message)}</p>` : ''}
        <div class="actions">
          <button data-action="back">Back</button>
          <button class="primary" data-action="begin">Start the challenge</button>
        </div>
      </section>`;
  },

  actions: {
    lead(app, data) {
      const team = app.setup!.team;
      const [mon] = team.splice(Number(data.index), 1);
      team.unshift(mon);
      app.render();
    },
    reroll(app) {
      app.setup = createRun(app.rules, app.setup!.tier);
      app.seedInput = '';
      app.cart = {};
      app.render();
    },
    add(app, data) {
      app.cart = addItem(app.cart, data.id!, app.setup!.shop, app.setup!.budget);
      app.render();
    },
    remove(app, data) {
      app.cart = removeItem(app.cart, data.id!);
      app.render();
    },
    autofill(app) {
      app.cart = autoFill(app.setup!.shop, app.setup!.budget);
      app.render();
    },
    clear(app) {
      app.cart = {};
      app.render();
    },
    back(app) {
      app.go('home');
    },
    begin(app) {
      app.session = new RunSession(app.rules, app.setup!, app.cart, { includeChampion: app.includeChampion, playerName: app.playerName });
      app.session.nextFight();
      app.session.startFight();
      app.battleView = startBattleView(app);
      app.go('battle');
    },
  },
};
