import { describe, expect, it } from 'vitest';
import { LEGAL_NOTICE } from './legal';

describe('legal notice', () => {
  it('names all three rights holders and disclaims affiliation', () => {
    for (const owner of ['Nintendo', 'Game Freak', 'The Pokémon Company']) {
      expect(LEGAL_NOTICE).toContain(owner);
    }
    expect(LEGAL_NOTICE).toContain('not affiliated');
  });
});
