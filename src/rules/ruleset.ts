import type { Format } from '@pkmn/sim';
import type { GenData } from '../data/types';

/** Everything generation-specific. Each generation is its own module implementing this. */
export interface Ruleset {
  gen: number;
  name: string;
  format: Format;
  data: GenData;
  /** Legendaries and pseudo-legendaries, only allowed on tiers that permit them. */
  restrictedSpecies: string[];
}
