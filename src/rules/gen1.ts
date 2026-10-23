// Gen 1 ruleset: Pokémon Showdown's Gen 1 mechanics plus what this game adds
// (bag items). Gen 1 quirk fixes will also live here, each behind a switch.

import { Dex, type Format } from '@pkmn/sim';
import { USE_ITEM_CONDITION } from '../engine/items';

const MOD_ID = 'elitefourgen1';

const dex = Dex.mod(MOD_ID, {
  Scripts: { inherit: 'gen1', gen: 1 },
  Conditions: { useitem: USE_ITEM_CONDITION },
  Formats: [{ name: '[Gen 1] Elite Four Challenge', mod: MOD_ID, ruleset: [] }],
} as Parameters<typeof Dex.mod>[1]);

export const gen1Format: Format = dex.formats.get('gen1elitefourchallenge');
