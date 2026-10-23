// Gen 1 ruleset: Pokémon Showdown's Gen 1 mechanics plus what this game adds
// (bag items), and the Gen 1 data. Gen 1 quirk fixes will also live here,
// each behind a switch.

import { Dex, type Format } from '@pkmn/sim';
import elite4 from '../../data/gen1/elite4.json';
import items from '../../data/gen1/items.json';
import learnsets from '../../data/gen1/learnsets.json';
import moves from '../../data/gen1/moves.json';
import species from '../../data/gen1/species.json';
import types from '../../data/gen1/types.json';
import { RESTRICTED_SPECIES } from '../config/difficulty';
import type { GenData } from '../data/types';
import { USE_ITEM_CONDITION } from '../engine/items';
import type { Ruleset } from './ruleset';

const MOD_ID = 'elitefourgen1';

const dex = Dex.mod(MOD_ID, {
  Scripts: { inherit: 'gen1', gen: 1 },
  Conditions: { useitem: USE_ITEM_CONDITION },
  Formats: [{ name: '[Gen 1] Elite Four Challenge', mod: MOD_ID, ruleset: [] }],
} as Parameters<typeof Dex.mod>[1]);

export const gen1Format: Format = dex.formats.get('gen1elitefourchallenge');

export const gen1: Ruleset = {
  gen: 1,
  name: 'Kanto (Yellow)',
  format: gen1Format,
  data: { species, moves, learnsets, types, items, elite4 } as unknown as GenData,
  restrictedSpecies: RESTRICTED_SPECIES[1],
};
