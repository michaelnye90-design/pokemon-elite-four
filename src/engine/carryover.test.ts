import { describe, expect, it } from 'vitest';
import type { PartyMember } from './party';
import { mon, party, startBattle } from './testing';

const wall = () => party(mon('Snorlax', ['harden']));

describe('carrying HP, PP and status between battles', () => {
  it('a battle starts with the condition the previous one ended with', () => {
    const team = () => party(mon('Pikachu', ['thunderbolt', 'quickattack']), mon('Raichu', ['thunderbolt']));

    // Battle 1: take some hits and spend some PP.
    const first = startBattle(team(), party(mon('Snorlax', ['bodyslam'])), 3);
    first.choose('p1', { type: 'move', slot: 0 });
    first.choose('p2', { type: 'move', slot: 0 });
    const after = first.snapshot('p1');
    expect(after[0].pp).toEqual([23, 48]);

    // Battle 2 against someone else, no healing in between.
    const carried: PartyMember[] = team().map((m, i) => ({ ...m, condition: after[i] }));
    const second = startBattle(carried, wall(), 4);
    expect(second.snapshot('p1')).toEqual(after);
    expect(after[0].hp).toBeGreaterThan(0);
    expect(after[0].hp).toBeLessThan(second.active('p1').maxhp);
    expect(second.active('p1').hp).toBe(after[0].hp);
    expect(second.legalActions('p1').moves.map((m) => m.pp)).toEqual([23, 48]);
  });

  it('round-trips status, including remaining sleep turns', () => {
    const conditions = [
      { hp: 77, status: 'psn' as const, pp: [3, 10] },
      { hp: 90, status: 'slp' as const, sleepTurns: 3, pp: [12] },
      { hp: 40, status: 'brn' as const, pp: [1] },
    ];
    const b = startBattle(
      party(
        [mon('Pikachu', ['thunderbolt', 'quickattack']), conditions[0]],
        [mon('Raichu', ['thunderbolt']), conditions[1]],
        [mon('Charmander', ['ember']), conditions[2]],
      ),
      wall(),
    );
    expect(b.snapshot('p1')).toEqual(conditions);
    expect(b.pokemon('p1', 1).statusState.time).toBe(3);
  });

  it('a carried-over paralysis slows the lead, and a benched one slows on switch-in', () => {
    const b = startBattle(
      party(
        [mon('Pikachu', ['growl']), { hp: 141, status: 'par', pp: [64] }],
        [mon('Jolteon', ['growl']), { hp: 100, status: 'par', pp: [64] }],
      ),
      wall(),
    );
    const lead = b.active('p1');
    expect(lead.modifiedStats!.spe).toBe(Math.floor(lead.storedStats.spe / 4));
    b.choose('p1', { type: 'switch', partyIndex: 1 });
    b.choose('p2', { type: 'move', slot: 0 });
    const jolteon = b.active('p1');
    expect(jolteon.modifiedStats!.spe).toBe(Math.floor(jolteon.storedStats.spe / 4));
  });

  it('fainted Pokémon stay fainted: the first healthy one leads and the run can be lost', () => {
    const b = startBattle(
      party(
        [mon('Pikachu', ['growl']), { hp: 0, status: null, pp: [64] }],
        [mon('Magikarp', ['splash']), { hp: 1, status: null, pp: [64] }],
      ),
      party(mon('Snorlax', ['bodyslam'])),
    );
    expect(b.active('p1').name).toBe('Magikarp');
    expect(b.partyIndex(b.active('p1'))).toBe(1);
    expect(b.legalActions('p1').switches).toEqual([]);

    b.choose('p1', { type: 'move', slot: 0 });
    b.choose('p2', { type: 'move', slot: 0 });
    expect(b.ended).toBe(true);
    expect(b.winner).toBe('p2');
  });

  it('snapshots stay in party order after switching', () => {
    const b = startBattle(party(mon('Pikachu', ['growl', 'thunderbolt']), mon('Raichu', ['thunderbolt'])), wall());
    b.choose('p1', { type: 'switch', partyIndex: 1 });
    b.choose('p2', { type: 'move', slot: 0 });
    expect(b.active('p1').name).toBe('Raichu');
    const snap = b.snapshot('p1');
    const pikachu = b.pokemon('p1', 0);
    const raichu = b.pokemon('p1', 1);
    expect(snap[0]).toEqual({ hp: pikachu.maxhp, status: null, pp: pikachu.baseMoveSlots.map((m) => m.maxpp) });
    expect(snap[1]).toEqual({ hp: raichu.maxhp, status: null, pp: [24] });
  });

  // Showdown's Gen 1 max PP for a 40-PP move is 61, not 64 (PP is 6 bits on the cartridge).
  it('uses Showdown max PP of 61 for 40-PP moves', () => {
    const b = startBattle(party(mon('Pikachu', ['growl'])), wall());
    expect(b.active('p1').baseMoveSlots[0].maxpp).toBe(61);
  });
});
