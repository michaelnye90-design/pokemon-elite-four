// The five opponent AI tiers. Each tier builds on the one before it:
//   Easy       random legal moves
//   Normal     prefers damaging and super-effective moves
//   Hard       + smart switching, healing at low HP, setup and status moves
//   Expert     + looks a turn ahead, weighing how the foe (including a switch) might respond
//   Nightmare  same AI as Expert for now (see NIGHTMARE_OPTIONS)

import { PRNG, State, type Battle, type Pokemon, type PRNGSeed } from '@pkmn/sim';
import type { TierId } from '../config/difficulty';
import type { Action, EngineBattle, SideId } from '../engine/battle';
import type { BattleItem } from '../engine/items';
import type { Rng } from '../engine/rng';
import { bestSwitch } from './controller';
import { bestDamage, bestDamageFraction, damageFraction, matchup } from './estimate';
import { foe, type AIState, type AIStrategy } from './types';

// ---------------------------------------------------------------- helpers

interface MoveOption {
  slot: number;
  id: string;
}

function usableMoves(state: AIState): MoveOption[] {
  const moves = state.battle.legalActions(state.side).moves.filter((m) => !m.disabled && (m.pp === undefined || m.pp > 0));
  // No PP left anywhere: the simulator turns any move choice into Struggle.
  return moves.length > 0 ? moves.map((m) => ({ slot: m.slot, id: m.id })) : [{ slot: 0, id: 'struggle' }];
}

/** A replacement after a knockout: the best matchup, or (like the original game's trainers) the next in party order. */
function forcedSwitch(state: AIState, smart: boolean): Action {
  const options = state.battle.legalActions(state.side).switches;
  const partyIndex = smart ? bestSwitch(state.battle, state.side)! : options[0];
  return { type: 'switch', partyIndex };
}

const mine = (s: AIState) => s.battle.active(s.side);
const theirs = (s: AIState) => s.battle.active(foe(s.side));

/** Whether a status move would actually do something to the target now. */
function statusMoveLands(battle: Battle, user: Pokemon, target: Pokemon, moveId: string): boolean {
  const move = battle.dex.moves.get(moveId);
  if (move.status) {
    return !target.status && battle.dex.getImmunity(move.type, target) && target.runStatusImmunity(move.status);
  }
  if (move.volatileStatus === 'confusion') return !target.volatiles['confusion'];
  if (move.id === 'leechseed') return !target.volatiles['leechseed'] && !target.hasType('Grass');
  if (move.boosts && move.target === 'self') {
    return Object.entries(move.boosts).some(([stat, n]) => n! > 0 && user.boosts[stat as keyof typeof user.boosts] < 2);
  }
  return false;
}

function isSetupMove(battle: Battle, moveId: string): boolean {
  const move = battle.dex.moves.get(moveId);
  return move.category === 'Status' && move.target === 'self' && !!move.boosts;
}

function isDisablingStatus(battle: Battle, moveId: string): boolean {
  const status = battle.dex.moves.get(moveId).status;
  return status === 'slp' || status === 'par' || status === 'frz';
}

// ------------------------------------------------------------------ Easy

export class RandomAI implements AIStrategy {
  readonly tier: TierId = 'easy';

  chooseAction(state: AIState): Action {
    const legal = state.battle.legalActions(state.side);
    if (legal.forceSwitch) return forcedSwitch(state, false);
    return { type: 'move', slot: state.rng.pick(usableMoves(state)).slot };
  }
}

// ---------------------------------------------------------------- Normal

export class GreedyAI implements AIStrategy {
  readonly tier: TierId = 'normal';

  chooseAction(state: AIState): Action {
    if (state.battle.legalActions(state.side).forceSwitch) return forcedSwitch(state, false);
    const options = usableMoves(state);
    // Strongly favour the best expected damage (super-effective moves score
    // higher automatically), with a little randomness, and an occasional
    // status move that would land.
    const pick = state.rng.weighted(options, (m) => this.score(state, m) ** 3);
    return { type: 'move', slot: pick.slot };
  }

  score(state: AIState, move: MoveOption): number {
    const { sim } = state.battle;
    const fraction = damageFraction(sim, mine(state), theirs(state), move.id);
    if (fraction > 0) return 0.1 + fraction + (fraction >= 1 ? 0.5 : 0);
    return statusMoveLands(sim, mine(state), theirs(state), move.id) ? 0.35 : 0.02;
  }
}

// ------------------------------------------------------------------ Hard

export class SmartAI implements AIStrategy {
  readonly tier: TierId = 'hard';
  protected lastSwitchTurn = -10;

  chooseAction(state: AIState): Action {
    if (state.battle.legalActions(state.side).forceSwitch) return forcedSwitch(state, true);
    return this.useItem(state) ?? this.considerSwitch(state) ?? this.bestMove(state);
  }

