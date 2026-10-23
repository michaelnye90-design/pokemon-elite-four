// Turns the simulator's protocol into a Gen 1-style sequence of "beats": a
// message for the text box, or an animation (lunge, blink, HP drain, faint).
// Wording follows the original games: names in capitals, "Enemy" for the
// opponent's Pokémon, effectiveness shown after the hit lands.

import { parseHp, type SideId } from './log';

export type Beat =
  | { kind: 'text'; text: string }
  | { kind: 'sendout'; side: SideId; species: string; level: number; hp: number; maxhp: number; status: string }
  | { kind: 'withdraw'; side: SideId }
  | { kind: 'attack'; side: SideId; category: 'Physical' | 'Special' | 'Status' }
  | { kind: 'hit'; side: SideId }
  | { kind: 'hp'; side: SideId; hp: number; maxhp: number }
  | { kind: 'status'; side: SideId; status: string }
  | { kind: 'faint'; side: SideId };

export interface ClassicContext {
  gen: number;
  /** The player's name, e.g. "RED". */
  player: string;
  /** The opposing trainer as named in text, e.g. "LORELEI". */
  opponent: string;
  /** Looks up a move's category (Gen 1: by type) for the attack animation. */
  moveCategory(name: string): 'Physical' | 'Special' | 'Status';
  /** Pokémon already out when these lines start, so a switch can say "come back!". */
  active?: Partial<Record<SideId, string>>;
}

const STAT: Record<string, string> = { atk: 'ATTACK', def: 'DEFENSE', spa: 'SPECIAL', spd: 'SPECIAL', spe: 'SPEED', accuracy: 'ACCURACY', evasion: 'EVADE' };

const STATUS: Record<string, string> = {
  slp: 'fell asleep!', par: '’s paralyzed! It may not attack!', brn: 'was burned!',
  psn: 'was poisoned!', tox: '’s badly poisoned!', frz: 'was frozen solid!',
};
const CANT: Record<string, string> = {
  slp: 'is fast asleep!', par: '’s fully paralyzed!', frz: 'is frozen solid!',
  recharge: 'must recharge!', flinch: 'flinched!', partiallytrapped: 'can’t move!',
};
const CURE: Record<string, string> = { slp: 'woke up!', frz: 'thawed out!', par: '’s cured of paralysis!', brn: '’s burn was healed!', psn: '’s cured of poison!', tox: '’s cured of poison!' };
const RESIDUAL: Record<string, string> = {
  psn: '’s hurt by poison!', tox: '’s hurt by poison!', brn: '’s hurt by the burn!',
  Recoil: '’s hit with recoil!', confusion: 'hurt itself in its confusion!',
};
const PREPARE: Record<string, string> = {
  'Solar Beam': 'took in sunlight!', Dig: 'dug a hole!', Fly: 'flew up high!', 'Skull Bash': 'lowered its head!',
  'Razor Wind': 'made a whirlwind!', 'Sky Attack': 'is glowing!',
};
const START: Record<string, string> = {
  confusion: 'became confused!', Substitute: 'created a SUBSTITUTE!', 'Leech Seed': 'was seeded!',
  Reflect: 'gained armor!', 'Light Screen': '’s protected against special attacks!', Mist: '’s shrouded in mist!',
  'Focus Energy': '’s getting pumped!', Bide: 'is storing energy!', Disable: '’s move was disabled!',
};
const END: Record<string, string> = { confusion: '’s confused no more!', Substitute: '’s SUBSTITUTE broke!', Disable: '’s disabled no more!', Bide: 'unleashed energy!' };

function sideOf(ident: string): SideId {
  return ident.startsWith('p1') ? 'p1' : 'p2';
}

function upper(name: string): string {
  return name.toUpperCase().replace(/É/g, 'é');
}

/** "PIKACHU" or "Enemy DEWGONG". */
function who(ident: string): string {
  const name = upper(ident.slice(ident.indexOf(':') + 1).trim());
  return sideOf(ident) === 'p1' ? name : `Enemy ${name}`;
}

/** Joins a name and a phrase, which may start with an apostrophe ("PIKACHU's ..."). */
function say(ident: string, phrase: string): string {
  return phrase.startsWith('’') ? `${who(ident)}${phrase}` : `${who(ident)} ${phrase}`;
}

function tag(args: string[], key: string): string | undefined {
  const found = args.find((a) => a.startsWith(`[${key}]`));
  if (!found) return undefined;
  const value = found.slice(key.length + 2).trim();
  return value.includes(':') ? value.slice(value.indexOf(':') + 1).trim() : value;
}

