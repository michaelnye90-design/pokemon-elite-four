import { describe, expect, it } from 'vitest';
import { formatLog, parseHp } from './log';
import { mon, party, startBattle } from '../engine/testing';

const ctx = { gen: 1, opponentName: 'Elite Four Lorelei' };
const texts = (lines: string[]) => formatLog(lines, ctx).flatMap((e) => (e.text ? [e.text] : []));

describe('battle log', () => {
  it('parses HP strings', () => {
    expect(parseHp('40/141 par')).toEqual({ hp: 40, maxhp: 141, status: 'par' });
    expect(parseHp('0 fnt')).toEqual({ hp: 0, maxhp: 0, status: 'fnt' });
  });

  it('formats a real turn, using exact HP from the private half of split lines', () => {
    const b = startBattle(party(mon('Pikachu', ['thunderbolt'])), party(mon('Gyarados', ['leer'])));
    const start = 0;
    b.choose('p1', { type: 'move', slot: 0 });
    b.choose('p2', { type: 'move', slot: 0 });
    const events = formatLog(b.log.slice(start), ctx);
    const lines = events.flatMap((e) => (e.text ? [e.text] : []));
    expect(lines).toContain('Go! Pikachu!');
    expect(lines).toContain('Elite Four Lorelei sent out Gyarados!');
    expect(lines).toContain('Pikachu used Thunderbolt!');
    expect(lines).toContain('It’s super effective!');
    const gyaradosHp = events.filter((e) => e.update?.kind === 'hp' && e.update.side === 'p2').at(-1)!.update!;
    expect(gyaradosHp).toMatchObject({ hp: b.active('p2').hp, maxhp: b.active('p2').maxhp });
    expect(events.some((e) => e.turn === 2)).toBe(true);
  });

  it('describes status, stat changes and fainting', () => {
    expect(
      texts([
        '|-status|p2a: Snorlax|par',
        '|cant|p2a: Snorlax|par',
        '|-boost|p1a: Slowbro|spa|2',
        '|-boost|p1a: Slowbro|spd|2',
        '|-unboost|p2a: Onix|def|1',
        '|faint|p1a: Pikachu',
      ]),
    ).toEqual([
      'The opposing Snorlax is paralyzed! It may be unable to move!',
      'The opposing Snorlax is paralyzed! It can’t move!',
      'Slowbro’s Special rose sharply!',
      'The opposing Onix’s Defense fell!',
      'Pikachu fainted!',
    ]);
  });

  it('explains residual damage instead of a percentage', () => {
    expect(texts(['|switch|p1a: Pikachu|Pikachu, L50|141/141', '|-damage|p1a: Pikachu|133/141 psn|[from] psn'])).toEqual([
      'Go! Pikachu!',
      'Pikachu was hurt by poison!',
    ]);
  });
});
