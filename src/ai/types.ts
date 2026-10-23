import type { TierId } from '../config/difficulty';
import type { Action, EngineBattle, SideId } from '../engine/battle';
import type { BattleItem } from '../engine/items';
import type { Rng } from '../engine/rng';

/** What an AI sees when it's asked for a decision. */
export interface AIState {
  battle: EngineBattle;
  side: SideId;
  /** The AI's own randomness, separate from the battle's. */
  rng: Rng;
  /** Items this side could use right now (bag contents, or the trainer's item while uses remain). */
  items: BattleItem[];
}

/** One opponent AI per difficulty tier, so tiers can be played against each other. */
export interface AIStrategy {
  readonly tier: TierId;
  chooseAction(state: AIState): Action;
}

export const foe = (side: SideId): SideId => (side === 'p1' ? 'p2' : 'p1');
