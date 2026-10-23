import type { SparseBoostsTable } from '@pkmn/sim';
import type { StatusId } from './party';

export type ItemEffect =
  | { kind: 'heal'; hp: number | 'full'; cures?: StatusId[] }
  | { kind: 'cure'; cures: StatusId[] }
  | { kind: 'revive'; hpFraction: number }
  | { kind: 'boost'; boosts: SparseBoostsTable };

/** A bag item used from the item menu. The shop's item list is defined per generation. */
export interface BattleItem {
  id: string;
  name: string;
  effect: ItemEffect;
}

export const ALL_STATUSES: StatusId[] = ['brn', 'par', 'slp', 'frz', 'psn'];

/**
 * Simulator condition that stands in for "used an item this turn": the
 * Pokémon's move is cancelled before it is announced or spends PP, the same
 * way a flinch is, but silently. It runs ahead of sleep/paralysis checks.
 */
export const USE_ITEM_CONDITION = {
  name: 'Use Item',
  onBeforeMovePriority: 100,
  onBeforeMove(pokemon: { removeVolatile(id: string): boolean }) {
    pokemon.removeVolatile('useitem');
    return false;
  },
};
