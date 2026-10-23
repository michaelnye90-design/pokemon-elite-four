// Quick damage and matchup estimates for AI decisions. Uses the battle's own
// type chart and current stats, so ruleset changes (quirk fixes) carry over.
// No randomness: average roll, no crits, scaled by accuracy.

import type { Battle, Pokemon } from '@pkmn/sim';

/** Average of the Gen 1-2 random factor (217-255)/255. */
const AVERAGE_ROLL = 0.925;

/** Expected damage of `moveId` from `attacker` to `defender`, in HP. */
export function estimateDamage(battle: Battle, attacker: Pokemon, defender: Pokemon, moveId: string): number {
  const move = battle.dex.moves.get(moveId);
  if (!move.exists || move.category === 'Status') return 0;
  if (!battle.dex.getImmunity(move.type, defender)) return 0;
  const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;

  if (move.ohko) return attacker.getStat('spe') >= defender.getStat('spe') ? defender.hp * accuracy : 0;
  if (move.damage === 'level') return attacker.level * accuracy;
  if (typeof move.damage === 'number') return move.damage * accuracy;
  if (move.basePower <= 0) return 0;

  const physical = move.category === 'Physical';
  let attack = statOf(attacker, physical ? 'atk' : 'spa');
  let defense = statOf(defender, physical ? 'def' : 'spd');
  if (physical ? defender.volatiles['reflect'] : defender.volatiles['lightscreen']) defense *= 2;
  if (attack > 255 || defense > 255) {
    attack = Math.max(1, Math.floor(attack / 4));
    defense = Math.max(1, Math.floor(defense / 4));
  }

  let damage = Math.floor(Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * move.basePower * attack) / defense) / 50) + 2;
  if (attacker.hasType(move.type)) damage *= 1.5;
  damage *= 2 ** battle.dex.getEffectiveness(move.type, defender);

  let hits = 1;
  if (Array.isArray(move.multihit)) hits = move.multihit[0] === move.multihit[1] ? move.multihit[0] : 3;
  else if (typeof move.multihit === 'number') hits = move.multihit;

  return damage * AVERAGE_ROLL * hits * accuracy;
}

/** Fraction of the defender's current HP the move is expected to take (capped at 1). */
export function damageFraction(battle: Battle, attacker: Pokemon, defender: Pokemon, moveId: string): number {
  if (defender.hp <= 0) return 0;
  return Math.min(1, estimateDamage(battle, attacker, defender, moveId) / defender.hp);
}

/** The attacker's best expected damage against the defender with any usable move, in HP (uncapped). */
export function bestDamage(battle: Battle, attacker: Pokemon, defender: Pokemon): number {
  let best = 0;
  for (const slot of attacker.moveSlots) {
    if (slot.pp <= 0 || slot.disabled) continue;
    best = Math.max(best, estimateDamage(battle, attacker, defender, slot.id));
  }
  return best;
}

/** The attacker's best expected damage fraction against the defender with any usable move. */
export function bestDamageFraction(battle: Battle, attacker: Pokemon, defender: Pokemon): number {
  if (defender.hp <= 0) return 0;
  return Math.min(1, bestDamage(battle, attacker, defender) / defender.hp);
}

/**
 * How well `mine` fares against `theirs`, from about -1 (bad) to +1 (good):
 * damage it deals minus damage it takes, with a bonus for moving first.
 */
export function matchup(battle: Battle, mine: Pokemon, theirs: Pokemon): number {
  const dealt = bestDamageFraction(battle, mine, theirs);
  const taken = bestDamageFraction(battle, theirs, mine);
  const faster = mine.getStat('spe') > theirs.getStat('spe') ? 0.1 : 0;
  return dealt - taken + faster;
}

function statOf(pokemon: Pokemon, stat: 'atk' | 'def' | 'spa' | 'spd' | 'spe'): number {
  return pokemon.modifiedStats?.[stat] ?? pokemon.getStat(stat);
}
