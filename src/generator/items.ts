// The item shop: a points budget per tier, spent on the generation's items.

import { AUTO_FILL_SHARES, DIFFICULTY, POINTS_PER_PRICE, type TierId } from '../config/difficulty';
import type { ShopItemData } from '../data/types';
import type { TrainerData } from '../data/trainers';
import type { Ruleset } from '../rules/ruleset';

export interface ShopItem extends ShopItemData {
  /** Cost in shop points. */
  cost: number;
}

/** Item id -> how many. */
export type Cart = Readonly<Record<string, number>>;

/** Rough HP value of a full heal, for comparing items when auto-filling. */
const FULL_HEAL_HP_VALUE = 250;

export function shopItems(rules: Ruleset, tier: TierId): ShopItem[] {
  const heldAllowed = rules.data.items.heldItems && DIFFICULTY[tier].playerItems.heldItems;
  return rules.data.items.items
    .filter((item) => item.category !== 'held' || heldAllowed)
    .map((item) => ({ ...item, cost: Math.max(1, Math.round(item.price / POINTS_PER_PRICE)) }));
}

export function budgetFor(tier: TierId): number {
  return DIFFICULTY[tier].playerItems.budget;
}

export function cartCost(cart: Cart, items: readonly ShopItem[]): number {
  return Object.entries(cart).reduce((sum, [id, count]) => sum + costOf(items, id) * count, 0);
}

export function addItem(cart: Cart, id: string, items: readonly ShopItem[], budget: number): Cart {
  if (cartCost(cart, items) + costOf(items, id) > budget) throw new Error('Not enough points');
  return { ...cart, [id]: (cart[id] ?? 0) + 1 };
}

export function removeItem(cart: Cart, id: string): Cart {
  const next = { ...cart };
  if ((next[id] ?? 0) <= 1) delete next[id];
  else next[id]--;
  return next;
}

/**
 * Spends the budget on a sensible mix: mostly healing, some revives, a few
 * status cures (shares in AUTO_FILL_SHARES), then any leftover on healing.
 */
export function autoFill(items: readonly ShopItem[], budget: number): Cart {
  const healing = items
    .filter((i) => i.category === 'healing' && i.effect.kind === 'heal')
    .sort((a, b) => healValue(b) / b.cost - healValue(a) / a.cost || a.cost - b.cost);
  const revives = items
    .filter((i) => i.category === 'revive' && i.effect.kind === 'revive')
    .sort((a, b) => reviveFraction(b) / b.cost - reviveFraction(a) / a.cost);
  const cures = items
    .filter((i) => i.category === 'status' && i.effect.kind === 'cure')
    .sort((a, b) => cureCount(b) - cureCount(a) || curePriority(a) - curePriority(b));
  const [fullCure, ...singleCures] = cures;

  let cart: Cart = {};
  const buy = (item: ShopItem) => {
    cart = { ...cart, [item.id]: (cart[item.id] ?? 0) + 1 };
    return item.cost;
  };
  // As many of the best option as fit, then the next best, and so on.
  const buyGreedily = (options: ShopItem[], allowance: number) => {
    let left = allowance;
    for (const item of options) while (item.cost <= left) left -= buy(item);
    return left;
  };
  // One of each in turn, so a small budget gets a spread rather than five of one thing.
  const buyRoundRobin = (options: ShopItem[], allowance: number) => {
    let left = allowance;
    for (let bought = true; bought; ) {
      bought = false;
      for (const item of options) {
        if (item.cost <= left) {
          left -= buy(item);
          bought = true;
        }
      }
    }
    return left;
  };

  buyGreedily(revives, Math.floor(budget * AUTO_FILL_SHARES.revive));
  const statusLeft = buyGreedily(fullCure ? [fullCure] : [], Math.floor(budget * AUTO_FILL_SHARES.status));
  buyRoundRobin(singleCures, statusLeft);
  buyGreedily(healing, budget - cartCost(cart, items));
  return cart;
}

/** Single-status cures, most useful first. */
const CURE_PRIORITY = ['par', 'slp', 'frz', 'brn', 'psn'];

function curePriority(item: ShopItem): number {
  return item.effect.kind === 'cure' ? Math.min(...item.effect.cures.map((s) => CURE_PRIORITY.indexOf(s))) : 99;
}

/** How many item uses each opponent Pokémon gets on this tier. Normal is the real game. */
export function opponentItemUses(trainer: TrainerData, tier: TierId): number {
  return Math.max(0, trainer.ai.usesPerPokemon + DIFFICULTY[tier].opponentItems.extraUsesPerPokemon);
}

function costOf(items: readonly ShopItem[], id: string): number {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error(`Unknown item ${id}`);
  return item.cost;
}

function healValue(item: ShopItem): number {
  if (item.effect.kind !== 'heal') return 0;
  const hp = item.effect.hp === 'full' ? FULL_HEAL_HP_VALUE : item.effect.hp;
  return hp * (item.effect.cures?.length ? 1.2 : 1);
}

function reviveFraction(item: ShopItem): number {
  return item.effect.kind === 'revive' ? item.effect.hpFraction : 0;
}

function cureCount(item: ShopItem): number {
  return item.effect.kind === 'cure' ? item.effect.cures.length : 0;
}
