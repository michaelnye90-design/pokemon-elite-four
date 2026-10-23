import { hash32 } from './seed';

/** Small seedable RNG (sfc32) for everything outside the simulator: team generation, AI rolls. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  /** Picks with probability proportional to `weight`. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
}

/** An RNG for one purpose (`label`) within a run, so purposes don't disturb each other's sequences. */
export function createRng(runSeed: string, label: string): Rng {
  let a = hash32(`${runSeed}#${label}#a`);
  let b = hash32(`${runSeed}#${label}#b`);
  let c = hash32(`${runSeed}#${label}#c`);
  let d = hash32(`${runSeed}#${label}#d`);

  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();

  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() from an empty list');
      return items[rng.int(items.length)];
    },
    weighted: (items, weight) => {
      const weights = items.map((i) => Math.max(0, weight(i)));
      const total = weights.reduce((s, w) => s + w, 0);
      if (total <= 0) return rng.pick(items);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
  return rng;
}
