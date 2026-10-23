import type { PokemonSet } from '@pkmn/sim';
import type { PartyMember } from '../engine/party';

export interface TrainerAIRule {
  /** The rule fires when the turn's 0-255 roll is below this. */
  rollBelow: number;
  /** Only when HP is below maxHP / this. */
  hpBelowFraction?: number;
  action: { type: 'switch' } | { type: 'item'; item: string };
}

export interface TrainerData {
  id: string;
  name: string;
  title: string;
  optional?: boolean;
  ai: { usesPerPokemon: number; rules: TrainerAIRule[] };
  teams: { id: string; pokemon: { species: string; level: number; moves: string[] }[] }[];
}

export interface EliteFourData {
  game: string;
  trainerPokemon: {
    dvs: { hp: number; atk: number; def: number; spe: number; spc: number };
    statExp: number;
  };
  trainers: TrainerData[];
}

/** Builds a trainer's party for the engine. Showdown stores DVs as IVs (DV x 2) and stat exp as EVs. */
export function trainerParty(data: EliteFourData, team: TrainerData['teams'][number]): PartyMember[] {
  const { dvs, statExp } = data.trainerPokemon;
  const ev = Math.min(255, Math.ceil(Math.sqrt(statExp)));
  return team.pokemon.map((p): PartyMember => {
    const set: PokemonSet = {
      name: p.species,
      species: p.species,
      level: p.level,
      moves: [...p.moves],
      item: '', ability: '', nature: '', gender: '',
      ivs: { hp: dvs.hp * 2, atk: dvs.atk * 2, def: dvs.def * 2, spa: dvs.spc * 2, spd: dvs.spc * 2, spe: dvs.spe * 2 },
      evs: { hp: ev, atk: ev, def: ev, spa: ev, spd: ev, spe: ev },
    };
    return { set };
  });
}