  /** Heal when low (and it will help), cure sleep or freeze, or revive when safe. */
  protected useItem(state: AIState): Action | null {
    if (state.items.length === 0) return null;
    const { battle, side } = state;
    const me = mine(state);
    const incoming = bestDamage(battle.sim, theirs(state), me);
    const usable = (item: BattleItem, partyIndex: number) => !battle.itemProblem(side, item, partyIndex);
    const myIndex = battle.partyIndex(me);

    if ((me.status === 'slp' || me.status === 'frz') && me.hp > me.maxhp * 0.25) {
      const cure = state.items.find((i) => (i.effect.kind === 'cure' || (i.effect.kind === 'heal' && i.effect.cures)) && usable(i, myIndex));
      if (cure) return { type: 'item', item: cure, partyIndex: myIndex };
    }

    if (me.hp < me.maxhp * 0.3) {
      const heals = state.items
        .filter((i) => i.effect.kind === 'heal' && usable(i, myIndex))
        .map((i) => ({ item: i, after: Math.min(me.maxhp, me.hp + healAmount(i, me.maxhp)) }))
        .filter((h) => h.after > incoming) // healing only to be knocked out is a wasted turn
        .sort((a, b) => a.after - b.after);
      const enough = heals.find((h) => h.after >= me.maxhp * 0.6) ?? heals.at(-1);
      if (enough) return { type: 'item', item: enough.item, partyIndex: myIndex };
    }

    if (me.hp > me.maxhp * 0.7 && incoming < me.hp * 0.3) {
      for (const p of battle.sim[side].pokemon) {
        if (!p.fainted) continue;
        const revive = state.items.find((i) => i.effect.kind === 'revive' && usable(i, battle.partyIndex(p)));
        if (revive) return { type: 'item', item: revive, partyIndex: battle.partyIndex(p) };
      }
    }
    return null;
  }

  /** Switch out of a matchup that's clearly lost, to a Pokémon that does clearly better. */
  protected considerSwitch(state: AIState): Action | null {
    const { battle, side } = state;
    const turn = battle.sim.turn;
    if (turn - this.lastSwitchTurn < 2) return null; // don't ping-pong
    const me = mine(state);
    const current = matchup(battle.sim, me, theirs(state));
    if (current > -0.4) return null;
    const target = bestSwitch(battle, side);
    if (target === null) return null;
    const better = matchup(battle.sim, battle.pokemon(side, target), theirs(state));
    if (better < current + 0.5) return null;
    this.lastSwitchTurn = turn;
    return { type: 'switch', partyIndex: target };
  }

  protected bestMove(state: AIState): Action {
    const { sim } = state.battle;
    const me = mine(state);
    const them = theirs(state);
    const options = usableMoves(state);
    const incoming = bestDamageFraction(sim, them, me);

    // Safe to set up: healthy and not under real threat.
    if (me.hp > me.maxhp * 0.7 && incoming < 0.25) {
      const setup = options.find((m) => isSetupMove(sim, m.id) && statusMoveLands(sim, me, them, m.id));
      if (setup) return { type: 'move', slot: setup.slot };
    }
    // Put a healthy target to sleep or paralyse it before attacking.
    if (them.hp > them.maxhp * 0.5 && state.rng.next() < 0.6) {
      const status = options.find((m) => isDisablingStatus(sim, m.id) && statusMoveLands(sim, me, them, m.id));
      if (status) return { type: 'move', slot: status.slot };
    }
    let best = options[0];
    let bestFraction = -1;
    for (const m of options) {
      const f = damageFraction(sim, me, them, m.id);
      if (f > bestFraction) {
        bestFraction = f;
        best = m;
      }
    }
    return { type: 'move', slot: best.slot };
  }
}

// ---------------------------------------------------------------- Expert

interface Candidate {
  action: Action;
  choice: string;
}

interface Reply {
  choice: string;
  weight: number;
}

export interface LookaheadOptions {
  /** Turns simulated: 1, or 2 (the second played greedily by both sides). */
  depth: 1 | 2;
  /** Battle outcomes sampled per pairing, with different luck. */
  samples: number;
  /** Most likely foe replies considered. */
  maxReplies: number;
  /** Strongest moves considered, besides the Hard tier's own pick and the best switch. */
  maxMoves: number;
  /** Weight on the worst case versus the average (0 = average only). */
  pessimism: number;
  /**
   * How much better (in evaluation units) another option must look before it
   * overrides the Hard tier's pick, which knows about setup and status.
   */
  heuristicBonus: number;
}