export function classicBeats(lines: readonly string[], ctx: ClassicContext): Beat[] {
  const beats: Beat[] = [];
  const text = (t: string) => beats.push({ kind: 'text', text: t });
  // Crit/effectiveness come before the damage line in the protocol; the
  // games show them after the HP bar drains.
  let pendingAfterHit: string[] = [];
  const flushAfterHit = () => {
    for (const t of pendingAfterHit) text(t);
    pendingAfterHit = [];
  };
  let skipNext = false;
  let takeNext = false;
  const active: Partial<Record<SideId, string | null>> = { ...ctx.active };

  for (const line of lines) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (line.startsWith('|split|')) {
      takeNext = true;
      continue;
    }
    if (takeNext) {
      takeNext = false;
      skipNext = true;
    }
    const [, type, ...args] = line.split('|');
    if (type !== '-damage' && type !== '-crit' && type !== '-supereffective' && type !== '-resisted') flushAfterHit();

    switch (type) {
      case 'switch':
      case 'drag': {
        const side = sideOf(args[0]);
        const [species, levelPart] = args[1].split(', ');
        const { hp, maxhp, status } = parseHp(args[2]);
        const name = upper(args[0].slice(args[0].indexOf(':') + 1).trim());
        const previous = active[side];
        if (previous) {
          text(side === 'p1' ? `${upper(previous)}, come back!` : `${ctx.opponent} withdrew ${upper(previous)}!`);
          beats.push({ kind: 'withdraw', side });
        }
        active[side] = name;
        text(side === 'p1' ? `Go! ${name}!` : `${ctx.opponent} sent out ${name}!`);
        beats.push({ kind: 'sendout', side, species, level: Number(levelPart?.slice(1) ?? 100), hp, maxhp, status });
        break;
      }
      case 'move': {
        const side = sideOf(args[0]);
        text(`${who(args[0])} used ${upper(args[1])}!`);
        if (!args.includes('[still]')) beats.push({ kind: 'attack', side, category: ctx.moveCategory(args[1]) });
        break;
      }
      case '-damage':
      case '-heal':
      case '-sethp': {
        const side = sideOf(args[0]);
        const { hp, maxhp } = parseHp(args[1]);
        const from = tag(args, 'from');
        if (type === '-damage' && !from) beats.push({ kind: 'hit', side });
        beats.push({ kind: 'hp', side, hp, maxhp });
        if (type === '-damage') {
          flushAfterHit();
          if (from === 'Leech Seed') text(`LEECH SEED saps ${who(args[0])}!`);
          else if (from && RESIDUAL[from]) text(say(args[0], RESIDUAL[from]));
        } else if (type === '-heal' && from === 'drain') {
          const of = args.find((a) => a.startsWith('[of]'))?.slice(4).trim();
          if (of) text(`Sucked health from ${who(of)}!`);
        } else if (type === '-heal' && from && !line.includes('[from] item:')) {
          text(say(args[0], 'regained health!'));
        }
        break;
      }
      case '-crit':
        pendingAfterHit.push('Critical hit!');
        break;
      case '-supereffective':
        pendingAfterHit.push('It’s super effective!');
        break;
      case '-resisted':
        pendingAfterHit.push('It’s not very effective…');
        break;
      case '-immune':
        text(`It doesn’t affect ${who(args[0])}!`);
        break;
      case '-miss':
        text(say(args[0], '’s attack missed!'));
        break;
      case '-fail':
        text('But, it failed!');
        break;
      case '-ohko':
        text('One-hit KO!');
        break;
      case '-hitcount':
        // The protocol names the target: "Hit the enemy 3 times!" when the player is attacking.
        text(`Hit ${sideOf(args[0]) === 'p2' ? 'the enemy ' : ''}${args[1]} times!`);
        break;
      case '-status': {
        const side = sideOf(args[0]);
        beats.push({ kind: 'status', side, status: args[1] });
        if (tag(args, 'from') === 'Rest') text(say(args[0], 'started sleeping!'));
        else text(say(args[0], STATUS[args[1]] ?? 'got a status problem!'));
        break;
      }
      case '-curestatus':
        beats.push({ kind: 'status', side: sideOf(args[0]), status: '' });
        if (CURE[args[1]]) text(say(args[0], CURE[args[1]]));
        break;
      case 'cant':
        text(say(args[0], CANT[args[1]] ?? 'can’t move!'));
        break;
      case 'faint':
        active[sideOf(args[0])] = null;
        beats.push({ kind: 'faint', side: sideOf(args[0]) });
        text(`${who(args[0])} fainted!`);
        break;
      case '-boost':
      case '-unboost': {
        if (ctx.gen === 1 && args[1] === 'spd') break; // one Special stat in Gen 1
        const amount = Number(args[2]);
        const stat = STAT[args[1]] ?? upper(args[1]);
        if (amount === 0) text('Nothing happened!');
        else text(`${who(args[0])}’s ${stat}${amount >= 2 ? ' greatly' : ''} ${type === '-boost' ? 'rose' : 'fell'}!`);
        break;
      }
      case '-start': {
        const effect = args[1].replace(/^move: /, '');
        if (START[effect]) text(say(args[0], START[effect]));
        break;
      }
      case '-end': {
        const effect = args[1].replace(/^move: /, '');
        if (END[effect] && !args.includes('[silent]')) text(say(args[0], END[effect]));
        break;
      }
      case '-activate':
        if (args[1] === 'confusion') text(say(args[0], 'is confused!'));
        break;
      case '-prepare':
        text(say(args[0], PREPARE[args[1]] ?? `is preparing ${upper(args[1])}!`));
        break;
      case '-transform':
        text(`${who(args[0])} transformed into ${upper(args[1].slice(args[1].indexOf(':') + 1).trim())}!`);
        break;
      case 'message': {
        // Items from the engine: "<name> used <Item> on <Pokémon>!"
        const used = /^(.+) used (.+) on (.+)!$/.exec(args.join('|'));
        if (used) text(`${upper(used[1])} used ${upper(used[2])}!`);
        else text(args.join('|'));
        break;
      }
    }
  }
  flushAfterHit();
  return beats;
}
