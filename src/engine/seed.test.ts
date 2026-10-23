import { describe, expect, it } from 'vitest';
import { battleSeed, newRunSeed } from './seed';

describe('seeds', () => {
  it('makes short readable run seeds', () => {
    expect(newRunSeed()).toMatch(/^[0-9a-z]{10}$/);
    expect(newRunSeed()).not.toBe(newRunSeed());
  });

  it('derives a stable, distinct simulator seed for each battle in a run', () => {
    expect(battleSeed('abc123', 0)).toBe(battleSeed('abc123', 0));
    expect(battleSeed('abc123', 0)).toMatch(/^sodium,[0-9a-f]{64}$/);
    const seeds = new Set([0, 1, 2, 3, 4].map((i) => battleSeed('abc123', i)));
    seeds.add(battleSeed('abc124', 0));
    expect(seeds.size).toBe(6);
  });
});
