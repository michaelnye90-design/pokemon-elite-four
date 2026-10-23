# Gen 1 (Yellow) items: sources and disagreements

Data file: [`data/gen1/items.json`](../../data/gen1/items.json). Collected 2026-10-23.

## Sources

| | Source | What it gave |
|---|---|---|
| A | Bulbapedia: item pages ([Potion](https://bulbapedia.bulbagarden.net/wiki/Potion), [Hyper Potion](https://bulbapedia.bulbagarden.net/wiki/Hyper_Potion), [Max Revive](https://bulbapedia.bulbagarden.net/wiki/Max_Revive), …) and [Celadon Department Store](https://bulbapedia.bulbagarden.net/wiki/Celadon_Department_Store) (Gen I) | Prices, effects |
| B | Serebii: Gen I Poké Mart lists on Pokéarth ([Viridian](https://www.serebii.net/pokearth/kanto/1st/viridiancity.shtml), [Celadon](https://www.serebii.net/pokearth/kanto/1st/celadoncity.shtml), [Saffron](https://www.serebii.net/pokearth/kanto/1st/saffroncity.shtml), [Indigo Plateau](https://www.serebii.net/pokearth/kanto/1st/indigoplateau.shtml)) | Prices |
| C | [pret/pokeyellow](https://github.com/pret/pokeyellow): `data/items/prices.asm`, `engine/items/item_effects.asm` | The game's own prices and heal amounts. Tie-breaker |

Shop cost in points = in-game price / 100 (set in `src/config/difficulty.ts`).

## Disagreements

| # | Item | Bulbapedia (A) | Serebii (B) | Game data (C) | Used |
|---|---|---|---|---|---|
| 1 | Hyper Potion price | 1,500 in RBY (1,200 from Gen II on) | 1,200 (Saffron Mart) | 1500 | 1,500 |
| 2 | Full Heal / Full Restore curing confusion | Item pages say they cure confusion (true of later games) | — | Gen 1 code clears major status only; confusion is untouched | Don't cure confusion |

## Notes

- **Heal amounts** (game code): Potion 20, Super Potion 50, Hyper Potion 200; Max Potion and Full Restore heal fully.
- **Max Revive isn't sold in Gen 1.** Its price comes from the game's price table (4,000; Bulbapedia lists it as not buyable). It's in the shop, marked `notSoldInGame`.
- **Curing a status in Gen 1** copies the Pokémon's party stats back to its battle stats, so the paralysis Speed drop / burn Attack drop go away straight away (engine matches this, keeping stat stages).
- **Gen 1 has no held items.**
- **Left out for now** (the engine doesn't model them yet): X Accuracy (Gen 1: moves never miss), Dire Hit (Gen 1: bugged, *lowers* crit rate), Guard Spec. (Mist), and PP items (Ether, Elixir — not sold, price 0 in the game).
