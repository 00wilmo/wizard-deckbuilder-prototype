# Wizard Deckbuilder Prototype

PC-oriented browser combat prototype for a spellbook deckbuilding roguelike.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The generated static site is written to `docs/` and is suitable for GitHub Pages.

## Playtest scope

- Two encounters: Wolf Pack and Goblin Patrol
- Ten-card starter spellbook with no duplicate spells
- Arcane Dart bound cantrip and Runic Bulwark once-per-battle ultimate
- Mana, AP, Ward, Block, Armor break, Burning, Retain, Blind, and hidden intentions
- Generalist's Focus starter relic

Click a spell and then an enemy when a target is required. Press `E` to end the
turn or `B` to open the spellbook. Exact enemy numbers are intentionally hidden.
