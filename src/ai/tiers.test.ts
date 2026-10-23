import { describe, expect, it } from 'vitest';
import type { EngineBattle, SideId } from '../engine/battle';
import type { BattleItem } from '../engine/items';
import { createRng } from '../engine/rng';
import { mon, party, startBattle } from '../engine/testing';
import { gen1 } from '../rules/gen1';
import { AIController } from './controller';
import { evaluate, GreedyAI, LookaheadAI, NightmareAI, RandomAI, SmartAI } from './tiers';
import { runMatchup } from './tournament';
import type { AIStrategy } from './types';

const item = (id: string) => gen1.data.items.items.find((i) => i.id === id)! as BattleItem;

/** Asks `strategy` for p1's action over many seeds and counts the chosen move ids / action kinds. */
function sample(battle: () => EngineBattle, strategy: () => AIStrategy, items: BattleItem[] = [], n = 40) {
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const b = battle();
    const action = strategy().chooseAction({ battle: b, side: 'p1', rng: createRng('ai-test', String(i)), items });
    const key = action.type === 'move' ? b.active('p1').moveSlots[action.slot].id : action.type === 'switch' ? `switch:${b.pokemon('p1', action.partyIndex).name}` : `item:${action.item.id}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

describe('Easy (random)', () => {
  it('only picks legal moves, and a legal replacement when forced', () => {
    const counts = sample(() => startBattle(party(mon('Pikachu', ['thunderbolt', 'growl', 'quickattack'])), party(mon('Snorlax', ['harden']))), () => new RandomAI());
    expect(Object.keys(counts).sort()).toEqual(['growl', 'quickattack', 'thunderbolt']);

    const b = startBattle(party(mon('Magikarp', ['splash']), mon('Raichu', ['thunderbolt'])), party(mon('Mewtwo', ['psychic'])));
    b.choose('p1', { type: 'move', slot: 0 });
    b.choose('p2', { type: 'move', slot: 0 });
    expect(b.legalActions('p1').forceSwitch).toBe(true);
    expect(new RandomAI().chooseAction({ battle: b, side: 'p1', rng: createRng('x', 'y'), items: [] })).toEqual({ type: 'switch', partyIndex: 1 });
  });
});

describe('Normal (greedy)', () => {
  it('prefers super-effective damage', () => {
    const counts = sample(() => startBattle(party(mon('Pikachu', ['quickattack', 'thunderbolt'])), party(mon('Gyarados', ['leer']))), () => new GreedyAI());
    expect(counts.thunderbolt).toBeGreaterThanOrEqual(36);
  });

  it('avoids moves the target is immune to', () => {
    const counts = sample(() => startBattle(party(mon('Pikachu', ['thunderbolt', 'quickattack'])), party(mon('Golem', ['harden']))), () => new GreedyAI());
    expect(counts.quickattack).toBeGreaterThanOrEqual(36);
  });
});

describe('Hard (smart)', () => {
  const potion = [item('hyperpotion')];

  it('heals at low HP when the heal will keep it in the fight', () => {
    const counts = sample(
      () => startBattle(party([mon('Snorlax', ['bodyslam']), { hp: 40, status: null, pp: [24] }]), party(mon('Pikachu', ['growl']))),
      () => new SmartAI(),
      potion,
    );
    expect(counts['item:hyperpotion']).toBe(40);
  });

  it("doesn't waste a heal it would lose straight away", () => {
    const counts = sample(
      () => startBattle(party([mon('Pikachu', ['thunderbolt']), { hp: 20, status: null, pp: [24] }]), party(mon('Mewtwo', ['psychic']))),
      () => new SmartAI(),
      [item('superpotion')],
    );
    expect(counts['item:superpotion']).toBeUndefined();
  });

  it('switches out of a matchup it is clearly losing', () => {
    const counts = sample(
      () => startBattle(party(mon('Pikachu', ['thunderbolt']), mon('Starmie', ['surf'])), party(mon('Golem', ['earthquake']))),
      () => new SmartAI(),
    );
    expect(counts['switch:Starmie']).toBe(40);
  });

  it('sets up when safe and puts a healthy target to sleep', () => {
    const setup = sample(() => startBattle(party(mon('Slowbro', ['surf', 'amnesia'])), party(mon('Magikarp', ['splash']))), () => new SmartAI());
    expect(setup.amnesia).toBe(40);
    const sleep = sample(() => startBattle(party(mon('Jynx', ['icebeam', 'lovelykiss'])), party(mon('Snorlax', ['harden']))), () => new SmartAI());
    expect(sleep.lovelykiss).toBeGreaterThan(15);
  });
});

describe('Expert and Nightmare (lookahead)', () => {
  // Raticate and Jolteon can each knock the other out; Jolteon is faster, so
  // only Quick Attack wins. Hard just takes the strongest move.
  const duel = () =>
    startBattle(
      party([mon('Raticate', ['hyperfang', 'quickattack']), { hp: 10, status: null, pp: [24, 48] }]),
      party([mon('Jolteon', ['thunderbolt']), { hp: 10, status: null, pp: [24] }]),
    );

  it('Hard misses the faster foe; Expert and Nightmare use priority to win', () => {
    expect(sample(duel, () => new SmartAI(), [], 5).hyperfang).toBe(5);
    expect(sample(duel, () => new LookaheadAI(), [], 5).quickattack).toBe(5);
    expect(sample(duel, () => new NightmareAI(), [], 5).quickattack).toBe(5);
  });

  it("doesn't change the real battle while looking ahead", () => {
    const b = duel();
    const before = JSON.stringify(b.snapshot('p1')) + JSON.stringify(b.snapshot('p2')) + b.log.length;
    new NightmareAI().chooseAction({ battle: b, side: 'p1', rng: createRng('a', 'b'), items: [] });
    expect(JSON.stringify(b.snapshot('p1')) + JSON.stringify(b.snapshot('p2')) + b.log.length).toBe(before);
  });
});

describe('evaluation', () => {
  it('is zero-sum', () => {
    const b = startBattle(party([mon('Pikachu', ['growl']), { hp: 50, status: 'par', pp: [64] }]), party(mon('Snorlax', ['harden'])));
    expect(evaluate(b.sim, 'p1')).toBeCloseTo(-evaluate(b.sim, 'p2'));
    expect(evaluate(b.sim, 'p1')).toBeLessThan(0);
  });
});

describe('trainer item rules', () => {
  it('follow the original game: uses per Pokémon, reloaded when a new one is sent out', () => {
    const b = startBattle(
      party(mon('Pikachu', ['growl'])),
      party([mon('Dragonair', ['wrap']), { hp: 20, status: null, pp: [32] }], [mon('Dragonite', ['slam']), { hp: 20, status: null, pp: [32] }]),
    );
    const controller = new AIController(new GreedyAI(), createRng('t', 'r'), {
      kind: 'trainer',
      usesPerPokemon: 1,
      rules: [{ rollBelow: 256, hpBelowFraction: 5, action: { type: 'item', item: 'hyperpotion' } }],
      items: { hyperpotion: item('hyperpotion') },
      followOriginalRules: true,
    });
    const turn = (p2: SideId = 'p2') => {
      const action = controller.decide(b, p2);
      b.choose('p1', { type: 'move', slot: 0 });
      b.choose('p2', action);
      return action.type;
    };
    expect(turn()).toBe('item'); // HP below 1/5: heals
    b.active('p2').hp = 10;
    expect(turn()).toBe('move'); // only one use per Pokémon
  });
});

describe('tournament', () => {
  it('higher tiers beat lower ones (quick check; the full run is npm run ai:tournament)', () => {
    expect(runMatchup(gen1, 'normal', 'easy', 6).winRate).toBeGreaterThan(0.5);
    expect(runMatchup(gen1, 'hard', 'easy', 6).winRate).toBeGreaterThan(0.5);
  }, 60000);
});
