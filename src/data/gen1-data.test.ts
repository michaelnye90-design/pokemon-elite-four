import { describe, expect, it } from 'vitest';
import species from '../../data/gen1/species.json';
import moves from '../../data/gen1/moves.json';
import learnsets from '../../data/gen1/learnsets.json';
import types from '../../data/gen1/types.json';

type Learnsets = Record<string, { move: string; method: string; level?: number }[]>;

const speciesById = new Map(species.map((s) => [s.id, s]));
const movesById = new Map(moves.map((m) => [m.id, m]));
const learnsetsById = learnsets as Learnsets;

describe('gen 1 species', () => {
  it('has exactly #1-#151, each once', () => {
    expect(species.map((s) => s.num)).toEqual(Array.from({ length: 151 }, (_, i) => i + 1));
  });

  it('uses the single Gen 1 Special stat and a matching BST', () => {
    for (const s of species) {
      expect(Object.keys(s.baseStats).sort()).toEqual(['atk', 'def', 'hp', 'spc', 'spe']);
      expect(s.bst).toBe(Object.values(s.baseStats).reduce((a, b) => a + b, 0));
    }
  });

  it('matches known Gen 1 base stats', () => {
    expect(speciesById.get('mewtwo')!.baseStats).toEqual({ hp: 106, atk: 110, def: 90, spc: 154, spe: 130 });
    expect(speciesById.get('pikachu')!.baseStats).toEqual({ hp: 35, atk: 55, def: 30, spc: 50, spe: 90 });
    expect(speciesById.get('chansey')!.baseStats).toEqual({ hp: 250, atk: 5, def: 5, spc: 105, spe: 50 });
  });

  it('only uses Gen 1 types and links evolutions both ways', () => {
    for (const s of species) {
      for (const t of s.types) expect(types.types).toContain(t);
      if (s.prevo) expect(speciesById.get(s.prevo)!.evos).toContain(s.id);
    }
  });
});

describe('gen 1 moves', () => {
  it('has all 165 moves with Gen 1 type-based categories', () => {
    expect(moves).toHaveLength(165);
    expect(movesById.get('bite')).toMatchObject({ type: 'Normal', category: 'Physical' });
    expect(movesById.get('icepunch')).toMatchObject({ type: 'Ice', category: 'Special' });
    expect(movesById.get('thunderbolt')).toMatchObject({ basePower: 95, accuracy: 100, pp: 15 });
  });
});

describe('gen 1 learnsets', () => {
  it('has a learnset for every species, referencing only Gen 1 moves', () => {
    for (const s of species) {
      const entries = learnsetsById[s.id];
      expect(entries, s.id).toBeDefined();
      for (const e of entries) expect(movesById.has(e.move), `${s.id}/${e.move}`).toBe(true);
    }
  });

  it('leaves Ditto as the only species with no damaging level-up or TM move', () => {
    const usableMoves = (id: string) => {
      const out = new Set<string>();
      for (let s: string | null = id; s; s = speciesById.get(s)!.prevo) {
        for (const e of learnsetsById[s]) if (e.method === 'level' || e.method === 'tm') out.add(e.move);
      }
      return out;
    };
    const noDamage = species.filter((s) => ![...usableMoves(s.id)].some((m) => movesById.get(m)!.category !== 'Status'));
    expect(noDamage.map((s) => s.id)).toEqual(['ditto']);
  });
});

describe('gen 1 type chart', () => {
  const chart = types.chart as Record<string, Record<string, number>>;

  it('covers the 15 Gen 1 types with legal multipliers', () => {
    expect(types.types).toHaveLength(15);
    for (const a of types.types) for (const d of types.types) expect([0, 0.5, 1, 2]).toContain(chart[a][d]);
  });

  it('keeps the cartridge Gen 1 quirks (fixes are applied later, in the ruleset)', () => {
    expect(chart.Ghost.Psychic).toBe(0);
    expect(chart.Bug.Poison).toBe(2);
    expect(chart.Poison.Bug).toBe(2);
    expect(chart.Ice.Fire).toBe(1);
  });
});
