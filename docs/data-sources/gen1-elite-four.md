# Gen 1 (Yellow) Elite Four and Champion: sources and disagreements

Data file: [`data/gen1/elite4.json`](../../data/gen1/elite4.json). Collected 2026-10-23.

## Sources

| | Source | What it gave |
|---|---|---|
| A | Bulbapedia: [Lorelei](https://bulbapedia.bulbagarden.net/wiki/Lorelei), [Bruno](https://bulbapedia.bulbagarden.net/wiki/Bruno), [Agatha](https://bulbapedia.bulbagarden.net/wiki/Agatha), [Lance](https://bulbapedia.bulbagarden.net/wiki/Lance), [Blue](https://bulbapedia.bulbagarden.net/wiki/Blue_(game)) — the *Yellow* sections | Species, levels, order, moves, item use. Trainer DVs 9/8/8/8 and no stat experience ([Individual values](https://bulbapedia.bulbagarden.net/wiki/Individual_values), [Mew glitch](https://bulbapedia.bulbagarden.net/wiki/Mew_glitch)) |
| B | Serebii: [Yellow Elite Four](https://www.serebii.net/yellow/elitefour.shtml) and [Pokéarth Indigo Plateau (Gen I)](https://www.serebii.net/pokearth/kanto/1st/indigoplateau.shtml) | Species, levels, order, moves. **No item data** (the Items boxes are empty) |
| C | [pret/pokeyellow](https://github.com/pret/pokeyellow) disassembly of the game: `data/trainers/parties.asm`, `data/trainers/special_moves.asm`, `data/pokemon/evos_moves.asm`, `data/pokemon/base_stats/*.asm`, `data/trainers/ai_pointers.asm`, `engine/battle/trainer_ai.asm` | The game's own data. Used as the tie-breaker |

Source C stores only each trainer's *custom* moves; the rest is the Pokémon's default moveset (its four most recent level-up moves). I rebuilt every moveset that way. It reproduced Bulbapedia's movesets **exactly for all 28 Pokémon**, which also confirms the method.

## Disagreements

All are between Serebii and the other two sources. In every case Bulbapedia and the game data agree, so the data file follows them. **These are flagged for you to confirm or overrule.**

| # | Trainer / Pokémon | Bulbapedia (A) | Serebii (B) | Game data (C) | Used |
|---|---|---|---|---|---|
| 1 | Bruno — Onix (L53), move 1 | Rock Slide | Rock Throw | ROCK_SLIDE (custom move) | Rock Slide |
| 2 | Agatha — Arbok level | 58 | 58 on the Elite Four page, **55** on Pokéarth | 58 | 58 |
| 3 | Champion (Jolteon team) — Jolteon | Thunder, Thunder Wave, Quick Attack, Pin Missile | Thunder, **Thunderbolt**, Quick Attack, Pin Missile | Thunder Wave (Jolteon can't learn Thunderbolt by level-up) | Bulbapedia |
| 4 | Champion (Flareon team) — Flareon | Flamethrower, Fire Spin, Quick Attack, Reflect | Flamethrower, Quick Attack, **Smog**, Fire Spin | Reflect (custom move replaces Smog) | Bulbapedia |
| 5 | Champion, all three teams — order and levels of slots 4–5 | e.g. Ninetales 61, Magneton 63 | Elite Four page swaps the order and levels (e.g. Magneton 63, Ninetales 61); Pokéarth page agrees with Bulbapedia | same as Bulbapedia | Bulbapedia |

Not a disagreement, but worth knowing:
- **Item rules have one written source plus the game code.** Serebii lists no items, so the items come from Bulbapedia, checked line by line against the game's AI code (source C). They match, including the odds.
- **Move order within a moveset** follows the game data (the order the moves sit in the Pokémon's move list). Bulbapedia sometimes lists the same four moves in another order.
- **Agatha's AI** shares one roll between switching (20/256) and her Super Potion check, and both draw on the same 2 uses per Pokémon. Bulbapedia only mentions the potions under "two per Pokémon".
- **Hyper Beam recharge:** the game's comment notes the AI's locked-move check misses Hyper Beam recharge (`trainer_ai.asm`). That's an original-game bug the AI tiers can choose not to copy.

## Trainer item AI (Yellow)

The AI rolls a random number 0–255 each turn. Each trainer may act at most N times **per Pokémon** (the count resets when a new Pokémon is sent out).

| Trainer | Uses per Pokémon | Rule |
|---|---|---|
| Lorelei | 2 | roll < 128 (50%) and HP < 1/5 → Super Potion |
| Bruno | 2 | roll < 64 (25%) → X Defend |
| Agatha | 2 | roll < 20 (7.8%) → switch; otherwise roll < 128 and HP < 1/4 → Super Potion |
| Lance | 1 | roll < 128 (50%) and HP < 1/5 → Hyper Potion |
| Champion (Blue) | 1 | roll < 32 (12.5%) and HP < 1/5 → Full Restore |
