import { describe, expect, it } from 'vitest';
import { DIFFICULTY, TIER_ORDER, type TierId } from '../config/difficulty';
import { champion, createRun } from '../game/run';
import { createRng } from '../engine/rng';
import { gen1 } from '../rules/gen1';
import { startBattle } from '../engine/testing';
import { attackScore, chooseMoves, learnableMoves } from './moveset';
import { anchorTeam, isEligible } from './team';

const data = gen1.data;
const speciesByName = new Map(data.species.map((s) => [s.name, s]));
const moveById = new Map(data.moves.map((m) => [m.id, m]));
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `seed${i}`);
const rivalTeam = (id: string) => champion(gen1).teams.find((t) => t.id === id)!;

describe('createRun', () => {
  it('is fully determined by the seed', () => {
    expect(createRun(gen1, 'normal', 'abc')).toEqual(createRun(gen1, 'normal', 'abc'));
    expect(createRun(gen1, 'normal', 'abc').team).not.toEqual(createRun(gen1, 'normal', 'abd').team);
  });

  it('picks each of the three Champion teams across runs', () => {
    const picked = new Set(seeds(60).map((s) => createRun(gen1, 'normal', s).rivalTeamId));
    expect([...picked].sort()).toEqual(['flareon', 'jolteon', 'vaporeon']);
  });
});

describe('generated teams', () => {
  const runs = TIER_ORDER.flatMap((tier) => seeds(40).map((seed) => createRun(gen1, tier, seed)));

  it('have six different species, each with 1-4 distinct, really learnable moves', () => {
    for (const run of runs) {
      expect(run.team).toHaveLength(6);
      expect(new Set(run.team.map((s) => s.species)).size).toBe(6);
      for (const set of run.team) {
        const where = `${run.tier}/${run.seed}/${set.species}`;
        const learnable = learnableMoves(data, speciesByName.get(set.species)!.id, set.level);
        expect(set.moves.length, where).toBeGreaterThan(0);
        expect(set.moves.length, where).toBeLessThanOrEqual(4);
        expect(new Set(set.moves).size, where).toBe(set.moves.length);
        for (const m of set.moves) expect(learnable.has(m), `${where}/${m}`).toBe(true);
      }
    }
  });

  it('give every Pokémon at least one damaging move, and never Ditto', () => {
    for (const run of runs) {
      for (const set of run.team) {
        expect(set.species).not.toBe('Ditto');
        const species = speciesByName.get(set.species)!;
        expect(set.moves.some((m) => attackScore(moveById.get(m)!, species) > 0), set.species).toBe(true);
      }
    }
  });

  it('never include a Pokémon that would already have evolved by levelling up', () => {
    for (const run of runs) {
      for (const set of run.team) {
        expect(isEligible(gen1, run.tier, speciesByName.get(set.species)!, set.level), set.species).toBe(true);
      }
    }
    const charmander = speciesByName.get('Charmander')!;
    expect(isEligible(gen1, 'normal', charmander, 60)).toBe(false);
    expect(isEligible(gen1, 'normal', speciesByName.get('Kadabra')!, 60)).toBe(true); // trade evolution
  });

  it('only allow legendaries and pseudo-legendaries on tiers that permit them', () => {
    for (const run of runs) {
      const restricted = run.team.filter((s) => gen1.restrictedSpecies.includes(s.species));
      if (!DIFFICULTY[run.tier].team.allowRestricted) expect(restricted, run.tier).toEqual([]);
    }
    const easyRestricted = seeds(200).some((s) =>
      createRun(gen1, 'easy', s).team.some((m) => gen1.restrictedSpecies.includes(m.species)),
    );
    expect(easyRestricted).toBe(true);
  });

  it('on Normal, the strongest Pokémon matches the rival ace in level and base stat total', () => {
    for (const seed of seeds(40)) {
      const run = createRun(gen1, 'normal', seed);
      const ace = anchorTeam(gen1, rivalTeam(run.rivalTeamId))[0];
      const lead = run.team[0];
      expect(lead.level).toBe(ace.level);
      expect(Math.abs(speciesByName.get(lead.species)!.bst - ace.bst)).toBeLessThanOrEqual(DIFFICULTY.normal.team.bstTolerance);
    }
  });

  it('get steadily weaker from Easy to Nightmare', () => {
    const average = (tier: TierId) => {
      const teams = seeds(40).map((s) => createRun(gen1, tier, s).team);
      const all = teams.flat();
      return {
        level: all.reduce((n, s) => n + s.level, 0) / all.length,
        bst: all.reduce((n, s) => n + speciesByName.get(s.species)!.bst, 0) / all.length,
      };
    };
    const tiers = TIER_ORDER.map(average);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].level, TIER_ORDER[i]).toBeLessThan(tiers[i - 1].level);
      expect(tiers[i].bst, TIER_ORDER[i]).toBeLessThan(tiers[i - 1].bst);
    }
  });

  it('start a battle in the engine', () => {
    const run = createRun(gen1, 'normal', 'engine');
    const b = startBattle(run.team.map((set) => ({ set })), run.team.map((set) => ({ set: { ...set } })));
    expect(b.sim.p1.pokemon.map((p) => p.moveSlots.map((m) => m.id))).toEqual(run.team.map((s) => s.moves));
  });
});

describe('moveset choice', () => {
  it('gives Electric types that can learn Thunderbolt their Thunderbolt', () => {
    const electric = data.species.filter((s) => s.types.includes('Electric') && !s.evos.length);
    expect(electric.length).toBeGreaterThan(3);
    for (const s of electric) {
      if (!learnableMoves(data, s.id, 60).has('thunderbolt')) continue;
      for (const seed of seeds(10)) {
        expect(chooseMoves(data, s.id, 60, createRng(seed, 'moves')), s.name).toContain('thunderbolt');
      }
    }
  });

  it('leads with a same-type attack when there is one', () => {
    for (const s of data.species.filter((x) => !x.evos.length && x.name !== 'Ditto')) {
      const moves = chooseMoves(data, s.id, 60, createRng('stab', s.id));
      const stabAvailable = [...learnableMoves(data, s.id, 60)].some((id) => {
        const m = moveById.get(id)!;
        return s.types.includes(m.type) && attackScore(m, s) >= 30;
      });
      if (stabAvailable) expect(s.types, s.name).toContain(moveById.get(moves[0])!.type);
    }
  });
});
