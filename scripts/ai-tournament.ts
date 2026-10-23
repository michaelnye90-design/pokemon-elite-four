// Runs the AI tiers against each other and reports how often the higher tier wins.
//
//   npm run ai:tournament -- [pairs per matchup, default 25] [seed] [only, e.g. expert:hard]
//
// Each pair is two games with the teams swapped.

import { runMatchup, standardMatchups } from '../src/ai/tournament';
import { gen1 } from '../src/rules/gen1';

const pairs = Number(process.argv[2] ?? 25);
const seed = process.argv[3] ?? 'tournament';
const only = process.argv[4];
const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(4);

console.log(`Gen ${gen1.gen} AI tournament: ${pairs * 2} games per matchup, seed "${seed}"\n`);
let allPass = true;
for (const [higher, lower] of standardMatchups()) {
  if (only && only !== `${higher}:${lower}`) continue;
  const started = performance.now();
  const r = runMatchup(gen1, higher, lower, pairs, seed);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const verdict = r.low > 0.5 ? 'higher tier clearly better' : r.winRate > 0.5 ? 'higher tier ahead (not yet significant)' : 'HIGHER TIER NOT BETTER';
  if (r.winRate <= 0.5) allPass = false;
  console.log(
    `${higher.padEnd(9)} vs ${lower.padEnd(9)} ${pct(r.winRate)} (95% CI ${pct(r.low)}-${pct(r.high)}), ` +
      `${r.higherWins}/${r.games} wins, ${r.draws} draws, ${seconds}s  ${verdict}`,
  );
}
process.exit(allPass ? 0 : 1);
