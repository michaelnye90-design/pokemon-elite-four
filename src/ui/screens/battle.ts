// The battle screen, laid out like Pokémon Showdown: the field with both
// Pokémon, HP bars and party balls; move, switch and bag menus; and the log.
// Each turn's events are played back one by one so HP bars drain in order.

import { DIFFICULTY } from '../../config/difficulty';
import type { EngineBattle } from '../../engine/battle';
import type { BattleItem } from '../../engine/items';
import type { App, Screen } from '../app';
import { delay, esc, hpBar, statusBadge } from '../dom';
import { formatLog, type LogEvent, type SideId } from '../log';
import { icon, sprite } from '../sprites';

interface ActiveView {
  species: string;
  level: number;
  hp: number;
  maxhp: number;
  status: string;
}

type Menu = 'main' | 'switch' | 'bag' | 'target';

export interface BattleView {
  active: Partial<Record<SideId, ActiveView>>;
  log: { text: string; tone?: LogEvent['tone']; turn?: number }[];
  /** How much of the simulator's log has been shown. */
  logIndex: number;
  animating: boolean;
  menu: Menu;
  /** Bag item waiting for a target. */
  item: BattleItem | null;
}

const TEXT_DELAY = 550;
const QUICK_DELAY = 250;

function battle(app: App): EngineBattle {
  return app.session!.battle!;
}

function activeFromEngine(b: EngineBattle, side: SideId): ActiveView {
  const p = b.active(side);
  return { species: p.species.name, level: p.level, hp: p.hp, maxhp: p.maxhp, status: p.status === 'fnt' ? '' : p.status };
}

/** Sets up the view for a fight that has just started. */
export function startBattleView(app: App): BattleView {
  const b = battle(app);
  const trainer = app.session!.currentTrainer;
  const opponent = `${trainer.title} ${trainer.name}`;
  return {
    // Taken from the engine, not the log: carried-over HP/status is applied after the leads are sent out.
    active: { p1: activeFromEngine(b, 'p1'), p2: activeFromEngine(b, 'p2') },
    log: [
      { text: `${opponent} wants to fight!`, tone: 'move' },
      { text: `${opponent} sent out ${b.active('p2').species.name}!` },
      { text: `Go! ${b.active('p1').species.name}!` },
    ],
    logIndex: b.log.length,
    animating: false,
    menu: 'main',
    item: null,
  };
}

function applyUpdate(view: BattleView, event: LogEvent) {
  const u = event.update;
  if (!u) return;
  if (u.kind === 'switch') {
    view.active[u.side] = { species: u.species, level: u.level, hp: u.hp, maxhp: u.maxhp, status: u.status };
    return;
  }
  const active = view.active[u.side];
  if (!active) return;
  if (u.kind === 'hp') {
    active.hp = u.hp;
    if (u.maxhp) active.maxhp = u.maxhp;
    active.status = u.status === 'fnt' ? '' : u.status || active.status;
  } else if (u.kind === 'status') {
    active.status = u.status;
  } else if (u.kind === 'faint') {
    active.hp = 0;
  }
}

/** Plays back everything the simulator logged since last time. */
async function playEvents(app: App) {
  const view = app.battleView!;
  const b = battle(app);
  const trainer = app.session!.currentTrainer;
  const events = formatLog(b.log.slice(view.logIndex), { gen: app.rules.gen, opponentName: `${trainer.title} ${trainer.name}` });
  view.logIndex = b.log.length;
  view.animating = true;
  app.render();
  for (const event of events) {
    applyUpdate(view, event);
    if (event.turn) view.log.push({ text: `Turn ${event.turn}`, turn: event.turn });
    if (event.text) view.log.push({ text: event.text, tone: event.tone });
    if (event.text || event.update) {
      app.render();
      await delay(event.tone === 'info' || !event.text ? QUICK_DELAY : TEXT_DELAY);
    }
  }
  // Settle on the engine's state (covers anything the log doesn't spell out).
  if (!b.ended) {
    view.active.p1 = activeFromEngine(b, 'p1');
    view.active.p2 = activeFromEngine(b, 'p2');
  }
  view.animating = false;
  view.menu = 'main';
  view.item = null;
  app.render();
}

function statBox(view: ActiveView | undefined, side: SideId): string {
  if (!view) return '';
  return `
    <div class="statbox ${side}">
      <div class="statbox-name"><strong>${esc(view.species)}</strong> <span class="level">Lv${view.level}</span> ${statusBadge(view.status)}</div>
      ${hpBar(view.hp, view.maxhp, { showNumbers: side === 'p1' })}
    </div>`;
}

