// Picks a sensible moveset from a Pokémon's real learnset: strong same-type
// attacks first, then coverage, then often one useful status move.

import type { GenData, MoveData, SpeciesData } from '../data/types';
import type { Rng } from '../engine/rng';

/** Ways of learning a move that count for random teams (no event or tutor-only moves). */
const ALLOWED_METHODS = new Set(['level', 'tm']);

/** Multipliers for attacks whose raw power overstates how good they are. */
const POWER_ADJUST: Record<string, number> = {
  // Charge turn
  razorwind: 0.5, solarbeam: 0.5, skullbash: 0.5, skyattack: 0.5,
  // Charge turn, but dodges a hit
  fly: 0.8, dig: 0.8,
  // Faint the user
  selfdestruct: 0.3, explosion: 0.3,
  // Only work on a sleeping target, or lock the user in
  dreameater: 0.3, rage: 0.3, thrash: 0.85, petaldance: 0.85,
  hyperbeam: 0.75,
};

/** High-crit moves (Slash, Razor Leaf, ...) crit far more often in Gen 1. */
const HIGH_CRIT_BONUS = 1.6;

/** Off-type Normal attacks hit nothing super-effectively, so they're weak coverage. */
const NORMAL_COVERAGE_PENALTY = 0.6;

/** Fixed-damage moves, valued as if they had this power. */
const FIXED_DAMAGE_POWER = { level: 70, dragonrage: 35, sonicboom: 15 } as const;

/** One-hit KO moves: rarely hit and fail against faster targets in Gen 1. */
const OHKO_POWER = 40;

/** Status moves worth a slot, with how often to pick each. */
const STATUS_WEIGHTS: Record<string, number> = {
  spore: 10, sleeppowder: 8, lovelykiss: 7, hypnosis: 6, sing: 4,
  thunderwave: 8, glare: 8, stunspore: 7,
  amnesia: 9, swordsdance: 7, agility: 5, growth: 4,
  recover: 8, softboiled: 8, rest: 4,
  toxic: 4, leechseed: 4, reflect: 4, lightscreen: 3, substitute: 4,
  confuseray: 3, barrier: 3, acidarmor: 4, doubleteam: 1,
};

const STATUS_MOVE_CHANCE = 0.6;
const MIN_ATTACK_SCORE = 30;

/** Moves a species could know at `level`: its own and its pre-evolutions' level-up moves, plus TMs/HMs. */
export function learnableMoves(data: GenData, speciesId: string, level: number): Set<string> {
  const byId = new Map(data.species.map((s) => [s.id, s]));
  const out = new Set<string>();
  for (let id: string | null = speciesId; id; id = byId.get(id)?.prevo ?? null) {
    for (const e of data.learnsets[id] ?? []) {
      if (!ALLOWED_METHODS.has(e.method)) continue;
      if (e.method === 'level' && (e.level ?? 1) > level) continue;
      out.add(e.move);
    }
  }
  out.delete('struggle');
  return out;
}

/** How good an attack is for this Pokémon, roughly in base-power units. 0 for non-attacks. */
export function attackScore(move: MoveData, species: SpeciesData): number {
  if (move.category === 'Status') return 0;
  let power = move.basePower;
  if (move.damage === 'level') power = FIXED_DAMAGE_POWER.level;
  else if (typeof move.damage === 'number') power = FIXED_DAMAGE_POWER[move.id as 'dragonrage' | 'sonicboom'] ?? move.damage;
  if (move.ohko) power = OHKO_POWER;
  if (power <= 0) return 0;

  if (Array.isArray(move.multihit)) power *= move.multihit[0] === move.multihit[1] ? move.multihit[0] : 3;
  else if (typeof move.multihit === 'number') power *= move.multihit;

  const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
  const stab = species.types.includes(move.type) ? 1.5 : 1;
  // Fit to the attacker: physical uses Attack, special uses Special.
  const { atk, spc = species.baseStats.spa } = species.baseStats;
  const stat = move.category === 'Physical' ? atk : spc;
  const fit = Math.min(1.5, Math.max(0.5, stat / ((atk + spc) / 2)));
  const crit = (move.critRatio ?? 1) > 1 ? HIGH_CRIT_BONUS : 1;
  const coverage = move.type === 'Normal' && stab === 1 ? NORMAL_COVERAGE_PENALTY : 1;

  return power * accuracy * stab * fit * crit * coverage * (POWER_ADJUST[move.id] ?? 1);
}

export function hasDamagingMove(data: GenData, speciesId: string, level: number): boolean {
  const moves = new Map(data.moves.map((m) => [m.id, m]));
  const species = data.species.find((s) => s.id === speciesId)!;
  return [...learnableMoves(data, speciesId, level)].some((id) => attackScore(moves.get(id)!, species) > 0);
}

export function chooseMoves(data: GenData, speciesId: string, level: number, rng: Rng): string[] {
  const species = data.species.find((s) => s.id === speciesId);
  if (!species) throw new Error(`Unknown species ${speciesId}`);
  const moveById = new Map(data.moves.map((m) => [m.id, m]));
  const learnable = [...learnableMoves(data, speciesId, level)].map((id) => moveById.get(id)!).filter(Boolean);

  // Best attack of each type.
  const bestByType = new Map<string, { move: MoveData; score: number }>();
  for (const move of learnable) {
    const score = attackScore(move, species);
    if (score <= 0) continue;
    const current = bestByType.get(move.type);
    if (!current || score > current.score) bestByType.set(move.type, { move, score });
  }
  const attacks = [...bestByType.values()].sort((a, b) => b.score - a.score || a.move.id.localeCompare(b.move.id));
  if (attacks.length === 0) throw new Error(`${species.name} has no damaging moves at L${level}`);
  const viable = attacks.filter((a) => a.score >= MIN_ATTACK_SCORE);
  const pool = viable.length > 0 ? viable : attacks.slice(0, 1);

  const chosen: string[] = [];
  const take = (id: string) => {
    if (!chosen.includes(id)) chosen.push(id);
  };

  // 1. Same-type attacks: an Electric type gets its best Electric move, etc.
  for (const type of species.types) {
    const stab = pool.find((a) => a.move.type === type);
    if (stab) take(stab.move.id);
  }
  if (chosen.length === 0) take(pool[0].move.id);

  // 2. Maybe one status move.
  const statusOptions = learnable.filter((m) => STATUS_WEIGHTS[m.id]);
  const wantStatus = statusOptions.length > 0 && rng.next() < STATUS_MOVE_CHANCE;

  // 3. Coverage attacks, favouring the stronger ones.
  const slotsForAttacks = wantStatus ? 3 : 4;
  let coverage = pool.filter((a) => !chosen.includes(a.move.id));
  while (chosen.length < slotsForAttacks && coverage.length > 0) {
    const pick = rng.weighted(coverage.slice(0, 4), (a) => a.score * a.score);
    take(pick.move.id);
    coverage = coverage.filter((a) => a !== pick);
  }

  if (wantStatus) take(rng.weighted(statusOptions, (m) => STATUS_WEIGHTS[m.id]).id);

  // 4. Still short (few viable attacks): top up with anything left, status moves first.
  const leftovers = [
    ...statusOptions.map((m) => m.id),
    ...attacks.map((a) => a.move.id),
    ...learnable.filter((m) => m.category === 'Status').map((m) => m.id),
  ];
  for (const id of leftovers) {
    if (chosen.length >= 4) break;
    take(id);
  }
  return chosen.slice(0, 4);
}
