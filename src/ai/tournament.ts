// Plays AI tiers against each other to check that higher tiers really win more.
// Each game is played twice with the teams swapped, so neither tier gets the
// better team more often.

import { TIER_ORDER, type TierId } from '../config/difficulty';
import { champion } from '../game/run';
import { EngineBattle, type SideId } from '../engine/battle';
import type { BattleItem } from '../engine/items';
import { createRng } from '../engine/rng';
import { battleSeed } from '../engine/seed';
import { generateTeam } from '../generator/team';
import type { Ruleset } from '../rules/ruleset';
import { AIController, type ItemSupply } from './controller';
import { strategyFor } from './tiers';
import type { AIStrategy } from './types';

/** Both sides get the same small bag, so item use is part of what's compared. */
const BAG: Record<string, number> = { hyperpotion: 2, fullheal: 1, revive: 1 };
const MAX_TURNS = 300;

export interface MatchupResult {
  higher: TierId;
  lower: TierId;
  games: number;
  higherWins: number;
  draws: number;
  /** Higher tier's win rate, draws counted as half. */
  winRate: number;
  /** 95% confidence interval for the win rate. */
  low: number;
  high: number;
}

/** Plays two AI controllers against each other until the battle ends. Both decide before either choice is submitted. */
export function playAIBattle(battle: EngineBattle, controllers: Record<SideId, AIController>, maxTurns = MAX_TURNS): SideId | null {
  while (!battle.ended && battle.sim.turn <= maxTurns) {
    const sides = (['p1', 'p2'] as const).filter((s) => !battle.legalActions(s).wait);
    if (sides.length === 0) throw new Error('Battle is stuck: nobody can act');
    const decisions = sides.map((s) => [s, controllers[s].decide(battle, s)] as const);
    for (const [s, action] of decisions) battle.choose(s, action);
  }
  return battle.winner;
}

export function runMatchup(
  rules: Ruleset,
  higher: TierId,
  lower: TierId,
  pairs: number,
  seed = 'tournament',
  /** Override the strategies (for tuning experiments); defaults to each tier's own. */
  make: { higher?: () => AIStrategy; lower?: () => AIStrategy } = {},
): MatchupResult {
  const rivalTeams = champion(rules).teams;
  let higherWins = 0;
  let draws = 0;

  for (let pair = 0; pair < pairs; pair++) {
    const rng = createRng(seed, `pair${pair}`);
    const teamA = generateTeam(rules, 'normal', rng.pick(rivalTeams), rng);
    const teamB = generateTeam(rules, 'normal', rng.pick(rivalTeams), rng);
    for (const swapped of [false, true]) {
      const game = pair * 2 + (swapped ? 1 : 0);
      const [higherTeam, lowerTeam] = swapped ? [teamB, teamA] : [teamA, teamB];
      // Alternate sides too, in case p1/p2 matters.
      const higherSide: SideId = game % 2 === 0 ? 'p1' : 'p2';
      const lowerSide: SideId = higherSide === 'p1' ? 'p2' : 'p1';
      const battle = new EngineBattle({
        format: rules.format,
        seed: battleSeed(seed, game),
        p1: (higherSide === 'p1' ? higherTeam : lowerTeam).map((set) => ({ set: { ...set } })),
        p2: (higherSide === 'p2' ? higherTeam : lowerTeam).map((set) => ({ set: { ...set } })),
      });
      const controllers = {
        [higherSide]: new AIController(make.higher?.() ?? strategyFor(higher), createRng(seed, `g${game}-hi`), bag(rules)),
        [lowerSide]: new AIController(make.lower?.() ?? strategyFor(lower), createRng(seed, `g${game}-lo`), bag(rules)),
      } as Record<SideId, AIController>;
      const winner = playAIBattle(battle, controllers);
      if (winner === higherSide) higherWins++;
      else if (winner === null) draws++;
    }
  }

  const games = pairs * 2;
  const winRate = (higherWins + draws / 2) / games;
  const margin = 1.96 * Math.sqrt((winRate * (1 - winRate)) / games);
  return { higher, lower, games, higherWins, draws, winRate, low: Math.max(0, winRate - margin), high: Math.min(1, winRate + margin) };
}

/** Tiers with their own AI. Nightmare currently reuses Expert's, so it isn't compared. */
export const AI_TIERS: TierId[] = TIER_ORDER.filter((t) => t !== 'nightmare');

/** Each tier against the one below it, plus the top tier against the bottom. */
export function standardMatchups(): [TierId, TierId][] {
  const pairs: [TierId, TierId][] = [];
  for (let i = 1; i < AI_TIERS.length; i++) pairs.push([AI_TIERS[i], AI_TIERS[i - 1]]);
  pairs.push([AI_TIERS.at(-1)!, AI_TIERS[0]]);
  return pairs;
}

function bag(rules: Ruleset): ItemSupply {
  const items: { item: BattleItem; count: number }[] = Object.entries(BAG).map(([id, count]) => {
    const item = rules.data.items.items.find((i) => i.id === id);
    if (!item) throw new Error(`Gen ${rules.gen} has no ${id}`);
    return { item, count };
  });
  return { kind: 'bag', items };
}
