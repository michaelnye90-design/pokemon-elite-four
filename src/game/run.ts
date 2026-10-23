// Setting up a run: everything random about it comes from one run seed.

import type { PokemonSet } from '@pkmn/sim';
import type { TierId } from '../config/difficulty';
import type { TrainerData } from '../data/trainers';
import { createRng } from '../engine/rng';
import { newRunSeed } from '../engine/seed';
import { budgetFor, shopItems, type ShopItem } from '../generator/items';
import { generateTeam } from '../generator/team';
import type { Ruleset } from '../rules/ruleset';

export interface RunSetup {
  seed: string;
  gen: number;
  tier: TierId;
  /** Which of the Champion's teams this run faces (and anchors team strength to). */
  rivalTeamId: string;
  team: PokemonSet[];
  budget: number;
  shop: ShopItem[];
}

export function champion(rules: Ruleset): TrainerData {
  const trainer = rules.data.elite4.trainers.find((t) => t.title === 'Champion');
  if (!trainer) throw new Error(`Gen ${rules.gen} data has no Champion`);
  return trainer;
}

export function createRun(rules: Ruleset, tier: TierId, seed = newRunSeed()): RunSetup {
  const rival = champion(rules);
  const rivalTeam = createRng(seed, 'rival').pick(rival.teams);
  return {
    seed,
    gen: rules.gen,
    tier,
    rivalTeamId: rivalTeam.id,
    team: generateTeam(rules, tier, rivalTeam, createRng(seed, 'team')),
    budget: budgetFor(tier),
    shop: shopItems(rules, tier),
  };
}
