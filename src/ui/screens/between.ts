// Between fights: no free healing, but bag items can be used on the walk to the next room.

import type { BattleItem } from '../../engine/items';
import type { App, Screen } from '../app';
import { esc, hpBar, statusBadge } from '../dom';
import { icon } from '../sprites';
import { startBattleView } from './battle';

function pendingItem(app: App): BattleItem | null {
  if (!app.pendingItem) return null;
  return app.session!.bagItems().find((b) => b.item.id === app.pendingItem)?.item ?? null;
}

export const betweenScreen: Screen = {
  render(app) {
    const session = app.session!;
    const last = session.records.at(-1)!;
    const next = session.upcomingTrainer!;
    const item = pendingItem(app);

    const party = session.party
      .map((m, i) => {
        const c = m.condition!;
        const maxhp = session.maxhp[i];
        const problem = item ? session.outsideItemProblem(item, i) : null;
        const body = `
          ${icon(m.set.species, c.hp === 0)}
          <span class="switch-body">
            <span class="switch-name">${esc(m.set.species)} <span class="level">Lv${m.set.level}</span> ${statusBadge(c.hp === 0 ? 'fnt' : c.status)}</span>
            ${hpBar(c.hp, maxhp, { showNumbers: true })}
          </span>`;
        return item
          ? `<button class="switch" data-action="use" data-index="${i}" ${problem ? `disabled title="${esc(problem)}"` : ''}>${body}</button>`
          : `<div class="switch static">${body}</div>`;
      })
      .join('');

    const bag = session.bagItems().filter(({ item: i }) => i.effect.kind !== 'boost');
    const bagButtons = bag.length
      ? bag.map(({ item: i, count }) => `
          <button class="bag-item${app.pendingItem === i.id ? ' selected' : ''}" data-action="pick" data-id="${esc(i.id)}" aria-pressed="${app.pendingItem === i.id}">
            <span>${esc(i.name)}</span><span class="count">×${count}</span>
          </button>`).join('')
      : '<p class="hint">No healing items left.</p>';

    return `
      <section class="screen between">
        <header class="screen-head">
          <h1>You defeated ${esc(last.trainerName)}!</h1>
          <p class="meta">${last.turns} turns${last.fainted.length ? ` · fainted: ${last.fainted.map(esc).join(', ')}` : ''}</p>
        </header>
        <p>No healing between fights, except with your own items.</p>
        <h2>Your team</h2>
        ${item ? `<p class="prompt">Use ${esc(item.name)} on… <button class="link" data-action="cancel">cancel</button></p>` : ''}
        <div class="switch-grid">${party}</div>
        <h2>Bag</h2>
        <div class="bag-grid">${bagButtons}</div>
        ${app.message ? `<p class="error">${esc(app.message)}</p>` : ''}
        <div class="actions">
          <button class="primary" data-action="next">Next: ${esc(next.title)} ${esc(next.name)}</button>
        </div>
      </section>`;
  },

  actions: {
    pick(app, data) {
      app.pendingItem = app.pendingItem === data.id ? null : data.id!;
      app.message = null;
      app.render();
    },
    cancel(app) {
      app.pendingItem = null;
      app.render();
    },
    use(app, data) {
      const item = pendingItem(app);
      if (!item) return;
      app.session!.useItemOutside(item, Number(data.index));
      if (!app.session!.bag[item.id]) app.pendingItem = null;
      app.render();
    },
    next(app) {
      app.pendingItem = null;
      app.session!.nextFight();
      app.session!.startFight();
      app.battleView = startBattleView(app);
      app.go('battle');
    },
  },
};
