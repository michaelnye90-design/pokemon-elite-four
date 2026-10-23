// Exports one generation's species, moves, learnsets and type chart from
// @pkmn/data into data/gen<N>/*.json. Run once per generation and commit the
// output; the site never fetches Pokémon data at runtime.
//
//   npm run data:export -- 1

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Dex } from '@pkmn/dex';
import { Generations, type GenerationNum, type TypeName } from '@pkmn/data';

const LEARN_METHODS: Record<string, string> = {
  L: 'level',
  M: 'tm', // TMs and HMs
  T: 'tutor', // Gen 1: only Yellow's Surfing Pikachu
  S: 'event',
  E: 'egg',
  V: 'transfer',
  D: 'dreamworld',
};

const MOVE_FIELDS = [
  'basePower', 'accuracy', 'pp', 'priority', 'target', 'damage', 'critRatio',
  'multihit', 'drain', 'recoil', 'heal', 'ohko', 'selfdestruct', 'status',
  'boosts', 'self', 'secondary', 'volatileStatus',
] as const;

const genNum = Number(process.argv[2]);
if (![1, 2, 3].includes(genNum)) {
  console.error('Usage: npm run data:export -- <1|2|3>');
  process.exit(1);
}

const gen = new Generations(Dex).get(genNum as GenerationNum);
const outDir = join(import.meta.dirname, '..', 'data', `gen${genNum}`);
mkdirSync(outDir, { recursive: true });

function write(name: string, value: unknown) {
  writeFileSync(join(outDir, name), JSON.stringify(value, null, 2) + '\n');
}

// Species. Gen 1 has a single Special stat; @pkmn/data reports it as both
// spa and spd, so it is collapsed back to `spc` here.
const species = [...gen.species]
  .sort((a, b) => a.num - b.num)
  .map((s) => {
    const { hp, atk, def, spa, spd, spe } = s.baseStats;
    const baseStats = genNum === 1 ? { hp, atk, def, spc: spa, spe } : { hp, atk, def, spa, spd, spe };
    return {
      num: s.num,
      id: s.id,
      name: s.name,
      types: s.types,
      baseStats,
      bst: Object.values(baseStats).reduce((sum, n) => sum + n, 0),
      prevo: s.prevo ? gen.species.get(s.prevo)!.id : null,
      evos: (s.evos ?? []).map((e) => gen.species.get(e)?.id).filter(Boolean),
      // How this species evolves from its prevo: level-up (with level), trade, or item.
      evolution: s.prevo
        ? { method: s.evoType ?? 'level', ...(s.evoLevel ? { level: s.evoLevel } : {}), ...(s.evoItem ? { item: s.evoItem } : {}) }
        : null,
      tags: s.tags,
    };
  });

// Moves. Gen 1-3 physical/special split is by type, which @pkmn/data already
// applies to `category`.
const moves = [...gen.moves]
  .sort((a, b) => a.num - b.num)
  .map((m) => {
    const move: Record<string, unknown> = { num: m.num, id: m.id, name: m.name, type: m.type, category: m.category };
    for (const field of MOVE_FIELDS) {
      const value = (m as unknown as Record<string, unknown>)[field];
      if (value !== undefined && value !== null && value !== false) move[field] = value;
    }
    return move;
  });

// Learnsets: only this generation's entries. Source codes look like "1L23"
// (gen 1, level-up at 23), "1M" (TM/HM), "1S0" (event #0).
const learnsets: Record<string, { move: string; method: string; level?: number }[]> = {};
for (const s of species) {
  const data = await gen.learnsets.get(s.id);
  const entries: { move: string; method: string; level?: number }[] = [];
  for (const [move, sources] of Object.entries(data?.learnset ?? {})) {
    for (const source of sources) {
      if (Number(source[0]) !== genNum) continue;
      const method = LEARN_METHODS[source[1]];
      if (!method) throw new Error(`Unknown learn method "${source}" for ${s.id}/${move}`);
      const entry: { move: string; method: string; level?: number } = { move, method };
      if (method === 'level') entry.level = Number(source.slice(2));
      if (!entries.some((e) => e.move === move && e.method === method && e.level === entry.level)) entries.push(entry);
    }
  }
  entries.sort((a, b) => a.move.localeCompare(b.move) || a.method.localeCompare(b.method) || (a.level ?? 0) - (b.level ?? 0));
  learnsets[s.id] = entries;
}

// Type chart, attacker -> defender -> multiplier, limited to this gen's types.
const typeNames = [...gen.types].map((t) => t.name).sort();
const chart: Record<string, Record<string, number>> = {};
for (const attacker of typeNames) {
  chart[attacker] = {};
  for (const defender of typeNames) {
    chart[attacker][defender] = gen.types.get(attacker)!.effectiveness[defender as TypeName];
  }
}

const pkg = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'node_modules', name, 'package.json'), 'utf8')).version;

write('species.json', species);
write('moves.json', moves);
write('learnsets.json', learnsets);
write('types.json', { types: typeNames, chart });
write('meta.json', {
  gen: genNum,
  source: 'Exported from @pkmn/data and @pkmn/dex (Pokémon Showdown data)',
  versions: { '@pkmn/data': pkg('@pkmn/data'), '@pkmn/dex': pkg('@pkmn/dex') },
  counts: { species: species.length, moves: moves.length, types: typeNames.length },
});

console.log(`gen${genNum}: ${species.length} species, ${moves.length} moves, ${typeNames.length} types -> ${outDir}`);
