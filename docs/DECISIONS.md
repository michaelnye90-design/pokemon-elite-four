# Decisions

Choices made with Michael while planning, so they don't get lost between steps.

## Game data
- **Gen 1 version: Yellow.** Elite Four and rival teams come from Yellow, cross-checked between Bulbapedia and Serebii; disagreements are flagged, not guessed.
- **Rival Champion:** Yellow has three rival teams (Eevee evolves into Jolteon, Flareon or Vaporeon). One is picked at random per run, from the run seed.
- **Random team movesets:** level-up and TM/HM moves only; no event-only moves or Yellow's Surfing Pikachu. Prefer strong same-type moves (an Electric type should get Thunderbolt, not filler).

## Difficulty
- **Team strength:** on Normal, the player's strongest Pokémon is on par (level and base stat total) with the rival Champion's strongest. Other tiers step up or down from there.
- **Items:** the player gets fewer healing items as difficulty rises; the opponent gets more. Normal uses the opponents' real in-game items.
- All tuning values live in one config file.

## Mechanics
- **Engine:** `@pkmn/sim` (Pokémon Showdown) Gen 1, extended with bag items and HP/PP/status carry-over between fights.
- **Gen 1 quirks are fixed**, each behind its own switch in the Gen 1 ruleset (e.g. Ghost moves hit Psychic types, curing paralysis restores Speed).

## Interface
- **Style: like Pokémon Showdown** — sprites on a battlefield, HP bars, type-coloured move buttons with PP, party icons, Switch/Item buttons, scrolling battle log.
- **Sprites are loaded at runtime from Pokémon Showdown's sprite server via `@pkmn/img`** (Gen 1 sprites). This is the one runtime network dependency; Pokémon data itself is never fetched at runtime. Nintendo artwork is not stored in this repo.

## Hosting
- **GitHub Pages** (Cloudflare Pages direct upload as a fallback if GitHub signup stays blocked).
