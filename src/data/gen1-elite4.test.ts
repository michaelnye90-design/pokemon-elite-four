import { describe, expect, it } from 'vitest';
import elite4Json from '../../data/gen1/elite4.json';
import moves from '../../data/gen1/moves.json';
import species from '../../data/gen1/species.json';
import { baseStats, gen1Stat, mon, party, startBattle } from '../engine/testing';
import { type EliteFourData, trainerParty } from './trainers';

const elite4 = elite4Json as EliteFourData;
const moveIds = new Set(moves.map((m) => m.id));
const speciesNames = new Set(species.map((s) => s.name));
const allTeams = elite4.trainers.flatMap((t) => t.teams.map((team) => ({ trainer: t, team })));

describe('gen 1 Elite Four data', () => {
  it('has Lorelei, Bruno, Agatha, Lance, then the optional Champion with three Yellow teams', () => {
    expect(elite4.game).toBe('Yellow');
    expect(elite4.trainers.map((t) => t.id)).toEqual(['lorelei', 'bruno', 'agatha', 'lance', 'champion']);
    expect(elite4.trainers.filter((t) => t.optional).map((t) => t.id)).toEqual(['champion']);
    expect(elite4.trainers.at(-1)!.teams.map((t) => t.id)).toEqual(['jolteon', 'flareon', 'vaporeon']);
  });

  it('only uses real Gen 1 species and moves, 1-4 distinct moves each', () => {
    for (const { trainer, team } of allTeams) {
      for (const p of team.pokemon) {
        const where = `${trainer.id}/${team.id}/${p.species}`;
        expect(speciesNames.has(p.species), where).toBe(true);
        expect(p.level, where).toBeGreaterThan(0);
        expect(p.level, where).toBeLessThanOrEqual(100);
        expect(p.moves.length, where).toBeGreaterThan(0);
        expect(p.moves.length, where).toBeLessThanOrEqual(4);
        expect(new Set(p.moves).size, where).toBe(p.moves.length);
        for (const m of p.moves) expect(moveIds.has(m), `${where}/${m}`).toBe(true);
      }
    }
  });

  it('describes AI rules with valid rolls and the items Yellow trainers use', () => {
    const items = new Set(['superpotion', 'hyperpotion', 'fullrestore', 'xdefend']);
    for (const t of elite4.trainers) {
      expect(t.ai.usesPerPokemon).toBeGreaterThan(0);
      for (const rule of t.ai.rules) {
        expect(rule.rollBelow).toBeGreaterThan(0);
        expect(rule.rollBelow).toBeLessThanOrEqual(256);
        if (rule.action.type === 'item') expect(items).toContain(rule.action.item);
      }
    }
  });

  // The disagreements in docs/data-sources/gen1-elite-four.md, as resolved.
  it('keeps the resolved source disagreements', () => {
    const team = (trainer: string, id = 'default') =>
      elite4.trainers.find((t) => t.id === trainer)!.teams.find((t) => t.id === id)!.pokemon;
    expect(team('bruno')[0].moves).toContain('rockslide');
    expect(team('agatha')[3]).toMatchObject({ species: 'Arbok', level: 58 });
    expect(team('champion', 'jolteon')[5].moves).toEqual(['pinmissile', 'thunderwave', 'quickattack', 'thunder']);
    expect(team('champion', 'flareon')[5].moves).toContain('reflect');
    expect(team('champion', 'vaporeon').slice(3, 5)).toMatchObject([
      { species: 'Ninetales', level: 61 },
      { species: 'Magneton', level: 63 },
    ]);
  });
});

describe('gen 1 Elite Four in the engine', () => {
  it('gives trainer Pokémon DVs 9/8/8/8 and no stat exp', () => {
    const lance = elite4.trainers.find((t) => t.id === 'lance')!;
    const b = startBattle(trainerParty(elite4, { ...lance.teams[0], pokemon: [lance.teams[0].pokemon[4]] }), party(mon('Rattata', ['tackle'])));
    const dragonite = b.active('p1');
    const base = baseStats('Dragonite');
    expect(dragonite.level).toBe(62);
    expect(dragonite.maxhp).toBe(gen1Stat(base.hp, 8, 0, 62, true));
    expect(dragonite.storedStats.atk).toBe(gen1Stat(base.atk, 9, 0, 62));
    expect(dragonite.storedStats.def).toBe(gen1Stat(base.def, 8, 0, 62));
    expect(dragonite.storedStats.spa).toBe(gen1Stat(base.spc, 8, 0, 62));
    expect(dragonite.storedStats.spe).toBe(gen1Stat(base.spe, 8, 0, 62));
  });

  it.each(allTeams.map(({ trainer, team }) => [`${trainer.id}/${team.id}`, trainer, team] as const))(
    '%s starts a battle with every move usable',
    (_, trainer, team) => {
      const b = startBattle(party(mon('Mew', ['splash'])), trainerParty(elite4, team));
      expect(b.sim.p2.pokemon.map((p) => p.species.name)).toEqual(team.pokemon.map((p) => p.species));
      for (const [i, p] of b.sim.p2.pokemon.entries()) {
        expect(p.moveSlots.map((m) => m.id), `${trainer.id} #${i}`).toEqual(team.pokemon[i].moves);
      }
    },
  );
});
