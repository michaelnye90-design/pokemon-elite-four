import { describe, expect, it } from 'vitest';
import { mon, party, startBattle } from '../engine/testing';
import { gen1 } from '../rules/gen1';
import { classicBeats, type Beat } from './classic';

const ctx = {
  gen: 1,
  player: 'RED',
  opponent: 'LORELEI',
  moveCategory: (name: string) => gen1.data.moves.find((m) => m.name === name)?.category ?? 'Status',
};
const texts = (beats: Beat[]) => beats.flatMap((b) => (b.kind === 'text' ? [b.text] : []));

describe('Gen 1-style battle text', () => {
  it('uses the original wording, with effectiveness after the HP drain', () => {
    const b = startBattle(party(mon('Pikachu', ['thunderbolt'])), party(mon('Gyarados', ['leer'])));
    const start = b.log.length;
    b.choose('p1', { type: 'move', slot: 0 });
    b.choose('p2', { type: 'move', slot: 0 });
    const beats = classicBeats(b.log.slice(start), ctx);
    const kinds = beats.map((x) => (x.kind === 'text' ? `text:${x.text}` : x.kind));

    const used = kinds.indexOf('text:PIKACHU used THUNDERBOLT!');
    expect(used).toBeGreaterThanOrEqual(0);
    expect(kinds[used + 1]).toBe('attack');
    expect(kinds[used + 2]).toBe('hit');
    expect(kinds[used + 3]).toBe('hp');
    expect(kinds.slice(used + 4)).toContain('text:It’s super effective!');
    expect(texts(beats)).toContain('Enemy GYARADOS used LEER!');
  });

  it('describes sending out, status, stat changes and fainting', () => {
    expect(
      texts(
        classicBeats(
          [
            '|switch|p2a: Dewgong|Dewgong, L54|180/180',
            '|switch|p1a: Pikachu|Pikachu, L50|141/141',
            '|-status|p2a: Dewgong|par',
            '|cant|p2a: Dewgong|par',
            '|-boost|p1a: Pikachu|spa|2',
            '|-boost|p1a: Pikachu|spd|2',
            '|-unboost|p2a: Dewgong|def|1',
            '|faint|p1a: Pikachu',
          ],
          ctx,
        ),
      ),
    ).toEqual([
      'LORELEI sent out DEWGONG!',
      'Go! PIKACHU!',
      'Enemy DEWGONG’s paralyzed! It may not attack!',
      'Enemy DEWGONG’s fully paralyzed!',
      'PIKACHU’s SPECIAL greatly rose!',
      'Enemy DEWGONG’s DEFENSE fell!',
      'PIKACHU fainted!',
    ]);
  });

  it('turns item use into "<name> used <ITEM>!"', () => {
    expect(texts(classicBeats(['|message|Red used Hyper Potion on Pikachu!'], ctx))).toEqual(['RED used HYPER POTION!']);
  });
});
