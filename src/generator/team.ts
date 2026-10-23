// Random team generator. Strength is anchored to the rival Champion's team
// (see src/config/difficulty.ts): slot by slot, the player gets the rival's
// level plus an offset, and a species whose base stat total is near the rival
// Pokémon's BST times a scale.

import type { PokemonSet } from '@pkmn/sim';
import { DIFFICULTY, type TierId } from '../config/difficulty';
import type { SpeciesData } from '../data/types';
import { gen12Set, type TrainerData } from '../data/trainers';
import type { Rng } from '../engine/rng';
import type { Ruleset } from '../rules/ruleset';
import { chooseMoves, hasDamagingMove } from './moveset';

const TEAM_SIZE = 6;
const MAX_DVS = { hp: 15, atk: 15, def: 15, spe: 15, spc: 15 };
const TOLERANCE_STEP = 25;

export interface TeamSlotPlan {
  level: number;
  targetBst: number;
}

/** The rival team's Pokémon, strongest first: by level, then base stat total. */
export function anchorTeam(rules: Ruleset, rivalTeam: TrainerData['teams'][number]) {
  const bst = (name: string) => rules.data.species.find((s) => s.name === name)!.bst;
  return rivalTeam.pokemon
    .map((p) => ({ species: p.species, level: p.level, bst: bst(p.species) }))
    .sort((a, b) => b.level - a.level || b.bst - a.bst);
}

export function planTeam(rules: Ruleset, tier: TierId, rivalTeam: TrainerData['teams'][number]): TeamSlotPlan[] {
  const { levelOffset, bstScale } = DIFFICULTY[tier].team;
  const anchor = anchorTeam(rules, rivalTeam);
  return Array.from({ length: TEAM_SIZE }, (_, i) => {
    const a = anchor[Math.min(i, anchor.length - 1)];
    return {
      level: Math.max(2, Math.min(100, a.level + levelOffset)),
      targetBst: Math.round(a.bst * bstScale),
    };
  });
}

/**
 * Whether `species` can appear at `level`: not restricted on this tier, has an
 * attack by then, and wouldn't already have evolved by levelling up.
 */
export function isEligible(rules: Ruleset, tier: TierId, species: SpeciesData, level: number): boolean {
  if (!DIFFICULTY[tier].team.allowRestricted && rules.restrictedSpecies.includes(species.name)) return false;
  const evolvedByLevel = species.evos.some((evoId) => {
    const evo = rules.data.species.find((s) => s.id === evoId);
    return evo?.evolution?.method === 'level' && (evo.evolution.level ?? 101) <= level;
  });
  if (evolvedByLevel) return false;
  return hasDamagingMove(rules.data, species.id, level);
}

export function generateTeam(rules: Ruleset, tier: TierId, rivalTeam: TrainerData['teams'][number], rng: Rng): PokemonSet[] {
  const config = DIFFICULTY[tier].team;
  const used = new Set<string>();
  const team: PokemonSet[] = [];

  for (const slot of planTeam(rules, tier, rivalTeam)) {
    const eligible = rules.data.species.filter((s) => !used.has(s.id) && isEligible(rules, tier, s, slot.level));
    let tolerance = config.bstTolerance;
    let candidates: SpeciesData[] = [];
    while (candidates.length === 0) {
      candidates = eligible.filter((s) => Math.abs(s.bst - slot.targetBst) <= tolerance);
      tolerance += TOLERANCE_STEP;
      if (tolerance > 1000) throw new Error('No eligible species for a team slot');
    }
    const species = rng.pick(candidates);
    used.add(species.id);
    team.push(buildSet(rules, tier, species, slot.level, chooseMoves(rules.data, species.id, slot.level, rng)));
  }
  return team;
}

function buildSet(rules: Ruleset, tier: TierId, species: SpeciesData, level: number, moves: string[]): PokemonSet {
  const config = DIFFICULTY[tier].team;
  const dvs = config.dvs === 'max' ? MAX_DVS : rules.data.elite4.trainerPokemon.dvs;
  return gen12Set(species.name, level, moves, dvs, config.statExp);
}
