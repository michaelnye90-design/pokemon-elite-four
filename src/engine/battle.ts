// Thin wrapper around a Pokémon Showdown battle that adds what an in-game
// trainer battle needs and Showdown lacks: bag items, and HP/PP/status that
// carry over from the previous battle.

import { Battle, type Format, type ID, type Pokemon, type PRNGSeed, type Side, type StatIDExceptHP } from '@pkmn/sim';
import type { BattleItem } from './items';
import type { MonCondition, PartyMember, StatusId } from './party';

export type SideId = 'p1' | 'p2';

export type Action =
  /** 0-based move slot. */
  | { type: 'move'; slot: number }
  | { type: 'switch'; partyIndex: number }
  | { type: 'item'; item: BattleItem; partyIndex: number };

export interface EngineBattleOptions {
  format: Format;
  seed: PRNGSeed;
  p1: PartyMember[];
  p2: PartyMember[];
  names?: Partial<Record<SideId, string>>;
}

export interface LegalActions {
  /** Must pick a replacement for a fainted Pokémon (no moves or items). */
  forceSwitch: boolean;
  /** Nothing to choose this turn (e.g. waiting for the other side's replacement). */
  wait: boolean;
  moves: { slot: number; id: string; pp?: number; maxpp?: number; disabled: boolean }[];
  /** Party indices this side may switch to. */
  switches: number[];
  /** False while locked into a move (recharging, Thrash, Bide, ...). */
  canUseItem: boolean;
}

type ChoiceRequest = NonNullable<Side['activeRequest']>;

const SIDES: SideId[] = ['p1', 'p2'];
const BOOST_MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 3.5, 4];
const DROP_MULTIPLIERS = [1, 0.66, 0.5, 0.4, 0.33, 0.28, 0.25];

export class EngineBattle {
  readonly sim: Battle;
  private readonly names: Record<SideId, string>;
  private readonly partyIndexOf = new Map<Pokemon, number>();

  constructor(options: EngineBattleOptions) {
    this.names = { p1: options.names?.p1 ?? 'Player', p2: options.names?.p2 ?? 'Opponent' };
    this.sim = new Battle({ formatid: options.format.id, format: options.format, seed: options.seed });

    // In-game, the first Pokémon that hasn't fainted leads.
    const orders = {} as Record<SideId, number[]>;
    for (const side of SIDES) {
      const party = options[side];
      const lead = party.findIndex((m) => !m.condition || m.condition.hp > 0);
      if (lead < 0) throw new Error(`${side} has no Pokémon able to battle`);
      orders[side] = [lead, ...Array.from(party.keys()).filter((i) => i !== lead)];
    }

    // The battle starts (leads sent out) as soon as both players are set.
    for (const side of SIDES) {
      const team = orders[side].map((i) => ({ ...options[side][i].set }));
      this.sim.setPlayer(side, { name: this.names[side], team });
    }

    for (const side of SIDES) {
      orders[side].forEach((partyIndex, position) => {
        const pokemon = this.sim[side].pokemon[position];
        this.partyIndexOf.set(pokemon, partyIndex);
        const condition = options[side][partyIndex].condition;
        if (condition) applyCondition(pokemon, condition);
      });
    }
    // The turn-1 requests were built before the carried-over condition was
    // applied (PP, fainted bench), so rebuild them.
    if (SIDES.some((side) => options[side].some((m) => m.condition))) this.sim.makeRequest('move');
  }

  get log(): readonly string[] {
    return this.sim.log;
  }

  get ended(): boolean {
    return this.sim.ended;
  }

  get winner(): SideId | null {
    if (!this.sim.ended) return null;
    return SIDES.find((side) => this.names[side] === this.sim.winner) ?? null;
  }

  /** The Pokémon in party slot `partyIndex`, wherever it now is in the simulator's order. */
  pokemon(side: SideId, partyIndex: number): Pokemon {
    const found = this.sim[side].pokemon.find((p) => this.partyIndexOf.get(p) === partyIndex);
    if (!found) throw new Error(`No party slot ${partyIndex} on ${side}`);
    return found;
  }

  active(side: SideId): Pokemon {
    return this.sim[side].active[0];
  }

