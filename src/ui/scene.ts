// The Gen 1-style battle scene: a 160x144 "Game Boy screen" scaled to fit,
// with sprites, HP boxes and a text box, all driven imperatively so
// animations (lunges, blinks, HP drains, faints) can run in order.

import { esc } from './dom';
import type { Beat } from './classic';
import type { SideId } from './log';
import { icon, sprite } from './sprites';

export interface MonView {
  species: string;
  name: string;
  level: number;
  hp: number;
  maxhp: number;
  status: string;
}

export type TextSpeed = 'slow' | 'medium' | 'fast' | 'instant';

export interface SceneSettings {
  textSpeed: TextSpeed;
  /** Move on from a message by itself after a pause (click or press a key to go sooner). */
  autoAdvance: boolean;
}

export interface ListOption {
  html: string;
  disabled?: boolean;
  /** Shown in the text box if a disabled option is picked, e.g. "No PP left!". */
  reason?: string;
}

const CHAR_MS: Record<TextSpeed, number> = { slow: 45, medium: 25, fast: 10, instant: 0 };
const AUTO_ADVANCE_MS: Record<TextSpeed, number> = { slow: 1300, medium: 1000, fast: 700, instant: 450 };
/** Characters per line in the text box (18 on the Game Boy). */
const LINE_CHARS = 18;

const A_KEYS = new Set(['Enter', ' ', 'z', 'Z']);
const B_KEYS = new Set(['Escape', 'Backspace', 'x', 'X']);

const STATUS_LABEL: Record<string, string> = { slp: 'SLP', par: 'PAR', brn: 'BRN', psn: 'PSN', tox: 'PSN', frz: 'FRZ' };

/** Wraps text into Game Boy-width lines, breaking at spaces. */
export function wrapLines(text: string, width = LINE_CHARS): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Plays an animation and resolves when it ends, or once its time is up even
 * if the browser paused it (it does in hidden tabs), so a battle never stalls.
 */
function run(el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
  const animation = el.animate(keyframes, options);
  const duration = Number(options.duration ?? 0);
  return Promise.race([animation.finished.then(() => undefined), wait(duration + 80)]).then(() => {
    if (animation.playState !== 'finished') animation.finish();
  });
}

export class BattleScene {
  readonly root: HTMLElement;
  private readonly gen: number;
  private readonly views: Partial<Record<SideId, MonView>> = {};
  private advanceResolver: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** Every message shown, for the battle log. */
  readonly history: string[] = [];
  onMessage: ((text: string) => void) | null = null;

  constructor(
    container: HTMLElement,
    gen: number,
    public settings: SceneSettings,
  ) {
    this.gen = gen;
    container.innerHTML = `
      <div class="gb" tabindex="0" aria-label="Battle screen">
        <div class="gb-field">
          <div class="gb-box p2" hidden></div>
          <div class="gb-mon p2"><div class="gb-sprite p2"></div></div>
          <div class="gb-trainer p2" hidden></div>
          <div class="gb-balls p2" hidden></div>
          <div class="gb-mon p1"><div class="gb-sprite p1"></div></div>
          <div class="gb-box p1" hidden></div>
          <div class="gb-balls p1" hidden></div>
        </div>
        <div class="gb-text" aria-live="polite"><p class="gb-line"></p><p class="gb-line"></p><span class="gb-arrow" hidden>▼</span></div>
        <div class="gb-menu" hidden></div>
        <div class="gb-overlay" hidden></div>
      </div>`;
    this.root = container.querySelector('.gb')!;
    // Clicking the screen (or the text box) advances text.
    this.root.addEventListener('click', (e) => {
      if ((e.target as Element).closest('.gb-menu, .gb-overlay')) return;
      this.advance();
    });
  }

  destroy() {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }

  /** `n` Game Boy pixels at the screen's current size. */
  private px(n: number): string {
    return `${(this.root.clientWidth / 160) * n}px`;
  }

  private advance() {
    const resolve = this.advanceResolver;
    this.advanceResolver = null;
    resolve?.();
  }

  /** Listens for A/B keys while waiting on text or a menu. */
  private listen(handler: (e: KeyboardEvent) => void) {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = handler;
    window.addEventListener('keydown', handler);
  }

  // ------------------------------------------------------------ text box

  /** Shows a message, typed out, then waits for a click/key (or auto-advance). */
  async say(text: string, opts: { wait?: boolean } = {}): Promise<void> {
    this.history.push(text);
    this.onMessage?.(text);
    const lines = wrapLines(text);
    const [first, second] = Array.from(this.root.querySelectorAll<HTMLElement>('.gb-line'));
    const arrow = this.q('.gb-arrow');
    for (let page = 0; page < lines.length; page += 2) {
      first.textContent = '';
      second.textContent = '';
      arrow.hidden = true;
      await this.type(first, lines[page] ?? '');
      await this.type(second, lines[page + 1] ?? '');
      const last = page + 2 >= lines.length;
      if (!last || opts.wait !== false) await this.waitForAdvance(last && this.settings.autoAdvance);
    }
  }

