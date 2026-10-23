import type { PRNGSeed } from '@pkmn/sim';

const SEED_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** A short, human-readable run seed, shown on the results screen. */
export function newRunSeed(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => SEED_ALPHABET[b % SEED_ALPHABET.length]).join('');
}

/**
 * Derives the simulator seed for one battle of a run, so every battle in a run
 * is reproducible from the run seed alone.
 */
export function battleSeed(runSeed: string, battleIndex: number): PRNGSeed {
  let hex = '';
  for (let word = 0; word < 8; word++) {
    hex += hash32(`${runSeed}/${battleIndex}/${word}`).toString(16).padStart(8, '0');
  }
  return `sodium,${hex}`;
}

// FNV-1a with a murmur3 finalizer: not cryptographic, just well-mixed and stable.
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
