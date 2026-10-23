// Drives one side of a battle: keeps track of that side's items and asks the
// side's AI strategy for each decision.

import type { Pokemon } from '@pkmn/sim';
import type { TrainerAIRule } from '../data/trainers';
import type { Action, EngineBattle, SideId } from '../engine/battle';
import type { BattleItem } from '../engine/items';
import type { Rng } from '../engine/rng';
import { matchup } from './estimate';
import { foe, type AIStrategy } from './types';

/** Where a side's items come from. */
export type ItemSupply =
  /** A bag with counts (the player, or either side in AI-vs-AI tests). */
  | { kind: 'bag'; items: { item: BattleItem; count: number }[] }
  /**
   * An in-game trainer: a fixed number of uses per Pokémon sent out, and the
   * original game's rules for when to use them.
   */
  | {
      kind: 'trainer';
      usesPerPokemon: number;
      rules: TrainerAIRule[];
      /** Item id -> item. */
      items: Record<string, BattleItem>;
      /** Follow the original game's random item/switch rules (lower tiers) instead of the strategy's own judgement. */
      followOriginalRules: boolean;
    };

export class AIController {
  private usesLeft = 0;
  private lastActive: Pokemon | null = null;

  constructor(
    readonly strategy: AIStrategy,
    private readonly rng: Rng,
    private readonly supply: ItemSupply = { kind: 'bag', items: [] },
  ) {}

  decide(battle: EngineBattle, side: SideId): Action {
    const legal = battle.legalActions(side);
    if (legal.wait) throw new Error(`${side} has nothing to decide`);
    this.trackSendOut(battle, side);

    if (!legal.forceSwitch && this.supply.kind === 'trainer' && this.supply.followOriginalRules) {
      const scripted = this.originalTrainerAction(battle, side);
      if (scripted) {
        this.usesLeft--;
        return scripted;
      }
    }

    const action = this.strategy.chooseAction({ battle, side, rng: this.rng, items: this.availableItems(battle, side) });
    if (action.type === 'item') this.consume(action.item);
    return action;
  }

  /** Items usable now, without checking whether each would have an effect. */
  availableItems(battle: EngineBattle, side: SideId): BattleItem[] {
    if (!battle.legalActions(side).canUseItem) return [];
    const supply = this.supply;
    if (supply.kind === 'bag') return supply.items.filter((b) => b.count > 0).map((b) => b.item);
    if (this.usesLeft <= 0) return [];
    const ids = new Set(supply.rules.flatMap((r) => (r.action.type === 'item' ? [r.action.item] : [])));
    return [...ids].map((id) => supply.items[id]).filter((i): i is BattleItem => !!i);
  }

  // Gen 1 reloads a trainer's AI uses each time it sends out a Pokémon.
  private trackSendOut(battle: EngineBattle, side: SideId) {
    const active = battle.active(side);
    if (active !== this.lastActive) {
      this.lastActive = active;
      if (this.supply.kind === 'trainer') this.usesLeft = this.supply.usesPerPokemon;
    }
  }

  /** The original game's trainer AI: one 0-255 roll checked against each rule in order. */
  private originalTrainerAction(battle: EngineBattle, side: SideId): Action | null {
    if (this.supply.kind !== 'trainer' || this.usesLeft <= 0) return null;
    const roll = this.rng.int(256);
    const active = battle.active(side);
    for (const rule of this.supply.rules) {
      if (roll >= rule.rollBelow) continue;
      if (rule.hpBelowFraction && active.hp >= active.maxhp / rule.hpBelowFraction) return null;
      if (rule.action.type === 'switch') {
        const target = bestSwitch(battle, side);
        return target === null ? null : { type: 'switch', partyIndex: target };
      }
      const item = this.supply.items[rule.action.item];
      const partyIndex = battle.partyIndex(active);
      if (!item || battle.itemProblem(side, item, partyIndex)) return null;
      return { type: 'item', item, partyIndex };
    }
    return null;
  }

  private consume(item: BattleItem) {
    if (this.supply.kind === 'trainer') {
      this.usesLeft--;
    } else {
      const entry = this.supply.items.find((b) => b.item.id === item.id);
      if (entry) entry.count--;
    }
  }
}

/** The benched Pokémon with the best matchup against the foe's active, or null if none can come in. */
export function bestSwitch(battle: EngineBattle, side: SideId): number | null {
  const options = battle.legalActions(side).switches;
  if (options.length === 0) return null;
  const theirs = battle.active(foe(side));
  let best = options[0];
  let bestScore = -Infinity;
  for (const partyIndex of options) {
    const score = matchup(battle.sim, battle.pokemon(side, partyIndex), theirs);
    if (score > bestScore) {
      bestScore = score;
      best = partyIndex;
    }
  }
  return best;
}