  /** Clears the text box (e.g. before a menu). */
  clearText() {
    for (const line of this.root.querySelectorAll<HTMLElement>('.gb-line')) line.textContent = '';
    this.q('.gb-arrow').hidden = true;
  }

  /** Writes text into the box at once, without waiting (prompts next to menus). */
  setText(text: string) {
    const lines = wrapLines(text);
    const [first, second] = Array.from(this.root.querySelectorAll<HTMLElement>('.gb-line'));
    first.textContent = lines[0] ?? '';
    second.textContent = lines.slice(1).join(' ');
    this.q('.gb-arrow').hidden = true;
  }

  private async type(el: HTMLElement, text: string) {
    const ms = CHAR_MS[this.settings.textSpeed];
    if (ms === 0) {
      el.textContent = text;
      return;
    }
    let skip = false;
    this.advanceResolver = () => (skip = true);
    for (let i = 1; i <= text.length; i++) {
      if (skip) {
        el.textContent = text;
        break;
      }
      el.textContent = text.slice(0, i);
      await wait(ms);
    }
    this.advanceResolver = null;
  }

  private waitForAdvance(auto: boolean): Promise<void> {
    const arrow = this.q('.gb-arrow');
    arrow.hidden = auto;
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = () => {
        clearTimeout(timer);
        arrow.hidden = true;
        this.advanceResolver = null;
        resolve();
      };
      this.advanceResolver = done;
      this.listen((e) => {
        if (A_KEYS.has(e.key) || B_KEYS.has(e.key)) {
          e.preventDefault();
          this.advance();
        }
      });
      if (auto) timer = setTimeout(done, AUTO_ADVANCE_MS[this.settings.textSpeed]);
    });
  }

  // ------------------------------------------------------------ sprites and boxes

  /** Shows a Pokémon and its box straight away (no animation). */
  place(side: SideId, view: MonView) {
    this.views[side] = { ...view };
    this.q(`.gb-sprite.${side}`).innerHTML = sprite(view.species, this.gen, side, 1);
    this.q(`.gb-sprite.${side}`).style.visibility = view.hp > 0 ? 'visible' : 'hidden';
    this.renderBox(side);
  }

  private renderBox(side: SideId) {
    const v = this.views[side];
    const box = this.q(`.gb-box.${side}`);
    if (!v) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    // Gen 1 shows a status condition where the level would be.
    const level = STATUS_LABEL[v.status] ?? `:L${v.level}`;
    box.innerHTML = `
      <div class="gb-name">${esc(v.name)}</div>
      <div class="gb-level">${esc(level)}</div>
      <div class="gb-hp"><span class="gb-hp-label">HP:</span><span class="gb-hp-track"><span class="gb-hp-fill"></span></span></div>
      ${side === 'p1' ? `<div class="gb-hp-numbers"></div>` : ''}`;
    this.paintHp(side, v.hp, v.maxhp);
  }

  private paintHp(side: SideId, hp: number, maxhp: number) {
    const fill = this.root.querySelector<HTMLElement>(`.gb-box.${side} .gb-hp-fill`);
    if (!fill) return;
    const pct = maxhp > 0 ? Math.max(0, Math.min(100, (hp / maxhp) * 100)) : 0;
    fill.style.width = `${pct}%`;
    fill.className = `gb-hp-fill ${pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low'}`;
    const numbers = this.root.querySelector<HTMLElement>(`.gb-box.${side} .gb-hp-numbers`);
    if (numbers) numbers.textContent = `${Math.round(hp)}/ ${maxhp}`;
  }

  setStatus(side: SideId, status: string) {
    const v = this.views[side];
    if (!v) return;
    v.status = status;
    this.renderBox(side);
  }

  /** Drains (or fills) the HP bar a step at a time, like the games. */
  async drain(side: SideId, hp: number, maxhp: number) {
    const v = this.views[side];
    if (!v) return;
    if (maxhp) v.maxhp = maxhp;
    const from = v.hp;
    const to = Math.max(0, hp);
    v.hp = to;
    const duration = Math.min(1200, Math.max(250, (Math.abs(to - from) / Math.max(1, v.maxhp)) * 1500));
    // Timed by the clock rather than animation frames, so it also finishes in a hidden tab.
    const start = performance.now();
    for (;;) {
      const t = Math.min(1, (performance.now() - start) / duration);
      this.paintHp(side, from + (to - from) * t, v.maxhp);
      if (t >= 1) break;
      await wait(16);
    }
  }

  async sendOut(side: SideId, view: MonView) {
    this.hideBalls();
    this.place(side, view);
    const el = this.q(`.gb-sprite.${side}`);
    el.style.visibility = 'visible';
    await run(el, 
      [{ transform: 'scale(0.1)', opacity: 0, filter: 'brightness(3)' }, { transform: 'scale(1.1)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', filter: 'none' }],
      { duration: 380, easing: 'ease-out' },
    );
  }

  async withdraw(side: SideId) {
    const el = this.q(`.gb-sprite.${side}`);
    await run(el, [{ transform: 'scale(1)' }, { transform: 'scale(0.1)', opacity: 0 }], { duration: 300, easing: 'ease-in' });
    el.style.visibility = 'hidden';
    this.q(`.gb-box.${side}`).hidden = true;
  }

  /** The attacker lunges toward the foe; special moves also flash the screen. */
  async attack(side: SideId, category: 'Physical' | 'Special' | 'Status') {
    const el = this.q(`.gb-sprite.${side}`);
    const dx = this.px(side === 'p1' ? 10 : -10);
    if (category === 'Status') {
      await run(el, [{ transform: 'translateX(0)' }, { transform: `translateX(${this.px(-3)})` }, { transform: `translateX(${this.px(3)})` }, { transform: 'translateX(0)' }], { duration: 300 });
      return;
    }
    await run(el, [{ transform: 'translateX(0)' }, { transform: `translateX(${dx})` }, { transform: 'translateX(0)' }], { duration: 260, easing: 'ease-in-out' });
    if (category === 'Special') {
      await run(this.q('.gb-field'), [{ filter: 'invert(0)' }, { filter: 'invert(1)' }, { filter: 'invert(0)' }], { duration: 220 });
    }
  }

  /** The target blinks when hit. */
  async hit(side: SideId) {
    const el = this.q(`.gb-sprite.${side}`);
    await run(el, 
      [{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 1 }],
      { duration: 420, easing: 'steps(7, end)' },
    );
  }

  /** Fainting: the sprite slides down out of view. */
  async faint(side: SideId) {
    const el = this.q(`.gb-sprite.${side}`);
    await run(el, [{ transform: 'translateY(0)' }, { transform: 'translateY(110%)' }], { duration: 450, easing: 'ease-in' });
    el.style.visibility = 'hidden';
    const v = this.views[side];
    if (v) v.hp = 0;
    this.q(`.gb-box.${side}`).hidden = true;
  }

  /** Battle intro: the trainer slides in, with both sides' Poké Ball counts. */
  async trainerIn(url: string, balls: { p1: boolean[]; p2: boolean[] }) {
    const trainer = this.q('.gb-trainer.p2');
    trainer.innerHTML = `<img src="${esc(url)}" alt="" draggable="false">`;
    trainer.hidden = false;
    for (const side of ['p1', 'p2'] as const) {
      const el = this.q(`.gb-balls.${side}`);
      el.innerHTML = balls[side].map((alive) => `<span class="gb-ball${alive ? '' : ' out'}"></span>`).join('');
      el.hidden = false;
    }
    await run(trainer, [{ transform: `translateX(${this.px(-170)})` }, { transform: 'translateX(0)' }], { duration: 700, easing: 'ease-out' });
  }

  async trainerOut() {
    const trainer = this.q('.gb-trainer.p2');
    if (trainer.hidden) return;
    await run(trainer, [{ transform: 'translateX(0)' }, { transform: `translateX(${this.px(80)})`, opacity: 0 }], { duration: 400, easing: 'ease-in' });
    trainer.hidden = true;
  }

  /** The trainer steps back in (after you win). */
  async trainerBack() {
    const trainer = this.q('.gb-trainer.p2');
    if (!trainer.innerHTML) return;
    trainer.hidden = false;
    await run(trainer, [{ transform: `translateX(${this.px(80)})`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 500, easing: 'ease-out' });
  }

  private hideBalls() {
    for (const el of this.root.querySelectorAll<HTMLElement>('.gb-balls')) el.hidden = true;
  }

  /** Plays a turn's beats in order. */
  async play(beats: Beat[]) {
    for (const beat of beats) {
      switch (beat.kind) {
        case 'text': await this.say(beat.text); break;
        case 'sendout': await this.sendOut(beat.side, { species: beat.species, name: beat.species.toUpperCase(), level: beat.level, hp: beat.hp, maxhp: beat.maxhp, status: beat.status }); break;
        case 'withdraw': await this.withdraw(beat.side); break;
        case 'attack': await this.attack(beat.side, beat.category); break;
        case 'hit': await this.hit(beat.side); break;
        case 'hp': await this.drain(beat.side, beat.hp, beat.maxhp); break;
        case 'status': this.setStatus(beat.side, beat.status); break;
        case 'faint': await this.faint(beat.side); break;
      }
    }
  }

  // ------------------------------------------------------------ menus

  /**
   * A menu in the bottom box (`box`) or over the whole screen (`overlay`).
   * Resolves with the chosen index, or null when backed out of.
   */
  choose(
    options: ListOption[],
    opts: {
      place: 'box' | 'overlay';
      columns?: number;
      cancellable?: boolean;
      title?: string;
      /** Extra panel next to the list for the option under the cursor (e.g. a move's TYPE and PP). */
      describe?: (index: number) => string;
      start?: number;
      /** Called as the cursor moves, so a caller can remember it. */
      onCursor?: (index: number) => void;
      className?: string;
    },
  ): Promise<number | null> {
    const host = this.q(opts.place === 'box' ? '.gb-menu' : '.gb-overlay');
    const columns = opts.columns ?? 1;
    let cursor = Math.max(0, Math.min(opts.start ?? 0, options.length - 1));

    const render = () => {
      host.className = `${opts.place === 'box' ? 'gb-menu' : 'gb-overlay'} ${opts.className ?? ''}`;
      host.innerHTML = `
        ${opts.title ? `<div class="gb-menu-title">${esc(opts.title)}</div>` : ''}
        ${opts.describe ? `<div class="gb-menu-side">${opts.describe(cursor)}</div>` : ''}
        <ul class="gb-options cols-${columns}" role="listbox">
          ${options.map((o, i) => `<li role="option" aria-selected="${i === cursor}" aria-disabled="${!!o.disabled}" data-i="${i}" class="${i === cursor ? 'cursor' : ''}${o.disabled ? ' disabled' : ''}"><span class="gb-cursor">${i === cursor ? '▶' : ''}</span>${o.html}</li>`).join('')}
        </ul>
        ${opts.cancellable ? '<button class="gb-back" data-back>◀ BACK</button>' : ''}`;
    };

    host.hidden = false;
    render();
    return new Promise((resolve) => {
      const finish = (value: number | null) => {
        host.hidden = true;
        host.innerHTML = '';
        host.onclick = null;
        if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
        this.keyHandler = null;
        resolve(value);
      };
      const pick = async (i: number) => {
        const option = options[i];
        if (option.disabled) {
          if (option.reason) {
            host.hidden = true;
            await this.say(option.reason, { wait: true });
            host.hidden = false;
          }
          return;
        }
        finish(i);
      };
      host.onclick = (e) => {
        const target = e.target as Element;
        if (target.closest('[data-back]')) return finish(null);
        const li = target.closest<HTMLElement>('li[data-i]');
        if (li) {
          cursor = Number(li.dataset.i);
          opts.onCursor?.(cursor);
          void pick(cursor);
        }
      };
      this.listen((e) => {
        const move = (d: number) => {
          cursor = (cursor + d + options.length) % options.length;
          opts.onCursor?.(cursor);
          render();
        };
        if (e.key === 'ArrowDown') move(columns);
        else if (e.key === 'ArrowUp') move(-columns);
        else if (e.key === 'ArrowRight' && columns > 1) move(1);
        else if (e.key === 'ArrowLeft' && columns > 1) move(-1);
        else if (A_KEYS.has(e.key)) void pick(cursor);
        else if (B_KEYS.has(e.key) && opts.cancellable) finish(null);
        else return;
        e.preventDefault();
      });
    });
  }

  /** Party list for menus, Gen 1 style: icon, name, level, HP bar, HP numbers. */
  static partyRow(p: { species: string; level: number; hp: number; maxhp: number; status: string; fainted: boolean }): string {
    const pct = p.maxhp > 0 ? (p.hp / p.maxhp) * 100 : 0;
    const status = p.fainted ? 'FNT' : (STATUS_LABEL[p.status] ?? `:L${p.level}`);
    return `
      <span class="gb-party">
        ${icon(p.species, p.fainted)}
        <span class="gb-party-name">${esc(p.species.toUpperCase())}</span>
        <span class="gb-party-level">${esc(status)}</span>
        <span class="gb-hp"><span class="gb-hp-label">HP:</span><span class="gb-hp-track"><span class="gb-hp-fill ${pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low'}" style="width:${pct}%"></span></span></span>
        <span class="gb-party-numbers">${p.hp}/ ${p.maxhp}</span>
      </span>`;
  }
}
