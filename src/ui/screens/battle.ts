// The battle screen, played like the Gen 1 games: the trainer slides in,
// Pokémon are sent out, messages type out one at a time in the text box,
// and you pick from FIGHT / PKMN / ITEM / RUN.

import { Sprites } from '@pkmn/img';
import { DIFFICULTY } from '../../config/difficulty';
import type { Action, EngineBattle, LegalActions } from '../../engine/battle';
import type { BattleItem } from '../../engine/items';
import type { App, Screen } from '../app';
import { classicBeats, type ClassicContext } from '../classic';
import { esc } from '../dom';
import { BattleScene, type ListOption, type MonView, type TextSpeed } from '../scene';
import { saveSettings } from '../settings';

export interface BattleView {
  started: boolean;
  scene: BattleScene | null;
  /** Remembered menu positions, like the games. */
  mainCursor: number;
  moveCursor: number;
}

/** Sets up the view for a fight that has just started. */
export function startBattleView(_app: App): BattleView {
  return { started: false, scene: null, mainCursor: 0, moveCursor: 0 };
}

const upper = (s: string) => s.toUpperCase();

function battle(app: App): EngineBattle {
  return app.session!.battle!;
}

function viewOf(b: EngineBattle, side: 'p1' | 'p2'): MonView {
  const p = b.active(side);
  return { species: p.species.name, name: upper(p.species.name), level: p.level, hp: p.hp, maxhp: p.maxhp, status: p.status === 'fnt' ? '' : p.status };
}

function partyOptions(app: App, why: (i: number) => string | null): ListOption[] {
  const b = battle(app);
  return app.session!.party.map((_, i) => {
    const p = b.pokemon('p1', i);
    const reason = why(i);
    return {
      html: BattleScene.partyRow({ species: p.species.name, level: p.level, hp: p.hp, maxhp: p.maxhp, status: p.status, fainted: p.fainted }),
      disabled: reason !== null,
      reason: reason ?? undefined,
    };
  });
}

/** Why the player can't switch to party slot `i`, in Gen 1 words, or null if they can. */
function switchProblem(app: App, legal: LegalActions, i: number): string | null {
  const p = battle(app).pokemon('p1', i);
  if (p.fainted) return 'There’s no will to fight!';
  if (p.isActive) return `${upper(p.species.name)} is already out!`;
  if (!legal.switches.includes(i)) return 'Can’t switch out now!';
  return null;
}

/** Asks the player for this turn's action through the Gen 1 menus. */
async function chooseAction(app: App, scene: BattleScene, legal: LegalActions): Promise<Action | null> {
  const view = app.battleView!;
  const session = app.session!;
  const b = battle(app);

  if (legal.forceSwitch) {
    scene.setText('Bring out which POKéMON?');
    const i = await scene.choose(partyOptions(app, (i) => switchProblem(app, legal, i)), { place: 'overlay', title: 'Choose a POKéMON.', className: 'party' });
    return i === null ? null : { type: 'switch', partyIndex: i };
  }

  // Locked into a move (charging, Thrash, recharge): the game carries on by itself.
  if (legal.moves.length === 1 && legal.moves[0].pp === undefined) return { type: 'move', slot: legal.moves[0].slot };

  for (;;) {
    // Gen 1 shows the menu with an empty text box beside it.
    scene.clearText();
    const choice = await scene.choose(
      ['FIGHT', 'PKMN', 'ITEM', 'RUN'].map((label) => ({ html: label })),
      { place: 'box', columns: 2, start: view.mainCursor, onCursor: (i) => (view.mainCursor = i), className: 'main' },
    );
    if (choice === null) continue;
    view.mainCursor = choice;

    if (choice === 0) {
      const moves = legal.moves;
      const info = (i: number) => {
        const m = moves[i];
        const move = app.rules.data.moves.find((x) => x.id === m.id);
        return `<div>TYPE/</div><div class="gb-indent">${esc(upper(move?.type ?? '???'))}</div><div class="gb-right">${m.pp ?? '--'}/${m.maxpp ?? '--'}</div>`;
      };
      const pick = await scene.choose(
        moves.map((m) => {
          const move = app.rules.data.moves.find((x) => x.id === m.id);
          return {
            html: esc(upper(move?.name ?? m.id)),
            disabled: m.disabled || m.pp === 0,
            reason: m.disabled ? 'That move is disabled!' : 'No PP left for this move!',
          };
        }),
        { place: 'box', cancellable: true, describe: info, start: view.moveCursor, onCursor: (i) => (view.moveCursor = i), className: 'moves' },
      );
      if (pick === null) continue;
      view.moveCursor = pick;
      return { type: 'move', slot: moves[pick].slot };
    }

    if (choice === 1) {
      scene.clearText();
      const i = await scene.choose(partyOptions(app, (i) => switchProblem(app, legal, i)), { place: 'overlay', cancellable: true, title: 'Choose a POKéMON.', className: 'party' });
      if (i === null) continue;
      return { type: 'switch', partyIndex: i };
    }

    if (choice === 2) {
      const items = session.bagItems();
      if (!legal.canUseItem) {
        await scene.say('Can’t use items now!');
        continue;
      }
      if (items.length === 0) {
        await scene.say('The bag is empty!');
        continue;
      }
      const pick = await scene.choose(
        items.map(({ item, count }) => ({ html: `<span>${esc(upper(item.name))}</span><span class="gb-count">×${count}</span>` })),
        { place: 'overlay', cancellable: true, title: 'ITEM', className: 'items' },
      );
      if (pick === null) continue;
      const item: BattleItem = items[pick].item;
      const activeIndex = b.partyIndex(b.active('p1'));
      if (item.effect.kind === 'boost') {
        const problem = b.itemProblem('p1', item, activeIndex);
        if (problem) {
          await scene.say(problem);
          continue;
        }
        return { type: 'item', item, partyIndex: activeIndex };
      }
      const target = await scene.choose(partyOptions(app, (i) => b.itemProblem('p1', item, i)), {
        place: 'overlay', cancellable: true, title: `Use ${upper(item.name)} on which POKéMON?`, className: 'party',
      });
      if (target === null) continue;
      return { type: 'item', item, partyIndex: target };
    }

    await scene.say('No! There’s no running from a trainer battle!');
  }
}

