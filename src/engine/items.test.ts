import { describe, expect, it } from 'vitest';
import type { BattleItem } from './items';
import { ALL_STATUSES } from './items';
import { logSince, mon, party, startBattle } from './testing';

// Test fixtures only; the real shop list is defined per generation.
const POTION: BattleItem = { id: 'potion', name: 'Potion', effect: { kind: 'heal', hp: 20 } };
const FULL_RESTORE: BattleItem = { id: 'fullrestore', name: 'Full Restore', effect: { kind: 'heal', hp: 'full', cures: ALL_STATUSES } };
const FULL_HEAL: BattleItem = { id: 'fullheal', name: 'Full Heal', effect: { kind: 'cure', cures: ALL_STATUSES } };
const REVIVE: BattleItem = { id: 'revive', name: 'Revive', effect: { kind: 'revive', hpFraction: 0.5 } };
const X_ATTACK: BattleItem = { id: 'xattack', name: 'X Attack', effect: { kind: 'boost', boosts: { atk: 1 } } };

const pikachu = () => mon('Pikachu', ['thunderbolt', 'quickattack']);
const raichu = () => mon('Raichu', ['thunderbolt']);
// An opponent that never changes HP, so HP changes come only from items.
const wall = () => party(mon('Snorlax', ['harden']));

describe('using an item', () => {
  it('heals the active Pokémon and takes its turn without spending PP', () => {
    const b = startBattle(party([pikachu(), { hp: 50, status: null, pp: [15, 30] }]), wall());
    const start = b.log.length;
    b.choose('p1', { type: 'item', item: POTION, partyIndex: 0 });
    b.choose('p2', { type: 'move', slot: 0 });

    const p = b.active('p1');
    expect(p.hp).toBe(70);
    expect(p.moveSlots.map((m) => m.pp)).toEqual([15, 30]);
    const lines = logSince(b, start);
    expect(lines).toContain('|message|Player used Potion on Pikachu!');
    expect(lines.some((l) => l.startsWith('|-heal|p1a: Pikachu|70/141|[from] item: Potion'))).toBe(true);
    expect(lines.some((l) => l.startsWith('|move|p1a:'))).toBe(false);
    expect(lines.some((l) => l.startsWith('|move|p2a: Snorlax|Harden'))).toBe(true);
    expect(Object.keys(p.volatiles)).not.toContain('useitem');
  });

  it('caps healing at max HP', () => {
    const b = startBattle(party([pikachu(), { hp: 130, status: null, pp: [24, 48] }]), wall());
    b.choose('p1', { type: 'item', item: POTION, partyIndex: 0 });
    expect(b.active('p1').hp).toBe(141);
  });

  it('refuses an item that would have no effect', () => {
    const b = startBattle(party(pikachu()), wall());
    expect(b.itemProblem('p1', POTION, 0)).toMatch(/won.t have any effect/);
    expect(() => b.choose('p1', { type: 'item', item: POTION, partyIndex: 0 })).toThrow();
    expect(b.itemProblem('p1', REVIVE, 0)).not.toBeNull();
  });

  it('can heal a benched Pokémon', () => {
    const b = startBattle(party(pikachu(), [raichu(), { hp: 10, status: null, pp: [24] }]), wall());
    b.choose('p1', { type: 'item', item: POTION, partyIndex: 1 });
    b.choose('p2', { type: 'move', slot: 0 });
    expect(b.pokemon('p1', 1).hp).toBe(30);
    expect(b.active('p1').hp).toBe(141);
  });

  it('revives a fainted benched Pokémon to half HP so it can battle again', () => {
    const b = startBattle(party(pikachu(), [raichu(), { hp: 0, status: null, pp: [24] }]), wall());
    expect(b.legalActions('p1').switches).toEqual([]);
    expect(b.sim.p1.pokemonLeft).toBe(1);

    b.choose('p1', { type: 'item', item: REVIVE, partyIndex: 1 });
    b.choose('p2', { type: 'move', slot: 0 });

    const r = b.pokemon('p1', 1);
    expect(r.fainted).toBe(false);
    expect(r.hp).toBe(Math.floor(r.maxhp / 2));
    expect(b.sim.p1.pokemonLeft).toBe(2);
    expect(b.legalActions('p1').switches).toEqual([1]);
    b.choose('p1', { type: 'switch', partyIndex: 1 });
    b.choose('p2', { type: 'move', slot: 0 });
    expect(b.active('p1')).toBe(r);
  });

  it('Full Heal cures paralysis and restores the speed drop immediately', () => {
    const b = startBattle(party([pikachu(), { hp: 141, status: 'par', pp: [24, 48] }]), wall());
    const p = b.active('p1');
    expect(p.modifiedStats!.spe).toBe(Math.floor(p.storedStats.spe / 4));
    b.choose('p1', { type: 'item', item: FULL_HEAL, partyIndex: 0 });
    expect(p.status).toBe('');
    expect(p.modifiedStats!.spe).toBe(p.storedStats.spe);
  });

  it('Full Restore heals and cures in one go, and works at full HP if statused', () => {
    const b = startBattle(party([pikachu(), { hp: 141, status: 'psn', pp: [24, 48] }]), wall());
    expect(b.itemProblem('p1', FULL_RESTORE, 0)).toBeNull();
    b.choose('p1', { type: 'item', item: FULL_RESTORE, partyIndex: 0 });
    expect(b.active('p1').status).toBe('');
  });

  it('X Attack raises Attack one stage', () => {
    const b = startBattle(party(pikachu()), wall());
    const p = b.active('p1');
    b.choose('p1', { type: 'item', item: X_ATTACK, partyIndex: 0 });
    expect(p.boosts.atk).toBe(1);
    expect(p.modifiedStats!.atk).toBe(Math.floor(p.storedStats.atk * 1.5));
  });

  it('the opponent can use items the same way', () => {
    const b = startBattle(party(mon('Pikachu', ['growl'])), party([mon('Snorlax', ['harden']), { hp: 100, status: null, pp: [48] }]));
    b.choose('p1', { type: 'move', slot: 0 });
    b.choose('p2', { type: 'item', item: POTION, partyIndex: 0 });
    expect(b.active('p2').hp).toBe(120);
    expect(b.active('p2').moveSlots[0].pp).toBe(48);
  });

  it('cannot be used while locked into recharging after Hyper Beam', () => {
    let checked = false;
    for (let seed = 0; seed < 20 && !checked; seed++) {
      const b = startBattle(party([mon('Chansey', ['hyperbeam']), { hp: 200, status: null, pp: [8] }]), wall(), seed);
      b.choose('p1', { type: 'move', slot: 0 });
      b.choose('p2', { type: 'move', slot: 0 });
      if (!b.active('p1').volatiles['mustrecharge']) continue; // missed
      expect(b.legalActions('p1').canUseItem).toBe(false);
      expect(() => b.choose('p1', { type: 'item', item: POTION, partyIndex: 0 })).toThrow();
      checked = true;
    }
    expect(checked).toBe(true);
  });
});
