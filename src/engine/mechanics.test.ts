import { describe, expect, it } from 'vitest';
import { baseStats, gen1DamageRolls, gen1Stat, logSince, mon, party, startBattle } from './testing';

const MAX_EXP = 65535;

describe('gen 1 stats', () => {
  it.each([
    ['Pikachu', 50],
    ['Snorlax', 50],
    ['Mewtwo', 100],
    ['Chansey', 73],
  ])('%s at L%i matches the cartridge formula (max DVs and stat exp)', (name, level) => {
    const b = startBattle(party(mon(name, ['tackle'], level)), party(mon('Rattata', ['tackle'])));
    const p = b.active('p1');
    const base = baseStats(name);
    expect(p.maxhp).toBe(gen1Stat(base.hp, 15, MAX_EXP, level, true));
    expect(p.storedStats.atk).toBe(gen1Stat(base.atk, 15, MAX_EXP, level));
    expect(p.storedStats.def).toBe(gen1Stat(base.def, 15, MAX_EXP, level));
    expect(p.storedStats.spa).toBe(gen1Stat(base.spc, 15, MAX_EXP, level));
    expect(p.storedStats.spe).toBe(gen1Stat(base.spe, 15, MAX_EXP, level));
  });

  it('matches the formula for trainer-style DVs (9/8/8/8) and no stat exp', () => {
    const set = mon('Dragonite', ['slam'], 62);
    set.ivs = { hp: 16, atk: 18, def: 16, spa: 16, spd: 16, spe: 16 };
    set.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    const b = startBattle(party(set), party(mon('Rattata', ['tackle'])));
    const p = b.active('p1');
    const base = baseStats('Dragonite');
    expect(p.maxhp).toBe(gen1Stat(base.hp, 8, 0, 62, true));
    expect(p.storedStats.atk).toBe(gen1Stat(base.atk, 9, 0, 62));
    expect(p.storedStats.spe).toBe(gen1Stat(base.spe, 8, 0, 62));
  });
});

describe('gen 1 damage', () => {
  /**
   * Runs one turn of `attacker` using `move` against `defender` over many
   * seeds and collects the damage of every non-critical hit.
   */
  function sampleDamage(attacker: string, move: string, defender: string, defenderMove: string) {
    const damages: number[] = [];
    for (let seed = 0; seed < 300; seed++) {
      const b = startBattle(party(mon(attacker, [move])), party(mon(defender, [defenderMove])), seed);
      const target = b.active('p2');
      const before = target.hp;
      const start = b.log.length;
      b.choose('p1', { type: 'move', slot: 0 });
      b.choose('p2', { type: 'move', slot: 0 });
      const lines = logSince(b, start);
      if (lines.some((l) => l.startsWith('|-crit|') || l.startsWith('|-miss|'))) continue;
      damages.push(before - target.hp);
    }
    return damages;
  }

  const L50 = (base: number) => gen1Stat(base, 15, MAX_EXP, 50);

  it('neutral STAB hit: Pikachu Thunderbolt vs Snorlax', () => {
    // floor(floor(22 * 95 * 101 / 116) / 50) + 2 = 38; STAB -> 57; rolls 48..57
    const expected = gen1DamageRolls({
      level: 50, power: 95, attack: L50(baseStats('Pikachu').spc), defense: L50(baseStats('Snorlax').spc),
      stab: true, effectiveness: [1],
    });
    expect(expected[0]).toBe(48);
    expect(expected.at(-1)).toBe(57);
    const seen = new Set(sampleDamage('Pikachu', 'thunderbolt', 'Snorlax', 'harden'));
    for (const d of seen) expect(expected).toContain(d);
    expect(seen).toContain(expected[0]);
    expect(seen).toContain(expected.at(-1));
  });

  it('4x super effective: Pikachu Thunderbolt vs Gyarados (multipliers applied one at a time)', () => {
    const expected = gen1DamageRolls({
      level: 50, power: 95, attack: L50(baseStats('Pikachu').spc), defense: L50(baseStats('Gyarados').spc),
      stab: true, effectiveness: [2, 2],
    });
    const seen = new Set(sampleDamage('Pikachu', 'thunderbolt', 'Gyarados', 'leer'));
    expect(seen.size).toBeGreaterThan(5);
    for (const d of seen) expect(expected).toContain(d);
  });

  it('resisted hit: Pikachu Thunderbolt vs Venusaur', () => {
    const expected = gen1DamageRolls({
      level: 50, power: 95, attack: L50(baseStats('Pikachu').spc), defense: L50(baseStats('Venusaur').spc),
      stab: true, effectiveness: [0.5],
    });
    const seen = new Set(sampleDamage('Pikachu', 'thunderbolt', 'Venusaur', 'growth'));
    expect(seen.size).toBeGreaterThan(2);
    for (const d of seen) expect(expected).toContain(d);
  });

  it('Gen 1 Ghost-vs-Psychic bug is present in the base mechanics', () => {
    const b = startBattle(party(mon('Gengar', ['lick'])), party(mon('Alakazam', ['recover'])));
    const start = b.log.length;
    b.choose('p1', { type: 'move', slot: 0 });
    b.choose('p2', { type: 'move', slot: 0 });
    expect(logSince(b, start).some((l) => l.startsWith('|-immune|p2a: Alakazam'))).toBe(true);
  });
});

