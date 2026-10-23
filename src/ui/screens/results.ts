import { DIFFICULTY } from '../../config/difficulty';
import { createRun } from '../../game/run';
import type { Screen } from '../app';
import { esc } from '../dom';
import { icon } from '../sprites';

export const resultsScreen: Screen = {
  render(app) {
    const session = app.session!;
    const won = session.status === 'won';
    const fights = session.records
      .map((r) => `
        <li class="${r.result}">
          <span class="fight-name">${esc(r.trainerName)}</span>
          <span class="fight-result">${r.result === 'won' ? 'Won' : 'Lost'} in ${r.turns} turns</span>
          <span class="fight-fainted">${r.fainted.length ? `Fainted: ${r.fainted.map((s) => `${icon(s, true)} ${esc(s)}`).join(', ')}` : 'No faints'}</span>
        </li>`)
      .join('');
    const allFainted = session.records.flatMap((r) => r.fainted);

    return `
      <section class="screen results">
        <header class="screen-head">
          <h1>${won ? 'Champion!' : 'Defeated'}</h1>
          <p>${won ? 'You beat every trainer with a random team.' : `Your run ended against ${esc(session.records.at(-1)!.trainerName)}.`}</p>
        </header>
        <dl class="summary">
          <div><dt>Seed</dt><dd><code>${esc(session.setup.seed)}</code> <button class="link" data-action="copy">Copy</button></dd></div>
          <div><dt>Difficulty</dt><dd>${esc(DIFFICULTY[session.tier].label)}</dd></div>
          <div><dt>Generation</dt><dd>Gen ${session.rules.gen} · ${esc(session.rules.name)}</dd></div>
          <div><dt>Champion</dt><dd>${session.options.includeChampion ? 'Included' : 'Not included'}</dd></div>
          <div><dt>Fainted</dt><dd>${allFainted.length ? allFainted.map(esc).join(', ') : 'None'}</dd></div>
        </dl>
        <h2>Fights</h2>
        <ol class="fights">${fights}</ol>
        ${app.message ? `<p class="hint">${esc(app.message)}</p>` : ''}
        <div class="actions">
          <button data-action="replay">Play this seed again</button>
          <button class="primary" data-action="new">New run</button>
        </div>
      </section>`;
  },

  actions: {
    async copy(app) {
      await navigator.clipboard.writeText(app.session!.setup.seed);
      app.message = 'Seed copied.';
      app.render();
    },
    replay(app) {
      const { setup } = app.session!;
      app.setup = createRun(app.rules, setup.tier, setup.seed);
      app.cart = {};
      app.session = null;
      app.go('team');
    },
    new(app) {
      app.session = null;
      app.setup = null;
      app.seedInput = '';
      app.go('home');
    },
  },
};
