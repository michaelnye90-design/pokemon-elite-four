// Shared helpers for engine tests, including an independent implementation of
// the Gen 1 stat and damage formulas (from Bulbapedia) to check the simulator against.

import type { PokemonSet } from '@pkmn/sim';
import species from '../../data/gen1/species.json';
import { gen1Format } from '../rules/gen1';
import { EngineBattle } from './battle';
import type { MonCondition, PartyMember } from './party';
import { battleSeed } from './seed';

/** Showdown stores Gen 1 DVs as IVs (DV x 2) and stat experience as EVs (0-255). */
const MAX_IVS = { hp: 30, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 };
const MAX_EVS = { hp: 255, atk: 255, def: 255, spa: 255, spd: 255, spe: 255 };

export function mon(name: string, moves: string[], level = 50): PokemonSet {
  return {
    name, species: name, moves, level,
    item: '', ability: '', nature: '', gender: '',
    ivs: { ...MAX_IVS }, evs: { ...MAX_EVS },
  };
}

export function party(...members: (PokemonSet | [PokemonSet, MonCondition])[]): PartyMember[] {
  return members.map((m) => (Array.isArray(m) ? { set: m[0], condition: m[1] } : { set: m }));
}

export function startBattle(p1: PartyMember[], p2: PartyMember[], seedIndex = 0): EngineBattle {
  return new EngineBattle({ format: gen1Format, seed: battleSeed('test', seedIndex), p1, p2 });
}

/** Log lines written since `from`, without the per-turn timestamps. */
export function logSince(battle: EngineBattle, from: number): string[] {
  return battle.log.slice(from).filter((line) => !line.startsWith('|t:|'));
}

export function baseStats(name: string) {
  const s = species.find((x) => x.name === name);
  if (!s) throw new Error(`Unknown species ${name}`);
  return s.baseStats;
}

/** Cartridge Gen 1 stat formula. statExp 65535 is the maximum. */
export function gen1Stat(base: number, dv: number, statExp: number, level: number, isHp = false): number {
  const expTerm = Math.floor(Math.min(255, Math.floor(Math.sqrt(Math.max(0, statExp - 1))) + 1) / 4);
  const core = Math.floor((((base + dv) * 2 + expTerm) * level) / 100);
  return isHp ? core + level + 10 : core + 5;
}

/** Every damage value the Gen 1 formula can produce for a non-critical hit. */
export function gen1DamageRolls(opts: {
  level: number;
  power: number;
  attack: number;
  defense: number;
  stab: boolean;
  effectiveness: number[];
}): number[] {
  let { attack: a, defense: d } = opts;
  if (a > 255 || d > 255) {
    a = Math.max(1, Math.floor(a / 4));
    d = Math.max(1, Math.floor(d / 4));
  }
  let damage = Math.floor(Math.floor((Math.floor((2 * opts.level) / 5 + 2) * opts.power * a) / d) / 50);
  damage = Math.min(damage, 997) + 2;
  if (opts.stab) damage += Math.floor(damage / 2);
  for (const e of opts.effectiveness) damage = Math.floor((damage * e * 10) / 10);
  if (damage <= 1) return [damage];
  const rolls = new Set<number>();
  for (let r = 217; r <= 255; r++) rolls.add(Math.floor((damage * r) / 255));
  return [...rolls].sort((x, y) => x - y);
}