function field(app: App): string {
  const view = app.battleView!;
  const b = battle(app);
  const foeLeft = b.sim.p2.pokemon.filter((p) => !p.fainted).length;
  const foeBalls = b.sim.p2.pokemon
    .map((_, i) => `<span class="ball${i >= foeLeft ? ' out' : ''}"></span>`)
    .join('');
  const mon = (side: SideId) => {
    const a = view.active[side];
    if (!a || a.hp <= 0) return '<div class="mon empty"></div>';
    return `<div class="mon ${side}">${sprite(a.species, app.rules.gen, side)}</div>`;
  };
  return `
    <div class="field" role="img" aria-label="Battlefield">
      <div class="foe-row">
        ${statBox(view.active.p2, 'p2')}
        ${mon('p2')}
      </div>
      <div class="balls" aria-label="Opponent has ${foeLeft} of ${b.sim.p2.pokemon.length} Pokémon left">${foeBalls}</div>
      <div class="you-row">
        ${mon('p1')}
        ${statBox(view.active.p1, 'p1')}
      </div>
    </div>`;
}

function partyStrip(app: App): string {
  const b = battle(app);
  return app.session!.party
    .map((_, i) => {
      const p = b.pokemon('p1', i);
      return `<span class="party-mon${p.isActive ? ' active' : ''}" title="${esc(p.species.name)} ${p.hp}/${p.maxhp}">${icon(p.species.name, p.fainted)}</span>`;
    })
    .join('');
}

function moveButtons(app: App): string {
  const legal = app.session!.playerActions();
  return legal.moves
    .map((m) => {
      const move = app.rules.data.moves.find((x) => x.id === m.id);
      const type = move?.type ?? 'Normal';
      const name = move?.name ?? (m.id === 'recharge' ? 'Recharge' : m.id);
      const pp = m.pp !== undefined ? `<span class="pp">${m.pp}/${m.maxpp}</span>` : '';
      const disabled = m.disabled || m.pp === 0;
      return `
        <button class="move type-${esc(type.toLowerCase())}" data-action="move" data-slot="${m.slot}" ${disabled ? 'disabled' : ''}>
          <span class="move-name">${esc(name)}</span>
          <span class="move-meta"><span class="move-type">${esc(type)}</span>${pp}</span>
        </button>`;
    })
    .join('');
}

function switchButtons(app: App, partyIndices: number[]): string {
  const b = battle(app);
  return app.session!.party
    .map((_, i) => {
      const p = b.pokemon('p1', i);
      const can = partyIndices.includes(i);
      const note = p.isActive ? 'In battle' : p.fainted ? 'Fainted' : '';
      return `
        <button class="switch" data-action="switch" data-index="${i}" ${can ? '' : 'disabled'}>
          ${icon(p.species.name, p.fainted)}
          <span class="switch-body"><span class="switch-name">${esc(p.species.name)} <span class="level">Lv${p.level}</span> ${statusBadge(p.fainted ? 'fnt' : p.status)}</span>
          ${hpBar(p.hp, p.maxhp, { showNumbers: true })}${note ? `<span class="hint">${note}</span>` : ''}</span>
        </button>`;
    })
    .join('');
}

function bagButtons(app: App): string {
  const items = app.session!.bagItems();
  if (items.length === 0) return '<p class="hint">Your bag is empty.</p>';
  return items
    .map(({ item, count }) => `
      <button class="bag-item" data-action="pick-item" data-id="${esc(item.id)}">
        <span>${esc(item.name)}</span><span class="count">×${count}</span>
      </button>`)
    .join('');
}

function targetButtons(app: App, item: BattleItem): string {
  const b = battle(app);
  return app.session!.party
    .map((_, i) => {
      const p = b.pokemon('p1', i);
      const problem = b.itemProblem('p1', item, i);
      return `
        <button class="switch" data-action="use-item" data-index="${i}" ${problem ? `disabled title="${esc(problem)}"` : ''}>
          ${icon(p.species.name, p.fainted)}
          <span class="switch-body"><span class="switch-name">${esc(p.species.name)} ${statusBadge(p.fainted ? 'fnt' : p.status)}</span>
          ${hpBar(p.hp, p.maxhp, { showNumbers: true })}</span>
        </button>`;
    })
    .join('');
}