// Tuned against Hard over 200-game samples: more samples, a bigger heuristic
// bonus, more candidates/replies or worst-case weighting didn't do better.
export const EXPERT_OPTIONS: LookaheadOptions = { depth: 1, samples: 3, maxReplies: 4, maxMoves: 3, pessimism: 0, heuristicBonus: 0.05 };
// Nightmare's AI is Expert's for now: deeper, more pessimistic search
// (depth 2, more samples) didn't beat Expert in the tournament. Nightmare is
// still harder through a weaker player team and fewer items.
export const NIGHTMARE_OPTIONS: LookaheadOptions = EXPERT_OPTIONS;

export class LookaheadAI extends SmartAI {
  readonly tier: TierId = 'expert';

  constructor(protected options: LookaheadOptions = EXPERT_OPTIONS) {
    super();
  }

  chooseAction(state: AIState): Action {
    if (state.battle.legalActions(state.side).forceSwitch) return forcedSwitch(state, true);
    // The Hard tier's judgement first: items are decided there outright, and
    // its move or switch is one of the options looked at.
    const heuristic = super.chooseAction(state);
    if (heuristic.type === 'item') return heuristic;

    const candidates = this.candidates(state, heuristic);
    if (candidates.length === 1) return candidates[0].action;
    const replies = this.predictReplies(state);
    const snapshot = snapshotOf(state.battle.sim);
    // Every candidate is played against the same dice rolls, so they're
    // compared under identical luck (common random numbers).
    const seeds = replies.map(() => Array.from({ length: this.options.samples }, () => randomSeed(state.rng)));

    let best = candidates[0];
    let bestValue = -Infinity;
    for (const candidate of candidates) {
      const values: number[] = [];
      let weighted = 0;
      let totalWeight = 0;
      for (const [r, reply] of replies.entries()) {
        for (let s = 0; s < this.options.samples; s++) {
          const value = simulate(snapshot, state.side, candidate.choice, reply.choice, this.options, seeds[r][s]);
          values.push(value);
          weighted += value * reply.weight;
          totalWeight += reply.weight;
        }
      }
      const expected = weighted / totalWeight;
      let value = (1 - this.options.pessimism) * expected + this.options.pessimism * Math.min(...values);
      if (candidate.choice === candidates[0].choice) value += this.options.heuristicBonus;
      if (value > bestValue) {
        bestValue = value;
        best = candidate;
      }
    }
    return best.action;
  }