describe('gen 1 turn order', () => {
  /** Which side's `move` line comes first in the turn's log, or null if either didn't move. */
  function firstMover(lines: string[]): 'p1' | 'p2' | null {
    const moves = lines.filter((l) => l.startsWith('|move|'));
    if (moves.length < 2) return null;
    return moves[0].startsWith('|move|p1a') ? 'p1' : 'p2';
  }

  function turn(b: ReturnType<typeof startBattle>, p1Slot = 0, p2Slot = 0) {
    const start = b.log.length;
    b.choose('p1', { type: 'move', slot: p1Slot });
    b.choose('p2', { type: 'move', slot: p2Slot });
    return logSince(b, start);
  }

  it('the faster Pokémon moves first', () => {
    for (let seed = 0; seed < 20; seed++) {
      const b = startBattle(party(mon('Snorlax', ['harden'])), party(mon('Pikachu', ['growl'])), seed);
      expect(firstMover(turn(b))).toBe('p2');
    }
  });

  it('Quick Attack goes before a faster Pokémon', () => {
    for (let seed = 0; seed < 20; seed++) {
      const b = startBattle(party(mon('Rattata', ['quickattack'])), party(mon('Pikachu', ['growl'])), seed);
      expect(firstMover(turn(b))).toBe('p1');
    }
  });

  it('speed ties are random, roughly 50/50', () => {
    let p1First = 0;
    for (let seed = 0; seed < 200; seed++) {
      const b = startBattle(party(mon('Pikachu', ['growl'])), party(mon('Pikachu', ['growl'])), seed);
      if (firstMover(turn(b)) === 'p1') p1First++;
    }
    expect(p1First).toBeGreaterThan(70);
    expect(p1First).toBeLessThan(130);
  });

  it('paralysis quarters speed and flips the order', () => {
    let checked = 0;
    for (let seed = 0; seed < 20; seed++) {
      const b = startBattle(party(mon('Pikachu', ['thunderwave'])), party(mon('Persian', ['growl'])), seed);
      const persian = b.active('p2');
      expect(firstMover(turn(b))).toBe('p2');
      if (persian.status !== 'par') continue;
      expect(persian.modifiedStats!.spe).toBe(Math.floor(persian.storedStats.spe / 4));
      const order = firstMover(turn(b));
      if (order === null) continue; // fully paralyzed this turn
      expect(order).toBe('p1');
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe('seeded replay', () => {
  function play(seedIndex: number) {
    const b = startBattle(
      party(mon('Pikachu', ['thunderbolt', 'quickattack']), mon('Raichu', ['thunderbolt'])),
      party(mon('Snorlax', ['bodyslam', 'headbutt'])),
      seedIndex,
    );
    for (let t = 0; t < 6 && !b.ended; t++) {
      const p1 = b.legalActions('p1');
      if (p1.forceSwitch) b.choose('p1', { type: 'switch', partyIndex: p1.switches[0] });
      else if (!p1.wait) b.choose('p1', { type: 'move', slot: t % p1.moves.length });
      const p2 = b.legalActions('p2');
      if (!p2.wait && !p2.forceSwitch) b.choose('p2', { type: 'move', slot: t % 2 });
    }
    return logSince(b, 0);
  }

  it('the same seed and choices reproduce the battle exactly', () => {
    expect(play(7)).toEqual(play(7));
  });

  it('a different seed gives a different battle', () => {
    expect(play(7)).not.toEqual(play(8));
  });
});
