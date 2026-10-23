import { describe, expect, it } from 'vitest';
import { parseHp } from './log';

describe('protocol helpers', () => {
  it('parses HP strings', () => {
    expect(parseHp('40/141 par')).toEqual({ hp: 40, maxhp: 141, status: 'par' });
    expect(parseHp('141/141')).toEqual({ hp: 141, maxhp: 141, status: '' });
    expect(parseHp('0 fnt')).toEqual({ hp: 0, maxhp: 0, status: 'fnt' });
  });
});