  partyIndex(pokemon: Pokemon): number {
    return this.partyIndexOf.get(pokemon)!;
  }

  legalActions(side: SideId): LegalActions {
    const request = this.sim[side].activeRequest as ChoiceRequest | null;
    const none: LegalActions = { forceSwitch: false, wait: true, moves: [], switches: [], canUseItem: false };
    if (!request || this.sim.ended || request.wait || this.sim[side].isChoiceDone()) return none;

    const switches = this.sim[side].pokemon
      .filter((p) => !p.fainted && !p.isActive)
      .map((p) => this.partyIndex(p))
      .sort((a, b) => a - b);

    if (request.forceSwitch) {
      return { ...none, wait: false, forceSwitch: true, switches };
    }
    if (!('active' in request)) return none;

    const active = request.active[0];
    const moves = active.moves.map((m, slot) => ({
      slot,
      id: m.id,
      pp: m.pp,
      maxpp: m.maxpp,
      disabled: !!m.disabled,
    }));
    // A locked-in move (recharge, Thrash, Bide, ...) comes back as a single entry without PP.
    const locked = moves.length === 1 && moves[0].pp === undefined;
    return {
      forceSwitch: false,
      wait: false,
      moves,
      switches: active.trapped || locked ? [] : switches,
      canUseItem: !locked,
    };
  }

  /** Why `item` can't be used on party slot `partyIndex` right now, or null if it can. */
  itemProblem(side: SideId, item: BattleItem, partyIndex: number): string | null {
    if (!this.legalActions(side).canUseItem) return 'Items cannot be used right now.';
    const target = this.pokemon(side, partyIndex);
    const effect = item.effect;
    switch (effect.kind) {
      case 'heal': {
        if (target.fainted) return `${target.name} has fainted.`;
        const curable = !!effect.cures && isCurable(target, effect.cures);
        if (target.hp >= target.maxhp && !curable) return 'It won’t have any effect.';
        return null;
      }
      case 'cure':
        if (target.fainted || !isCurable(target, effect.cures)) return 'It won’t have any effect.';
        return null;
      case 'revive':
        return target.fainted ? null : 'It won’t have any effect.';
      case 'boost':
        if (!target.isActive) return 'Only the Pokémon in battle can use that.';
        if (Object.entries(effect.boosts).every(([stat, n]) => n! > 0 && target.boosts[stat as keyof typeof target.boosts] >= 6)) {
          return 'It won’t have any effect.';
        }
        return null;
    }
  }

  choose(side: SideId, action: Action): void {
    // A use-item marker only lingers if its holder never reached its move
    // last turn; it must not cancel this turn's move.
    for (const p of this.sim[side].pokemon) p.removeVolatile('useitem');

    let choice: string;
    switch (action.type) {
      case 'move':
        choice = `move ${action.slot + 1}`;
        break;
      case 'switch':
        choice = `switch ${this.sim[side].pokemon.indexOf(this.pokemon(side, action.partyIndex)) + 1}`;
        break;
      case 'item': {
        const problem = this.itemProblem(side, action.item, action.partyIndex);
        if (problem) throw new Error(problem);
        this.applyItem(side, action.item, action.partyIndex);
        // Using an item takes the turn: submit a move that the use-item
        // condition cancels before it runs or spends PP.
        const active = this.active(side);
        active.addVolatile('useitem');
        const slot = this.legalActions(side).moves.find((m) => !m.disabled && (m.pp ?? 1) > 0)?.slot ?? 0;
        choice = `move ${slot + 1}`;
        break;
      }
    }
    if (!this.sim.choose(side, choice)) {
      throw new Error(`Invalid choice for ${side}: ${choice}`);
    }
  }

  /** Each party member's condition, in party order, for carrying into the next battle. */
  snapshot(side: SideId): MonCondition[] {
    const out: MonCondition[] = [];
    for (const pokemon of this.sim[side].pokemon) {
      const status = toStatusId(pokemon.status);
      out[this.partyIndex(pokemon)] = {
        hp: pokemon.hp,
        status,
        ...(status === 'slp' ? { sleepTurns: pokemon.statusState.time as number } : {}),
        pp: pokemon.baseMoveSlots.map((m) => m.pp),
      };
    }
    return out;
  }

