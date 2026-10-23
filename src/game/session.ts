// A run in progress: the trainers in order, the player's party and bag
// carried between fights (no free healing), and the current battle.

import { AIController } from '../ai/controller';
import { strategyFor } from '../ai/tiers';
import type { TierId } from '../config/difficulty';
import type { TrainerData } from '../data/trainers';
import { trainerParty } from '../data/trainers';
import { EngineBattle, type Action, type LegalActions } from '../engine/battle';
import type { BattleItem } from '../engine/items';
import type { PartyMember } from '../engine/party';
import { createRng } from '../engine/rng';
import { battleSeed } from '../engine/seed';
import { opponentItemUses, type Cart } from '../generator/items';
import type { Ruleset } from '../rules/ruleset';
import type { RunSetup } from './run';

export type RunStatus = 'between' | 'fighting' | 'won' | 'lost';

export interface FightRecord {
  trainerId: string;
  trainerName: string;
  result: 'won' | 'lost';
  turns: number;
  /** Player Pokémon that fainted during this fight. */
  fainted: string[];
}

/** Lower tiers' trainers follow the original game's item rules; higher tiers judge for themselves. */
const ORIGINAL_ITEM_RULES: TierId[] = ['easy', 'normal'];

export class RunSession {
  readonly trainers: TrainerData[];
  party: PartyMember[];
  bag: Record<string, number>;
  fightIndex = 0;
  status: RunStatus = 'between';
  battle: EngineBattle | null = null;
  readonly records: FightRecord[] = [];
  /** Each party member's max HP, known once they've been in a battle. */
  readonly maxhp: number[] = [];
  private opponent: AIController | null = null;

  constructor(
    readonly rules: Ruleset,
    readonly setup: RunSetup,
    cart: Cart,
    readonly options: { includeChampion: boolean; playerName?: string },
  ) {
    this.trainers = rules.data.elite4.trainers.filter((t) => !t.optional || options.includeChampion);
    this.party = setup.team.map((set) => ({ set: { ...set, moves: [...set.moves] } }));
    this.bag = { ...cart };
  }

  get tier(): TierId {
    return this.setup.tier;
  }

  /** The trainer being fought, or just fought. */
  get currentTrainer(): TrainerData {
    return this.trainers[this.fightIndex];
  }

  /** Who's next once the current fight is won. */
  get upcomingTrainer(): TrainerData | undefined {
    return this.trainers[this.records.length];
  }

  /** The current trainer's team for this run (the Champion's depends on the run). */
  trainerTeam(trainer = this.currentTrainer): TrainerData['teams'][number] {
    return trainer.teams.find((t) => t.id === this.setup.rivalTeamId) ?? trainer.teams[0];
  }

  startFight(): EngineBattle {
    if (this.status !== 'between') throw new Error(`Can't start a fight while ${this.status}`);
    const trainer = this.currentTrainer;
    this.battle = new EngineBattle({
      format: this.rules.format,
      seed: battleSeed(this.setup.seed, this.fightIndex),
      p1: this.party,
      p2: trainerParty(this.rules.data.elite4, this.trainerTeam(trainer)),
      names: { p1: this.options.playerName ?? 'You', p2: `${trainer.title} ${trainer.name}` },
    });
    const itemsById = Object.fromEntries(this.rules.data.items.items.map((i) => [i.id, i as BattleItem]));
    this.opponent = new AIController(strategyFor(this.tier), createRng(this.setup.seed, `ai-fight${this.fightIndex}`), {
      kind: 'trainer',
      usesPerPokemon: opponentItemUses(trainer, this.tier),
      rules: trainer.ai.rules,
      items: itemsById,
      followOriginalRules: ORIGINAL_ITEM_RULES.includes(this.tier),
    });
    this.status = 'fighting';
    this.advanceOpponent();
    return this.battle;
  }

  playerActions(): LegalActions {
    return this.requireBattle().legalActions('p1');
  }