/** Runs the whole fight on the scene: intro, turns, and the ending. */
async function runBattle(app: App, scene: BattleScene) {
  const session = app.session!;
  const b = battle(app);
  const trainer = session.currentTrainer;
  const opponent = upper(trainer.name);
  const title = `${upper(trainer.title)} ${opponent}`;
  const player = app.playerName;
  const moveCategory = (name: string) => app.rules.data.moves.find((m) => m.name === name)?.category ?? 'Status';

  // Intro, as in the games: the trainer slides in, then each side sends out its lead.
  const balls = {
    p1: session.party.map((_, i) => !b.pokemon('p1', i).fainted),
    p2: b.sim.p2.pokemon.map((p) => !p.fainted),
  };
  if (trainer.sprite) await scene.trainerIn(Sprites.getAvatar(trainer.sprite), balls);
  await scene.say(`${title} wants to fight!`);
  await scene.trainerOut();
  await scene.say(`${opponent} sent out ${upper(b.active('p2').species.name)}!`);
  await scene.sendOut('p2', viewOf(b, 'p2'));
  await scene.say(`Go! ${upper(b.active('p1').species.name)}!`);
  await scene.sendOut('p1', viewOf(b, 'p1'));

  let logIndex = b.log.length;
  while (session.status === 'fighting') {
    const legal = session.playerActions();
    if (legal.wait) break;
    const action = await chooseAction(app, scene, legal);
    if (!action) continue;
    const before = { p1: upper(b.active('p1').species.name), p2: upper(b.active('p2').species.name) };
    const active: ClassicContext['active'] = {
      p1: b.active('p1').fainted ? undefined : before.p1,
      p2: b.active('p2').fainted ? undefined : before.p2,
    };
    try {
      session.act(action);
    } catch (error) {
      await scene.say((error as Error).message);
      continue;
    }
    const beats = classicBeats(b.log.slice(logIndex), { gen: app.rules.gen, player, opponent, moveCategory, active });
    logIndex = b.log.length;
    await scene.play(beats);
  }

  const won = session.records.at(-1)?.result === 'won';
  if (won) {
    await scene.say(`${player} defeated ${title}!`);
    await scene.trainerBack();
  } else {
    await scene.say(`${player} is out of useable POKéMON!`);
    await scene.say(`${player} blacked out!`);
  }
  scene.setText(won ? (session.status === 'won' ? 'You beat every trainer!' : 'On to the next room…') : 'The challenge is over.');
  document.querySelector<HTMLElement>('.battle-after')?.removeAttribute('hidden');
  document.querySelector<HTMLButtonElement>('.battle-after button')?.focus();
}

export const battleScreen: Screen = {
  render(app) {
    const session = app.session!;
    const trainer = session.currentTrainer;
    const s = app.settings;
    const speeds: [TextSpeed, string][] = [['slow', 'Slow'], ['medium', 'Medium'], ['fast', 'Fast'], ['instant', 'Instant']];
    return `
      <section class="screen battle">
        <header class="battle-head">
          <span>Fight ${session.fightIndex + 1} of ${session.trainers.length} · <strong>${esc(trainer.title)} ${esc(trainer.name)}</strong></span>
          <span class="meta">${esc(DIFFICULTY[session.tier].label)} · seed <code>${esc(session.setup.seed)}</code></span>
        </header>
        <div class="gb-host"></div>
        <div class="battle-after" hidden>
          <button class="primary" data-action="continue">${session.status === 'between' || session.status === 'fighting' ? 'Continue' : 'See results'}</button>
        </div>
        <p class="controls-hint hint">Click or tap to continue text. Keys: arrows to move, Enter/Z to choose, Esc/X to go back.</p>
        <div class="battle-settings">
          <label>Text speed
            <select data-input="speed">${speeds.map(([v, l]) => `<option value="${v}" ${s.textSpeed === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </label>
          <label class="check"><input type="checkbox" data-input="auto" ${s.autoAdvance ? 'checked' : ''}> Auto-advance text</label>
        </div>
        <details class="battle-log"><summary>Battle log</summary><ol></ol></details>
      </section>`;
  },

  afterRender(app) {
    const view = app.battleView!;
    if (view.started) return;
    view.started = true;
    const host = document.querySelector<HTMLElement>('.gb-host')!;
    const scene = new BattleScene(host, app.rules.gen, app.settings);
    view.scene = scene;
    const log = document.querySelector('.battle-log ol')!;
    scene.onMessage = (text) => {
      const li = document.createElement('li');
      li.textContent = text;
      log.append(li);
    };
    scene.root.focus();
    void runBattle(app, scene).catch((error) => {
      console.error(error);
      scene.setText(`Something went wrong: ${(error as Error).message}`);
    });
  },

  actions: {
    continue(app) {
      const session = app.session!;
      app.battleView?.scene?.destroy();
      if (session.status === 'between') app.go('between');
      else app.go('results');
    },
  },

  inputs: {
    speed(app, value) {
      app.settings.textSpeed = value as TextSpeed;
      saveSettings(app.settings);
    },
    auto(app, _value, checked) {
      app.settings.autoAdvance = checked;
      saveSettings(app.settings);
    },
  },
};