  private applyItem(side: SideId, item: BattleItem, partyIndex: number) {
    const target = this.pokemon(side, partyIndex);
    const from = `[from] item: ${item.name}`;
    const effect = item.effect;
    this.sim.add('message', `${this.names[side]} used ${item.name} on ${target.name}!`);
    switch (effect.kind) {
      case 'heal': {
        const amount = effect.hp === 'full' ? target.maxhp : effect.hp;
        if (target.hp < target.maxhp) {
          target.hp = Math.min(target.maxhp, target.hp + amount);
          this.sim.add('-heal', target, target.getHealth, from);
        }
        if (effect.cures && isCurable(target, effect.cures)) cureStatus(target);
        break;
      }
      case 'cure':
        cureStatus(target);
        break;
      case 'revive':
        target.fainted = false;
        target.faintQueued = false;
        target.switchFlag = false;
        target.status = '';
        target.hp = Math.max(1, Math.floor(target.maxhp * effect.hpFraction));
        target.side.pokemonLeft++;
        this.sim.add('-heal', target, target.getHealth, from);
        break;
      case 'boost':
        this.sim.boost(effect.boosts, target, target, null);
        break;
    }
  }
}

function toStatusId(status: string): StatusId | null {
  if (status === 'tox') return 'psn'; // Badly poisoned becomes regular poison after battle.
  return status === 'brn' || status === 'par' || status === 'slp' || status === 'frz' || status === 'psn'
    ? status
    : null;
}

function isCurable(pokemon: Pokemon, cures: StatusId[]): boolean {
  const status = toStatusId(pokemon.status);
  return status !== null && cures.includes(status);
}

function cureStatus(pokemon: Pokemon) {
  const status = pokemon.status;
  pokemon.cureStatus();
  pokemon.removeVolatile('residualdmg'); // Toxic counter
  // Gen 1 leaves the paralysis/burn stat drop in place after a cure until
  // the stat is recalculated; restore it straight away instead.
  if (pokemon.modifiedStats && pokemon.isActive) {
    if (status === 'par') recalcStat(pokemon, 'spe');
    if (status === 'brn') recalcStat(pokemon, 'atk');
  }
}

function recalcStat(pokemon: Pokemon, stat: StatIDExceptHP) {
  const stage = pokemon.boosts[stat];
  const multiplier = stage >= 0 ? BOOST_MULTIPLIERS[stage] : DROP_MULTIPLIERS[-stage];
  pokemon.modifiedStats![stat] = Math.max(1, Math.floor(pokemon.storedStats[stat] * multiplier));
}

function applyCondition(pokemon: Pokemon, condition: MonCondition) {
  condition.pp.forEach((pp, i) => {
    if (pokemon.baseMoveSlots[i]) pokemon.baseMoveSlots[i].pp = Math.min(pp, pokemon.baseMoveSlots[i].maxpp);
    if (pokemon.moveSlots[i]) pokemon.moveSlots[i].pp = Math.min(pp, pokemon.moveSlots[i].maxpp);
  });

  pokemon.hp = Math.max(0, Math.min(pokemon.maxhp, condition.hp));
  if (pokemon.hp === 0) {
    pokemon.fainted = true;
    pokemon.status = 'fnt' as ID;
    pokemon.side.pokemonLeft--;
    return;
  }

  if (condition.status) {
    pokemon.setStatus(condition.status, null, null, true);
    if (condition.status === 'slp' && condition.sleepTurns !== undefined) {
      pokemon.statusState.time = condition.sleepTurns;
      pokemon.statusState.startTime = condition.sleepTurns;
    }
    // Gen 1 applies the paralysis/burn stat drop when the status is inflicted
    // or the Pokémon switches in; the lead is already in, so apply it here.
    if (pokemon.isActive && pokemon.modifyStat) {
      if (condition.status === 'par') pokemon.modifyStat('spe', 0.25);
      if (condition.status === 'brn') pokemon.modifyStat('atk', 0.5);
    }
  }
}