  /** Items in the bag, with how many are left. */
  bagItems(): { item: BattleItem; count: number }[] {
    return Object.entries(this.bag)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({ item: this.rules.data.items.items.find((i) => i.id === id)! as BattleItem, count }));
  }

  /**
   * The player's choice for this turn. The opponent decides first, before
   * the player's choice (or item) touches the battle, so it can't peek.
   */
  act(action: Action): void {
    const battle = this.requireBattle();
    if (this.status !== 'fighting') throw new Error('No fight in progress');
    if (action.type === 'item') {
      if ((this.bag[action.item.id] ?? 0) <= 0) throw new Error(`No ${action.item.name} left`);
      const problem = battle.itemProblem('p1', action.item, action.partyIndex);
      if (problem) throw new Error(problem);
    }
    const opponentAction = battle.legalActions('p2').wait ? null : this.opponent!.decide(battle, 'p2');
    if (opponentAction) battle.choose('p2', opponentAction);
    battle.choose('p1', action);
    if (action.type === 'item') this.bag[action.item.id]--;
    this.advanceOpponent();
    if (battle.ended) this.finishFight();
  }

  /** Moves on to the next trainer (call before each `startFight`). */
  nextFight(): void {
    if (this.status !== 'between') throw new Error(`Can't continue while ${this.status}`);
    if (this.records.length > this.fightIndex) this.fightIndex++;
    this.battle = null;
  }

  /**
   * Why `item` can't be used on party slot `partyIndex` between fights, or
   * null. (Healing, curing and reviving work outside battle; X items don't.)
   */
  outsideItemProblem(item: BattleItem, partyIndex: number): string | null {
    if (this.status !== 'between') return 'Only between fights.';
    if ((this.bag[item.id] ?? 0) <= 0) return `No ${item.name} left.`;
    const member = this.party[partyIndex];
    const maxhp = this.maxhp[partyIndex];
    const hp = member.condition?.hp ?? maxhp;
    const status = member.condition?.status ?? null;
    const e = item.effect;
    if (e.kind === 'boost') return 'That can only be used in battle.';
    if (e.kind === 'revive') return hp === 0 ? null : 'It won’t have any effect.';
    if (hp === 0) return `${member.set.species} has fainted.`;
    const curable = !!status && (e.kind === 'cure' || e.kind === 'heal') && !!e.cures?.includes(status);
    if (e.kind === 'cure') return curable ? null : 'It won’t have any effect.';
    return hp < maxhp || curable ? null : 'It won’t have any effect.';
  }

  /** Uses a bag item on a party member between fights. */
  useItemOutside(item: BattleItem, partyIndex: number): void {
    const problem = this.outsideItemProblem(item, partyIndex);
    if (problem) throw new Error(problem);
    const member = this.party[partyIndex];
    const maxhp = this.maxhp[partyIndex];
    const condition = member.condition ?? { hp: maxhp, status: null, pp: [] };
    const e = item.effect;
    let { hp, status } = condition;
    if (e.kind === 'revive') {
      hp = Math.max(1, Math.floor(maxhp * e.hpFraction));
      status = null;
    } else if (e.kind === 'heal') {
      hp = e.hp === 'full' ? maxhp : Math.min(maxhp, hp + e.hp);
      if (status && e.cures?.includes(status)) status = null;
    } else if (e.kind === 'cure' && status && e.cures.includes(status)) {
      status = null;
    }
    const { sleepTurns, ...rest } = condition;
    member.condition = { ...rest, hp, status, ...(status === 'slp' ? { sleepTurns } : {}) };
    this.bag[item.id]--;
  }

  // The opponent sometimes has to act on its own: a replacement after a
  // knockout while the player waits.
  private advanceOpponent() {
    const battle = this.requireBattle();
    for (let guard = 0; guard < 10 && !battle.ended; guard++) {
      if (!battle.legalActions('p1').wait || battle.legalActions('p2').wait) return;
      battle.choose('p2', this.opponent!.decide(battle, 'p2'));
    }
  }

  private finishFight() {
    const battle = this.requireBattle();
    const before = this.party.map((m) => (m.condition ? m.condition.hp > 0 : true));
    const after = battle.snapshot('p1');
    const won = battle.winner === 'p1';
    this.records.push({
      trainerId: this.currentTrainer.id,
      trainerName: `${this.currentTrainer.title} ${this.currentTrainer.name}`,
      result: won ? 'won' : 'lost',
      turns: battle.sim.turn,
      fainted: this.party.filter((_, i) => before[i] && after[i].hp <= 0).map((m) => m.set.species),
    });
    this.party = this.party.map((m, i) => ({ set: m.set, condition: after[i] }));
    this.party.forEach((_, i) => (this.maxhp[i] = battle.pokemon('p1', i).maxhp));
    if (!won) this.status = 'lost';
    else if (this.records.length >= this.trainers.length) this.status = 'won';
    else this.status = 'between';
  }

  private requireBattle(): EngineBattle {
    if (!this.battle) throw new Error('No battle');
    return this.battle;
  }
}
