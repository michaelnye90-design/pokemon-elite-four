import { describe, expect, it } from 'vitest';
import { GreedyAI } from '../ai/tiers';
import { createRng } from '../engine/rng';
import { autoFill } from '../generator/items';
import { gen1 } from '../rules/gen1';
import { createRun } from './run';
import { RunSession } from './session';

/** Plays a whole run with the player side driven by an AI. */
function autoplay(seed: string, tier: 'easy' | 'normal' | 'nightmare', includeChampion = true) {
  const setup = createRun(gen1, tier, seed);
  const session = new RunSession(gen1, setup, autoFill(setup.shop, setup.budget), { includeChampion });
  const player = new GreedyAI();
  const rng = createRng(seed, 'player');
  const hpAtStart: number[][] = [];
  const status = () => session.status; // read fresh; act() changes it
  while (status() === 'between') {
    session.nextFight();
    const battle = session.startFight();
    hpAtStart.push(session.party.map((_, i) => battle.pokemon('p1', i).hp));
    for (let turn = 0; status() === 'fighting' && turn < 500; turn++) {
      session.act(player.chooseAction({ battle, side: 'p1', rng, items: [] }));
    }
  }
  return { session, hpAtStart };
}

describe('a run', () => {
  it('fights the trainers in order and ends in a win or a loss with a record of each fight', () => {
    const { session } = autoplay('session-a', 'easy');
    expect(['won', 'lost']).toContain(session.status);
    expect(session.records.map((r) => r.trainerId)).toEqual(
      ['lorelei', 'bruno', 'agatha', 'lance', 'champion'].slice(0, session.records.length),
    );
    expect(session.records.slice(0, -1).every((r) => r.result === 'won')).toBe(true);
    if (session.status === 'won') expect(session.records).toHaveLength(5);
    else expect(session.records.at(-1)!.result).toBe('lost');
  });

  it('carries damage into the next fight (no free healing)', () => {
    const { session, hpAtStart } = autoplay('session-b', 'easy');
    expect(session.records.length).toBeGreaterThan(1);
    // Something took damage in the first fight and still has it at the start of the second.
    const [fresh, secondFightStart] = hpAtStart;
    expect(secondFightStart.some((hp, i) => hp < fresh[i])).toBe(true);
  });

  it('can leave out the optional Champion', () => {
    const { session } = autoplay('session-c', 'easy', false);
    expect(session.trainers.map((t) => t.id)).toEqual(['lorelei', 'bruno', 'agatha', 'lance']);
  });

  it('faces the run’s own Champion team', () => {
    const setup = createRun(gen1, 'normal', 'session-d');
    const session = new RunSession(gen1, setup, {}, { includeChampion: true });
    expect(session.trainerTeam(session.trainers[4]).id).toBe(setup.rivalTeamId);
  });

  it('spends bag items and refuses ones that have run out', () => {
    const setup = createRun(gen1, 'normal', 'session-e');
    const session = new RunSession(gen1, setup, { hyperpotion: 1 }, { includeChampion: true });
    session.nextFight();
    const battle = session.startFight();
    battle.active('p1').hp = 10;
    const potion = session.bagItems()[0].item;
    session.act({ type: 'item', item: potion, partyIndex: battle.partyIndex(battle.active('p1')) });
    expect(session.bag.hyperpotion).toBe(0);
    expect(session.bagItems()).toEqual([]);
    if (session.status === 'fighting' && session.playerActions().canUseItem) {
      expect(() => session.act({ type: 'item', item: potion, partyIndex: 0 })).toThrow(/No Hyper Potion left/);
    }
  });

  it('lets healing items be used between fights, but not X items', () => {
    const setup = createRun(gen1, 'easy', 'session-g');
    const s = new RunSession(gen1, setup, { hyperpotion: 1, revive: 1, xattack: 1 }, { includeChampion: true });
    s.nextFight();
    const battle = s.startFight();
    const player = new GreedyAI();
    const rng = createRng('g', 'p');
    while (s.status === 'fighting') s.act(player.chooseAction({ battle, side: 'p1', rng, items: [] }));
    expect(s.status).toBe('between'); // Easy team beats Lorelei with this seed

    const items = gen1.data.items.items;
    const potion = items.find((i) => i.id === 'hyperpotion')!;
    const revive = items.find((i) => i.id === 'revive')!;
    const xattack = items.find((i) => i.id === 'xattack')!;
    expect(s.outsideItemProblem(xattack, 0)).toMatch(/only be used in battle/);
    const healthy = s.party.findIndex((m, i) => m.condition!.hp === s.maxhp[i] && !m.condition!.status);
    if (healthy >= 0) expect(s.outsideItemProblem(potion, healthy)).toMatch(/won.t have any effect/);

    const hurt = s.party.findIndex((m) => m.condition!.hp > 0 && m.condition!.hp < s.maxhp[s.party.indexOf(m)]);
    if (hurt >= 0) {
      const before = s.party[hurt].condition!.hp;
      s.useItemOutside(potion, hurt);
      expect(s.party[hurt].condition!.hp).toBe(Math.min(s.maxhp[hurt], before + 200));
      expect(s.bag.hyperpotion).toBe(0);
    }
    const fainted = s.party.findIndex((m) => m.condition!.hp === 0);
    if (fainted >= 0) {
      s.useItemOutside(revive, fainted);
      expect(s.party[fainted].condition!.hp).toBe(Math.floor(s.maxhp[fainted] / 2));
    }
  });

  it('is reproducible from the seed', () => {
    const a = autoplay('session-f', 'normal').session.records;
    const b = autoplay('session-f', 'normal').session.records;
    expect(a).toEqual(b);
  });
});
