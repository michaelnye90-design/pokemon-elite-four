// Sprites are loaded at runtime from Pokémon Showdown's sprite server via
// @pkmn/img (see docs/DECISIONS.md); no Nintendo artwork is stored in this repo.

import type { GenerationNum } from '@pkmn/data';
import { Icons, Sprites } from '@pkmn/img';
import { esc } from './dom';

/** Front sprite for the opponent (`p2`), back sprite for the player (`p1`). */
export function sprite(species: string, gen: number, side: 'p1' | 'p2', scale = 2): string {
  const s = Sprites.getPokemon(species, { gen: gen as GenerationNum, side });
  return `<img class="sprite" src="${esc(s.url)}" width="${s.w * scale}" height="${s.h * scale}" alt="${esc(species)}" draggable="false">`;
}

/** Small party icon, greyed out when fainted. */
export function icon(species: string, fainted = false): string {
  const i = Icons.getPokemon(species, { fainted });
  return `<span class="icon${fainted ? ' fainted' : ''}" style="${esc(i.style)}" role="img" aria-label="${esc(species)}"></span>`;
}
