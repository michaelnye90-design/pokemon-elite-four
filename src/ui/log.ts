// Turns the simulator's battle protocol into readable battle-log text and the
// display updates (HP, status, switches) the battle screen animates.

export type SideId = 'p1' | 'p2';

export type DisplayUpdate =
  | { kind: 'switch'; side: SideId; species: string; level: number; hp: number; maxhp: number; status: string }
  | { kind: 'hp'; side: SideId; hp: number; maxhp: number; status: string }
  | { kind: 'status'; side: SideId; status: string }
  | { kind: 'faint'; side: SideId };

export interface LogEvent {
  text?: string;
  update?: DisplayUpdate;
  /** A new turn starts. */
  turn?: number;
  /** Emphasis for the log: big moments (super effective, faint) are highlighted. */
  tone?: 'move' | 'good' | 'bad' | 'info';
}

export interface LogContext {
  /** Generation, for Gen 1's single Special stat. */
  gen: number;
  /** Shown when the opponent sends out a Pokémon, e.g. "Elite Four Lorelei". */
  opponentName: string;
}

const STAT_NAMES: Record<string, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness',
};

const STATUS_TEXT: Record<string, string> = {
  slp: 'fell asleep!', par: 'is paralyzed! It may be unable to move!', brn: 'was burned!',
  psn: 'was poisoned!', tox: 'was badly poisoned!', frz: 'was frozen solid!',
};

const CURE_TEXT: Record<string, string> = {
  slp: 'woke up!', par: 'was cured of paralysis.', brn: 'was cured of its burn.',
  psn: 'was cured of its poisoning.', tox: 'was cured of its poisoning.', frz: 'thawed out!',
};

const CANT_TEXT: Record<string, string> = {
  slp: 'is fast asleep.', par: 'is paralyzed! It can’t move!', frz: 'is frozen solid!',
  recharge: 'must recharge!', flinch: 'flinched and couldn’t move!',
};

const RESIDUAL_TEXT: Record<string, string> = {
  psn: 'was hurt by poison!', tox: 'was hurt by poison!', brn: 'was hurt by its burn!',
  Recoil: 'was damaged by the recoil!', confusion: 'hurt itself in its confusion!',
  'Leech Seed': 'had its health sapped by Leech Seed!',
};

const START_TEXT: Record<string, string> = {
  confusion: 'became confused!', Substitute: 'put in a substitute!', 'Leech Seed': 'was seeded!',
  Reflect: 'gained armor against physical moves!', 'Light Screen': 'gained armor against special moves!',
  Mist: 'is shrouded in mist!', 'Focus Energy': 'is getting pumped!', Bide: 'is storing energy!',
  Disable: 'had a move disabled!',
};

const END_TEXT: Record<string, string> = {
  confusion: 'snapped out of its confusion!', Substitute: '’s substitute faded!', Disable: 'can use its move again.',
  Bide: 'unleashed its energy!',
};

/** Parses an HP string like "141/141", "40/141 par" or "0 fnt". */
export function parseHp(text: string): { hp: number; maxhp: number; status: string } {
  const [fraction, status = ''] = text.split(' ');
  if (fraction === '0') return { hp: 0, maxhp: 0, status: 'fnt' };
  const [hp, maxhp] = fraction.split('/').map(Number);
  return { hp, maxhp, status };
}

function sideOf(ident: string): SideId {
  return ident.startsWith('p1') ? 'p1' : 'p2';
}

function nameOf(ident: string): string {
  return ident.slice(ident.indexOf(':') + 1).trim();
}

function who(ident: string): string {
  return sideOf(ident) === 'p1' ? nameOf(ident) : `The opposing ${nameOf(ident)}`;
}

/** Strips "[from] item: X" style tags to their value, e.g. "item: Potion" -> "Potion". */
function tag(args: string[], key: string): string | undefined {
  const found = args.find((a) => a.startsWith(`[${key}]`));
  if (!found) return undefined;
  const value = found.slice(key.length + 2).trim();
  return value.includes(':') ? value.slice(value.indexOf(':') + 1).trim() : value;
}

/**
 * Formats protocol lines into log events. Lines after `|split|pN` come in a
 * private/public pair; only the private one (exact HP) is used.
 */
