import type { PokemonSet } from '@pkmn/sim';

export type StatusId = 'brn' | 'par' | 'slp' | 'frz' | 'psn';

/**
 * What carries over from one battle to the next in a run. There is no free
 * healing between Elite Four fights, so HP, PP and major status persist.
 */
export interface MonCondition {
  hp: number;
  status: StatusId | null;
  /** Remaining sleep turns, when asleep. */
  sleepTurns?: number;
  /** PP left in each move slot, in set order. */
  pp: number[];
}

export interface PartyMember {
  set: PokemonSet;
  /** Absent means fresh: full HP and PP, no status. */
  condition?: MonCondition;
}
