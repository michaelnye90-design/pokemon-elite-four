// Every difficulty knob in one place, for tuning after playtesting.
//
// Team strength is anchored to the rival Champion's team: slot by slot, the
// player's Pokémon get the rival's levels (plus `levelOffset`) and a base stat
// total near the rival Pokémon's BST times `bstScale`. On Normal, the player's
// strongest Pokémon matches the rival's strongest.

export type TierId = 'easy' | 'normal' | 'hard' | 'expert' | 'nightmare';

export interface TierConfig {
  label: string;
  team: {
    /** Added to each of the rival's levels. */
    levelOffset: number;
    /** Multiplies each of the rival's base stat totals to get the target. */
    bstScale: number;
    /** Species within this many BST points of the target are candidates (widened if none fit). */
    bstTolerance: number;
    /** Whether legendaries and pseudo-legendaries (see `restrictedSpecies`) can appear. */
    allowRestricted: boolean;
    /** Gen 1-2 DVs (0-15) for the player's team; 'max' is 15 in every stat. */
    dvs: 'max' | 'trainer';
    /** Gen 1-2 stat experience for the player's team (0-65535). */
    statExp: number;
  };
  playerItems: {
    /** Shop points. An item costs its in-game price / POINTS_PER_PRICE. */
    budget: number;
    /** Held items, in generations that have them. */
    heldItems: boolean;
  };
  opponentItems: {
    /** Added to each trainer's real per-Pokémon item uses (never below 0). Normal = real game. */
    extraUsesPerPokemon: number;
  };
}

export const TIER_ORDER: TierId[] = ['easy', 'normal', 'hard', 'expert', 'nightmare'];

/** An item that costs 1500 in-game costs 15 points. */
export const POINTS_PER_PRICE = 100;

/** Legendaries and pseudo-legendaries, per generation. */
export const RESTRICTED_SPECIES: Record<number, string[]> = {
  1: ['Articuno', 'Zapdos', 'Moltres', 'Mewtwo', 'Mew', 'Dragonite'],
};

/** How auto-fill splits the budget between item categories. */
export const AUTO_FILL_SHARES = { healing: 0.55, revive: 0.3, status: 0.15 } as const;

export const DIFFICULTY: Record<TierId, TierConfig> = {
  easy: {
    label: 'Easy',
    team: { levelOffset: 5, bstScale: 1.1, bstTolerance: 40, allowRestricted: true, dvs: 'max', statExp: 65535 },
    playerItems: { budget: 200, heldItems: true },
    opponentItems: { extraUsesPerPokemon: -1 },
  },
  normal: {
    label: 'Normal',
    team: { levelOffset: 0, bstScale: 1.0, bstTolerance: 35, allowRestricted: true, dvs: 'trainer', statExp: 0 },
    playerItems: { budget: 120, heldItems: true },
    opponentItems: { extraUsesPerPokemon: 0 },
  },
  hard: {
    label: 'Hard',
    team: { levelOffset: -2, bstScale: 0.95, bstTolerance: 35, allowRestricted: false, dvs: 'trainer', statExp: 0 },
    playerItems: { budget: 75, heldItems: true },
    opponentItems: { extraUsesPerPokemon: 1 },
  },
  expert: {
    label: 'Expert',
    team: { levelOffset: -4, bstScale: 0.9, bstTolerance: 35, allowRestricted: false, dvs: 'trainer', statExp: 0 },
    playerItems: { budget: 40, heldItems: true },
    opponentItems: { extraUsesPerPokemon: 2 },
  },
  nightmare: {
    label: 'Nightmare',
    team: { levelOffset: -7, bstScale: 0.8, bstTolerance: 35, allowRestricted: false, dvs: 'trainer', statExp: 0 },
    playerItems: { budget: 15, heldItems: false },
    opponentItems: { extraUsesPerPokemon: 3 },
  },
};