export function formatLog(lines: readonly string[], ctx: LogContext): LogEvent[] {
  const events: LogEvent[] = [];
  let skipNext = false;
  let takeNext = false;
  const lastHp: Partial<Record<SideId, { hp: number; maxhp: number }>> = {};

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
    const say = (text: string, tone?: LogEvent['tone']) => events.push({ text, tone });

    switch (type) {
      case 'turn':
        events.push({ turn: Number(args[0]) });
        break;
      case 'switch':
      case 'drag': {
        const side = sideOf(args[0]);
        const [species, levelPart] = args[1].split(', ');
        const { hp, maxhp, status } = parseHp(args[2]);
        lastHp[side] = { hp, maxhp };
        events.push({
          text: side === 'p1' ? `Go! ${nameOf(args[0])}!` : `${ctx.opponentName} sent out ${nameOf(args[0])}!`,
          update: { kind: 'switch', side, species, level: Number(levelPart?.slice(1) ?? 100), hp, maxhp, status },
        });
        break;
      }
      case 'move':
        say(`${who(args[0])} used ${args[1]}!`, 'move');
        break;
      case '-damage':
      case '-heal':
      case '-sethp': {
        const side = sideOf(args[0]);
        const next = parseHp(args[1]);
        const previous = lastHp[side];
        lastHp[side] = next.status === 'fnt' ? { hp: 0, maxhp: previous?.maxhp ?? 0 } : next;
        const maxhp = next.maxhp || previous?.maxhp || 1;
        events.push({ update: { kind: 'hp', side, hp: next.hp, maxhp, status: next.status } });
        const from = tag(args, 'from');
        if (type === '-damage') {
          if (from && RESIDUAL_TEXT[from]) say(`${who(args[0])} ${RESIDUAL_TEXT[from]}`);
          else if (from) say(`${who(args[0])} was hurt by ${from}!`);
          else if (previous && previous.maxhp) {
            const lost = Math.round(((previous.hp - next.hp) / previous.maxhp) * 100);
            if (lost > 0) say(`(${who(args[0])} lost ${lost}% of its health!)`, 'info');
          }
        } else if (type === '-heal' && from !== undefined && !line.includes('[from] item:')) {
          say(from === 'drain' ? `${who(args[0])} had its energy drained!` : `${who(args[0])} regained health!`);
        }
        break;
      }
      case '-supereffective':
        say('It’s super effective!', 'good');
        break;
      case '-resisted':
        say('It’s not very effective…');
        break;
      case '-immune':
        say(`It doesn’t affect ${who(args[0]).replace('The opposing', 'the opposing')}…`);
        break;
      case '-crit':
        say('A critical hit!', 'good');
        break;
      case '-miss':
        say(`${who(args[0])}’s attack missed!`);
        break;
      case '-fail':
        say('But it failed!');
        break;
      case '-ohko':
        say('It’s a one-hit KO!', 'good');
        break;
      case '-hitcount':
        say(`Hit ${args[1]} time${args[1] === '1' ? '' : 's'}!`);
        break;
      case '-status':
        events.push({ text: `${who(args[0])} ${STATUS_TEXT[args[1]] ?? `got ${args[1]}!`}`, update: { kind: 'status', side: sideOf(args[0]), status: args[1] } });
        break;
      case '-curestatus':
        events.push({
          text: `${who(args[0])} ${CURE_TEXT[args[1]] ?? 'was cured.'}`,
          update: { kind: 'status', side: sideOf(args[0]), status: '' },
        });
        break;
      case 'cant':
        say(`${who(args[0])} ${CANT_TEXT[args[1]] ?? 'can’t move!'}`);
        break;
      case 'faint':
        events.push({ text: `${who(args[0])} fainted!`, update: { kind: 'faint', side: sideOf(args[0]) }, tone: 'bad' });
        break;
      case '-boost':
      case '-unboost': {
        // Gen 1 has one Special stat; Showdown reports it as both Sp. Atk and Sp. Def.
        if (ctx.gen === 1 && args[1] === 'spd') break;
        const stat = ctx.gen === 1 && args[1] === 'spa' ? 'Special' : (STAT_NAMES[args[1]] ?? args[1]);
        const amount = Number(args[2]);
        const how = amount >= 2 ? (type === '-boost' ? 'rose sharply' : 'harshly fell') : type === '-boost' ? 'rose' : 'fell';
        say(amount === 0 ? `${who(args[0])}’s ${stat} won’t go any ${type === '-boost' ? 'higher' : 'lower'}!` : `${who(args[0])}’s ${stat} ${how}!`);
        break;
      }
      case '-start': {
        const effect = args[1].replace(/^move: /, '');
        if (START_TEXT[effect]) say(`${who(args[0])} ${START_TEXT[effect]}`);
        break;
      }
      case '-end': {
        const effect = args[1].replace(/^move: /, '');
        const text = END_TEXT[effect];
        if (text) say(text.startsWith('’') ? `${who(args[0])}${text}` : `${who(args[0])} ${text}`);
        break;
      }
      case '-activate':
        if (args[1] === 'confusion') say(`${who(args[0])} is confused!`);
        break;
      case '-prepare':
        say(`${who(args[0])} is preparing ${args[1]}!`);
        break;
      case 'message':
        say(args.join('|'));
        break;
      case 'win':
        say(`${args[0]} won the battle!`, args[0] === 'You' ? 'good' : 'bad');
        break;
    }
  }
  return events;
}