function controls(app: App): string {
  const session = app.session!;
  const view = app.battleView!;
  if (view.animating) return '<div class="controls waiting"><p class="hint">…</p></div>';

  if (session.status !== 'fighting') {
    const won = session.records.at(-1)?.result === 'won';
    const label = session.status === 'between' ? `Continue` : 'See results';
    return `
      <div class="controls done">
        <p class="banner ${won ? 'good' : 'bad'}">${won ? `You defeated ${esc(session.records.at(-1)!.trainerName)}!` : 'You have no Pokémon left to battle…'}</p>
        <button class="primary" data-action="continue">${label}</button>
      </div>`;
  }

  const legal = session.playerActions();
  if (legal.wait) return '<div class="controls waiting"><p class="hint">Waiting…</p></div>';
  if (legal.forceSwitch) {
    return `<div class="controls"><p class="prompt">Choose your next Pokémon.</p><div class="switch-grid">${switchButtons(app, legal.switches)}</div></div>`;
  }

  const active = battle(app).active('p1').species.name;
  const tabs = `
    <div class="tabs" role="tablist">
      <button role="tab" data-action="menu" data-menu="main" aria-selected="${view.menu === 'main'}">Fight</button>
      <button role="tab" data-action="menu" data-menu="switch" aria-selected="${view.menu === 'switch'}" ${legal.switches.length ? '' : 'disabled'}>Switch</button>
      <button role="tab" data-action="menu" data-menu="bag" aria-selected="${view.menu === 'bag' || view.menu === 'target'}" ${legal.canUseItem ? '' : 'disabled'}>Bag</button>
    </div>`;

  let body = '';
  if (view.menu === 'main') body = `<p class="prompt">What will ${esc(active)} do?</p><div class="move-grid">${moveButtons(app)}</div>`;
  if (view.menu === 'switch') body = `<p class="prompt">Switch to…</p><div class="switch-grid">${switchButtons(app, legal.switches)}</div>`;
  if (view.menu === 'bag') body = `<p class="prompt">Use an item. It takes your turn.</p><div class="bag-grid">${bagButtons(app)}</div>`;
  if (view.menu === 'target' && view.item) {
    body = `<p class="prompt">Use ${esc(view.item.name)} on… <button class="link" data-action="menu" data-menu="bag">back</button></p><div class="switch-grid">${targetButtons(app, view.item)}</div>`;
  }
  return `<div class="controls">${tabs}${body}</div>`;
}

function logPanel(app: App): string {
  const lines = app.battleView!.log
    .map((l) => (l.turn ? `<li class="turn">Turn ${l.turn}</li>` : `<li class="${l.tone ?? ''}">${esc(l.text)}</li>`))
    .join('');
  return `<ol class="log" aria-live="polite" aria-label="Battle log">${lines}</ol>`;
}

export const battleScreen: Screen = {
  render(app) {
    const session = app.session!;
    const trainer = session.currentTrainer;
    return `
      <section class="screen battle">
        <header class="battle-head">
          <span>Fight ${session.fightIndex + 1} of ${session.trainers.length} · <strong>${esc(trainer.title)} ${esc(trainer.name)}</strong></span>
          <span class="meta">${esc(DIFFICULTY[session.tier].label)} · seed <code>${esc(session.setup.seed)}</code></span>
        </header>
        <div class="battle-layout">
          <div class="battle-main">
            ${field(app)}
            <div class="party-strip" aria-label="Your team">${partyStrip(app)}</div>
            ${app.message ? `<p class="error">${esc(app.message)}</p>` : ''}
            ${controls(app)}
          </div>
          ${logPanel(app)}
        </div>
      </section>`;
  },

  afterRender() {
    const log = document.querySelector('.log');
    if (log) log.scrollTop = log.scrollHeight;
  },

  actions: {
    menu(app, data) {
      app.battleView!.menu = data.menu as Menu;
      app.message = null;
      app.render();
    },
    async move(app, data) {
      app.message = null;
      app.session!.act({ type: 'move', slot: Number(data.slot) });
      await playEvents(app);
    },
    async switch(app, data) {
      app.message = null;
      app.session!.act({ type: 'switch', partyIndex: Number(data.index) });
      await playEvents(app);
    },
    'pick-item'(app, data) {
      const view = app.battleView!;
      const item = app.session!.bagItems().find((b) => b.item.id === data.id)?.item ?? null;
      if (!item) return;
      const b = battle(app);
      // Battle items only ever go on the Pokémon in battle.
      if (item.effect.kind === 'boost') {
        const problem = b.itemProblem('p1', item, b.partyIndex(b.active('p1')));
        if (problem) throw new Error(problem);
        return battleScreen.actions['use-item'](app, { index: String(b.partyIndex(b.active('p1'))), id: item.id });
      }
      view.item = item;
      view.menu = 'target';
      app.render();
    },
    async 'use-item'(app, data) {
      const view = app.battleView!;
      const item = view.item ?? app.session!.bagItems().find((b) => b.item.id === data.id)?.item;
      if (!item) return;
      app.message = null;
      app.session!.act({ type: 'item', item, partyIndex: Number(data.index) });
      await playEvents(app);
    },
    continue(app) {
      const session = app.session!;
      if (session.status === 'between') app.go('between');
      else app.go('results');
    },
  },
};