  /** The Hard tier's pick first, then the strongest moves, then the best switch. */
  private candidates(state: AIState, heuristic: Action): Candidate[] {
    const { battle, side } = state;
    const toCandidate = (action: Action): Candidate => ({
      action,
      choice: action.type === 'switch' ? switchChoice(battle, side, action.partyIndex) : `move ${(action as { slot: number }).slot + 1}`,
    });
    const greedy = new GreedyAI();
    const strongest = usableMoves(state)
      .map((m) => ({ m, score: greedy.score(state, m) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.maxMoves)
      .map(({ m }) => toCandidate({ type: 'move', slot: m.slot }));
    const out = [toCandidate(heuristic), ...strongest];
    const switchTo = bestSwitch(battle, side);
    if (switchTo !== null && battle.legalActions(side).switches.length > 0) out.push(toCandidate({ type: 'switch', partyIndex: switchTo }));
    return out.filter((c, i) => out.findIndex((o) => o.choice === c.choice) === i);
  }

  /** How the foe might respond: mostly its strongest attacks, plus a switch if its matchup is bad. */
  private predictReplies(state: AIState): Reply[] {
    const { battle } = state;
    const other = foe(state.side);
    const them = battle.active(other);
    const me = battle.active(state.side);
    const replies: Reply[] = [];
    for (const slot of them.moveSlots.keys()) {
      const m = them.moveSlots[slot];
      if (m.pp <= 0 || m.disabled) continue;
      const fraction = damageFraction(battle.sim, them, me, m.id);
      const status = statusMoveLands(battle.sim, them, me, m.id);
      replies.push({ choice: `move ${slot + 1}`, weight: 0.1 + fraction + (status ? 0.3 : 0) });
    }
    if (replies.length === 0) replies.push({ choice: 'move 1', weight: 1 });
    const theirMatchup = matchup(battle.sim, them, me);
    if (theirMatchup < -0.2 && !them.trapped) {
      const target = bestSwitch(battle, other);
      if (target !== null) replies.push({ choice: switchChoice(battle, other, target), weight: -theirMatchup });
    }
    return replies.sort((a, b) => b.weight - a.weight).slice(0, this.options.maxReplies);
  }
}

// ------------------------------------------------------------- Nightmare

export class NightmareAI extends LookaheadAI {
  readonly tier: TierId = 'nightmare';

  constructor(options: LookaheadOptions = NIGHTMARE_OPTIONS) {
    super(options);
  }
}

// ------------------------------------------------------------ simulation

export function strategyFor(tier: TierId): AIStrategy {
  switch (tier) {
    case 'easy': return new RandomAI();
    case 'normal': return new GreedyAI();
    case 'hard': return new SmartAI();
    case 'expert': return new LookaheadAI();
    case 'nightmare': return new NightmareAI();
  }
}

function switchChoice(battle: EngineBattle, side: SideId, partyIndex: number): string {
  return `switch ${battle.sim[side].pokemon.indexOf(battle.pokemon(side, partyIndex)) + 1}`;
}

/** The battle without its logs, as JSON, ready to be restored many times. */
function snapshotOf(sim: Battle): string {
  const state = State.serializeBattle(sim) as Record<string, unknown>;
  state.log = [];
  state.inputLog = [];
  return JSON.stringify(state);
}

/**
 * Plays a turn (or two) on a copy of the battle and scores the result for
 * `side`. The copy gets fresh randomness from the AI, so lookahead never sees
 * the real battle's upcoming rolls.
 */
function simulate(snapshot: string, side: SideId, myChoice: string, theirChoice: string, options: LookaheadOptions, seed: PRNGSeed): number {
  const { depth } = options;
  const battle = State.deserializeBattle(snapshot);
  battle.prng = new PRNG(seed);
  const other = foe(side);
  try {
    battle[side].clearChoice();
    battle[other].clearChoice();
    // A rejected choice (e.g. switching while trapped) rules the option out.
    if (!battle.choose(side, myChoice) || !battle.choose(other, theirChoice)) return -Infinity;
    if (depth === 2 && !battle.ended) {
      settleForcedSwitches(battle);
      if (!battle.ended && battle[side].activeRequest && !battle[side].activeRequest.wait) {
        battle.choose(side, greedyChoice(battle, side));
        battle.choose(other, greedyChoice(battle, other));
      }
    }
  } catch {
    return -Infinity;
  }
  return evaluate(battle, side);
}

function settleForcedSwitches(battle: Battle) {
  for (let i = 0; i < 4 && !battle.ended; i++) {
    const pending = (['p1', 'p2'] as const).filter((s) => battle[s].activeRequest?.forceSwitch && !battle[s].isChoiceDone());
    if (pending.length === 0) return;
    for (const s of pending) battle.choose(s, greedySwitch(battle, s));
  }
}

function greedyChoice(battle: Battle, side: SideId): string {
  if (battle[side].activeRequest?.forceSwitch) return greedySwitch(battle, side);
  const me = battle[side].active[0];
  const them = battle[foe(side)].active[0];
  let best = 'move 1';
  let bestFraction = -1;
  me.moveSlots.forEach((m, i) => {
    if (m.pp <= 0 || m.disabled) return;
    const f = damageFraction(battle, me, them, m.id);
    if (f > bestFraction) {
      bestFraction = f;
      best = `move ${i + 1}`;
    }
  });
  return best;
}

function greedySwitch(battle: Battle, side: SideId): string {
  const them = battle[foe(side)].active[0];
  let best = 0;
  let bestScore = -Infinity;
  battle[side].pokemon.forEach((p, i) => {
    if (p.fainted || p.isActive) return;
    const score = matchup(battle, p, them);
    if (score > bestScore) {
      bestScore = score;
      best = i + 1;
    }
  });
  return `switch ${best}`;
}

// Gen 1 status is harsh: sleep lasts up to 7 turns, freeze never thaws on its
// own, paralysis quarters Speed.
const STATUS_PENALTY: Record<string, number> = { slp: 0.5, frz: 0.8, par: 0.25, brn: 0.15, psn: 0.1, tox: 0.2 };
const BOOST_VALUE = 0.08;

/** Positive when `side` is ahead: remaining HP, fainted Pokémon, status and stat stages. */
export function evaluate(battle: Battle, side: SideId): number {
  if (battle.ended) return battle.winner === battle[side].name ? 100 : -100;
  const score = (s: SideId) => {
    let total = 0;
    for (const p of battle[s].pokemon) {
      if (p.fainted || p.hp <= 0) {
        total -= 0.3;
        continue;
      }
      total += p.hp / p.maxhp - (STATUS_PENALTY[p.status] ?? 0);
    }
    const active = battle[s].active[0];
    if (active && !active.fainted) {
      for (const stage of Object.values(active.boosts)) total += BOOST_VALUE * stage;
    }
    return total;
  };
  return score(side) - score(foe(side));
}

function healAmount(item: BattleItem, maxhp: number): number {
  return item.effect.kind === 'heal' ? (item.effect.hp === 'full' ? maxhp : item.effect.hp) : 0;
}

/** A simulator seed drawn from the AI's own randomness, never the real battle's. */
function randomSeed(rng: Rng): PRNGSeed {
  let hex = '';
  for (let i = 0; i < 8; i++) hex += rng.int(2 ** 32).toString(16).padStart(8, '0');
  return `sodium,${hex}`;
}
