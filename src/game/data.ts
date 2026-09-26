import type { CardDefinition, EncounterDefinition, EnemyDefinition } from './types';

export const cards: Record<string, CardDefinition> = {
  'arcane-missile': {
    id: 'arcane-missile', name: 'Arcane Missile', school: 'Arcane', ap: 1, mana: 1,
    target: 'enemy', rules: 'Deal 5 damage.', art: '✦',
  },
  'mana-weave': {
    id: 'mana-weave', name: 'Mana Weave', school: 'Arcane', ap: 1, mana: 0,
    target: 'self', rules: 'Gain 3 Mana.', art: '∞',
  },
  'quick-study': {
    id: 'quick-study', name: 'Quick Study', school: 'Arcane', ap: 1, mana: 0,
    target: 'self', rules: 'Draw 2 spells, then discard 1.', art: '⌁',
  },
  recollection: {
    id: 'recollection', name: 'Recollection', school: 'Arcane', ap: 1, mana: 2,
    target: 'discard', rules: 'Return a spell from your discard pile to your hand.', art: '↶',
  },
  kindle: {
    id: 'kindle', name: 'Kindle', school: 'Evocation', ap: 1, mana: 2,
    target: 'enemy', rules: 'Apply 3 Burning.', art: '♨',
  },
  'cinder-lance': {
    id: 'cinder-lance', name: 'Cinder Lance', school: 'Evocation', ap: 1, mana: 2,
    target: 'enemy', rules: 'Deal 8 damage. If the target is Burning, deal 4 more.', art: '➶',
  },
  'forked-lightning': {
    id: 'forked-lightning', name: 'Forked Lightning', school: 'Evocation', ap: 2, mana: 4,
    target: 'all-enemies', rules: 'Deal 5 damage to all enemies.', art: 'ϟ',
  },
  'lesser-ward': {
    id: 'lesser-ward', name: 'Lesser Ward', school: 'Warding', ap: 1, mana: 1,
    target: 'self', rules: 'Gain 6 Ward.', art: '◇',
  },
  'reactive-barrier': {
    id: 'reactive-barrier', name: 'Reactive Barrier', school: 'Warding', ap: 1, mana: 2,
    target: 'self', rules: 'Gain 4 Ward. The first time you are attacked this turn, gain 4 more.', art: '◈',
  },
  'aegis-script': {
    id: 'aegis-script', name: 'Aegis Script', school: 'Warding', ap: 2, mana: 3,
    target: 'self', rules: 'Gain 12 Ward. Retain.', retain: true, art: '⬡',
  },
  'arcane-dart': {
    id: 'arcane-dart', name: 'Arcane Dart', school: 'Arcane', ap: 1, mana: 0,
    target: 'enemy', rules: 'Deal 3 damage. Bound Cantrip.', art: '◆',
  },
  'runic-bulwark': {
    id: 'runic-bulwark', name: 'Runic Bulwark', school: 'Warding', ap: 2, mana: 4,
    target: 'self', rules: 'Once per battle. Gain 16 Ward. Ward persists for the next 3 turns.', art: '⬢',
  },
};

export const startingDeck = [
  'arcane-missile', 'mana-weave', 'quick-study', 'recollection',
  'kindle', 'cinder-lance', 'forked-lightning',
  'lesser-ward', 'reactive-barrier', 'aegis-script',
];

export const enemies: Record<string, EnemyDefinition> = {
  'grey-wolf': {
    id: 'grey-wolf', name: 'Grey Wolf', subtitle: 'Pack Hunter', maxHp: 24, color: '#8795a7', packHunter: true,
    pattern: [{ kind: 'attack', label: 'Attack', amount: 5 }],
  },
  'prowling-wolf': {
    id: 'prowling-wolf', name: 'Prowling Wolf', subtitle: 'Patient predator', maxHp: 28, color: '#a98672', packHunter: true,
    pattern: [
      { kind: 'support', label: 'Preparing' },
      { kind: 'attack', label: 'Pounce', amount: 11 },
      { kind: 'attack', label: 'Attack', amount: 5 },
    ],
  },
  'goblin-fighter': {
    id: 'goblin-fighter', name: 'Goblin Fighter', subtitle: 'Armored skirmisher', maxHp: 30, armor: 1, color: '#78945f',
    pattern: [
      { kind: 'attack', label: 'Attack', amount: 6 },
      { kind: 'defend', label: 'Defend', block: 7 },
    ],
  },
  'goblin-archer': {
    id: 'goblin-archer', name: 'Goblin Archer', subtitle: 'Uncertain aim', maxHp: 22, color: '#a68c52',
    pattern: [
      { kind: 'attack', label: 'Attack', amount: 8 },
      { kind: 'attack', label: 'Hidden attack', amount: 11, concealed: true },
    ],
  },
  'goblin-shaman': {
    id: 'goblin-shaman', name: 'Goblin Shaman', subtitle: 'Trickster mystic', maxHp: 20, color: '#7a6baa',
    pattern: [
      { kind: 'support', label: 'Empower allies', buffAttack: 1 },
      { kind: 'debuff', label: 'Obscuring hex', blind: 1 },
      { kind: 'attack', label: 'Magic attack', amount: 4 },
    ],
  },
};

export const encounters: Record<string, EncounterDefinition> = {
  wolves: {
    id: 'wolves', name: 'Wolf Pack', description: 'Pack pressure and a clearly prepared pounce.',
    enemies: ['grey-wolf', 'grey-wolf', 'prowling-wolf'],
  },
  goblins: {
    id: 'goblins', name: 'Goblin Patrol', description: 'Armor, Block, concealed attacks, and Blind.',
    enemies: ['goblin-fighter', 'goblin-archer', 'goblin-shaman'],
  },
};
