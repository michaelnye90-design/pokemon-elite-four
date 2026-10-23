import { describe, expect, it } from 'vitest';
import { DIFFICULTY, TIER_ORDER } from '../config/difficulty';
import { mon, party, startBattle } from '../engine/testing';
import { gen1 } from '../rules/gen1';
import { addItem, autoFill, budgetFor, cartCost, opponentItemUses, removeItem, shopItems } from './items';

const shop = shopItems(gen1, 'normal');
const byId = (id: string) => shop.find((i) => i.id === id)!;

describe('item shop', () => {
  it('prices items at in-game price / 100, and Gen 1 has no held items', () => {
    expect(byId('potion').cost).toBe(3);
    expect(byId('hyperpotion').cost).toBe(15);
    expect(byId('fullrestore').cost).toBe(30);
    expect(shop.some((i) => i.category === 'held')).toBe(false);
  });

  it('gives fewer points as difficulty rises', () => {
    const budgets = TIER_ORDER.map(budgetFor);
    for (let i = 1; i < budgets.length; i++) expect(budgets[i]).toBeLessThan(budgets[i - 1]);
  });

  it('adds and removes items within the budget', () => {
    let cart = addItem({}, 'hyperpotion', shop, 30);
    cart = addItem(cart, 'hyperpotion', shop, 30);
    expect(cart).toEqual({ hyperpotion: 2 });
    expect(cartCost(cart, shop)).toBe(30);
    expect(() => addItem(cart, 'potion', shop, 30)).toThrow(/Not enough points/);
    expect(removeItem(removeItem(cart, 'hyperpotion'), 'hyperpotion')).toEqual({});
  });

  it.each(TIER_ORDER)('auto-fill on %s spends the budget without going over', (tier) => {
    const items = shopItems(gen1, tier);
    const budget = budgetFor(tier);
    const cart = autoFill(items, budget);
    const spent = cartCost(cart, items);
    const cheapestHeal = Math.min(...items.filter((i) => i.category === 'healing').map((i) => i.cost));
    expect(spent).toBeLessThanOrEqual(budget);
    expect(budget - spent).toBeLessThan(cheapestHeal);
  });

  it('auto-fill on Normal buys a mix of healing, revives and status cures', () => {
    const cart = autoFill(shop, budgetFor('normal'));
    const categories = new Set(Object.keys(cart).map((id) => byId(id).category));
    expect([...categories].sort()).toEqual(['healing', 'revive', 'status']);
  });

  it('every shop item works in battle', () => {
    for (const item of shop) {
      const b = startBattle(
        party([mon('Pikachu', ['thunderbolt']), { hp: 50, status: 'par', pp: [24] }], [mon('Raichu', ['thunderbolt']), { hp: 0, status: null, pp: [24] }]),
        party(mon('Snorlax', ['harden'])),
      );
      const target = item.effect.kind === 'revive' ? 1 : 0;
      if (item.effect.kind === 'cure' && !item.effect.cures.includes('par')) continue;
      expect(b.itemProblem('p1', item, target), item.id).toBeNull();
      b.choose('p1', { type: 'item', item, partyIndex: target });
    }
  });
});

describe('opponent items', () => {
  it('uses the real game on Normal, fewer below and more above', () => {
    const lance = gen1.data.elite4.trainers.find((t) => t.id === 'lance')!;
    expect(opponentItemUses(lance, 'normal')).toBe(lance.ai.usesPerPokemon);
    expect(opponentItemUses(lance, 'easy')).toBe(Math.max(0, lance.ai.usesPerPokemon + DIFFICULTY.easy.opponentItems.extraUsesPerPokemon));
    const uses = TIER_ORDER.map((t) => opponentItemUses(lance, t));
    for (let i = 1; i < uses.length; i++) expect(uses[i]).toBeGreaterThanOrEqual(uses[i - 1]);
    expect(uses.at(-1)).toBeGreaterThan(uses[1]);
  });
});
