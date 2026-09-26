import { cards, encounters, enemies, startingDeck } from './data';
import type { CardInstance, CombatState, EnemyIntent, EnemyState, School } from './types';

const ARMOR_BREAK_THRESHOLD = 5;

function uid(prefix: string, index: number): string {
  return `${prefix}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeDeck(random: () => number, deckIds: string[] = startingDeck): CardInstance[] {
  return shuffle(deckIds.map((definitionId, index) => ({ uid: uid('card', index), definitionId })), random);
}

function makeEnemy(definitionId: string, index: number): EnemyState {
  const definition = enemies[definitionId];
  return {
    uid: uid('enemy', index), definitionId, name: definition.name, subtitle: definition.subtitle,
    hp: definition.maxHp, maxHp: definition.maxHp, block: 0, armor: definition.armor ?? 0,
    armorBreak: 0, burning: 0, chill: 0, attackBonus: 0, intentIndex: 0,
    pattern: definition.pattern, color: definition.color, packHunter: definition.packHunter ?? false,
  };
}

export interface CombatSetup {
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
  deckIds?: string[];
}

export function createCombat(
  encounterId: string,
  random: () => number = Math.random,
  setup: CombatSetup = {},
): CombatState {
  const encounter = encounters[encounterId] ?? encounters.wolves;
  const state: CombatState = {
    encounterId: encounter.id,
    turn: 1,
    phase: 'player',
    player: {
      hp: setup.hp ?? 70, maxHp: setup.maxHp ?? 70,
      mana: setup.mana ?? 12, maxMana: setup.maxMana ?? 12, ap: 3, maxAp: 3,
      ward: 0, armor: 0, armorBreak: 0, burning: 0, blindTurns: 0,
      reactiveWard: 0, wardPersistTurns: 0, generalistTriggered: false, previousSchool: null,
    },
    enemies: encounter.enemies.map(makeEnemy),
    drawPile: makeDeck(random, setup.deckIds), hand: [], discardPile: [], exhaustPile: [],
    equippedUltimateId: null, ultimateUsed: false, pendingChoice: null,
    log: [`${encounter.name} begins.`, 'Draw 5 spells.'],
  };
  drawCards(state, 5, random);
  return state;
}

export function getIntent(enemy: EnemyState): EnemyIntent {
  return enemy.pattern[enemy.intentIndex % enemy.pattern.length];
}

export function drawCards(state: CombatState, count: number, random: () => number = Math.random): void {
  for (let i = 0; i < count; i += 1) {
    if (state.drawPile.length === 0 && state.discardPile.length > 0) {
      state.drawPile = shuffle(state.discardPile, random);
      state.discardPile = [];
      state.log.unshift('The discard pile returns to the spellbook.');
    }
    const card = state.drawPile.pop();
    if (!card) break;
    state.hand.push(card);
  }
}

function addLog(state: CombatState, message: string): void {
  state.log.unshift(message);
  state.log = state.log.slice(0, 10);
}

function livingEnemies(state: CombatState): EnemyState[] {
  return state.enemies.filter((enemy) => enemy.hp > 0);
}

function progressArmorBreak(enemy: EnemyState, healthDamage: number): void {
  if (enemy.armor <= 0 || healthDamage <= 0) return;
  enemy.armorBreak += healthDamage;
  while (enemy.armor > 0 && enemy.armorBreak >= ARMOR_BREAK_THRESHOLD) {
    enemy.armorBreak -= ARMOR_BREAK_THRESHOLD;
    enemy.armor -= 1;
  }
  if (enemy.armor <= 0) enemy.armorBreak = 0;
}

export function damageEnemy(state: CombatState, enemy: EnemyState, amount: number, ignoresArmor = false): number {
  if (enemy.hp <= 0) return 0;
  const afterArmor = ignoresArmor ? amount : Math.max(0, amount - enemy.armor);
  const blocked = Math.min(enemy.block, afterArmor);
  enemy.block -= blocked;
  const healthDamage = Math.max(0, afterArmor - blocked);
  enemy.hp = Math.max(0, enemy.hp - healthDamage);
  progressArmorBreak(enemy, healthDamage);
  if (enemy.hp <= 0) addLog(state, `${enemy.name} is defeated.`);
  return healthDamage;
}

function damagePlayer(state: CombatState, amount: number, source: string): number {
  if (state.player.reactiveWard > 0) {
    state.player.ward += state.player.reactiveWard;
    addLog(state, `Reactive Barrier forms ${state.player.reactiveWard} Ward.`);
    state.player.reactiveWard = 0;
  }
  const afterArmor = Math.max(0, amount - state.player.armor);
  const absorbed = Math.min(state.player.ward, afterArmor);
  state.player.ward -= absorbed;
  const healthDamage = Math.max(0, afterArmor - absorbed);
  state.player.hp = Math.max(0, state.player.hp - healthDamage);
  addLog(state, `${source} attacks for ${amount}; ${healthDamage} reaches health.`);
  if (state.player.hp <= 0) state.phase = 'defeat';
  return healthDamage;
}

function resolveGeneralistsFocus(state: CombatState, school: School): void {
  const previous = state.player.previousSchool;
  if (!state.player.generalistTriggered && previous !== null && previous !== school) {
    const before = state.player.mana;
    state.player.mana = Math.min(state.player.maxMana, state.player.mana + 1);
    if (state.player.mana > before) addLog(state, "Generalist's Focus restores 1 Mana.");
    state.player.generalistTriggered = true;
  }
  state.player.previousSchool = school;
}

function canPay(state: CombatState, cardId: string): boolean {
  const card = cards[cardId];
  return state.phase === 'player' && !state.pendingChoice && state.player.ap >= card.ap && state.player.mana >= card.mana;
}

function finishCast(state: CombatState, school: School): void {
  resolveGeneralistsFocus(state, school);
  if (livingEnemies(state).length === 0) state.phase = 'victory';
}

export function playCard(
  state: CombatState,
  cardUid: string,
  targetUid?: string,
  discardChoiceUid?: string,
  random: () => number = Math.random,
): { ok: boolean; message?: string } {
  const handIndex = state.hand.findIndex((item) => item.uid === cardUid);
  if (handIndex < 0) return { ok: false, message: 'That spell is not in your hand.' };
  const instance = state.hand[handIndex];
  const card = cards[instance.definitionId];
  if (!canPay(state, card.id)) return { ok: false, message: 'Not enough AP or Mana.' };

  const target = targetUid ? state.enemies.find((enemy) => enemy.uid === targetUid && enemy.hp > 0) : undefined;
  if (card.target === 'enemy' && !target) return { ok: false, message: 'Choose a living enemy.' };
  if (card.target === 'discard') {
    if (state.discardPile.length === 0) return { ok: false, message: 'The discard pile is empty.' };
    if (!discardChoiceUid || !state.discardPile.some((item) => item.uid === discardChoiceUid)) {
      return { ok: false, message: 'Choose a spell from the discard pile.' };
    }
  }

  state.hand.splice(handIndex, 1);
  state.player.ap -= card.ap;
  state.player.mana -= card.mana;
  addLog(state, `Cast ${card.name}.`);

  switch (card.id) {
    case 'arcane-missile': damageEnemy(state, target!, 5); break;
    case 'mana-weave': state.player.mana = Math.min(state.player.maxMana, state.player.mana + 3); break;
    case 'quick-study':
      drawCards(state, 2, random);
      if (state.hand.length > 0) state.pendingChoice = { kind: 'discard-hand', count: 1, prompt: 'Quick Study: discard one spell.' };
      break;
    case 'recollection': {
      const choiceIndex = state.discardPile.findIndex((item) => item.uid === discardChoiceUid);
      const [recalled] = state.discardPile.splice(choiceIndex, 1);
      if (recalled) state.hand.push(recalled);
      break;
    }
    case 'kindle':
      target!.burning += 3;
      addLog(state, `${target!.name} gains 3 Burning.`);
      break;
    case 'cinder-lance': damageEnemy(state, target!, target!.burning > 0 ? 12 : 8); break;
    case 'forked-lightning': livingEnemies(state).forEach((enemy) => damageEnemy(state, enemy, 5)); break;
    case 'lesser-ward': state.player.ward += 8; break;
    case 'reactive-barrier': state.player.ward += 5; state.player.reactiveWard += 5; break;
    case 'aegis-script': state.player.ward += 14; break;
    case 'frost-thread': damageEnemy(state, target!, 6); target!.chill += 2; break;
    case 'ember-volley': livingEnemies(state).forEach((enemy) => damageEnemy(state, enemy, 7)); break;
    case 'searing-insight': {
      const wasBurning = target!.burning > 0;
      damageEnemy(state, target!, 7);
      if (wasBurning) drawCards(state, 1, random);
      break;
    }
    case 'steady-aegis': state.player.ward += 10; break;
    case 'echoing-barrier': state.player.ward += 6; drawCards(state, 1, random); break;
    case 'prismatic-sequence': damageEnemy(state, target!, 6); drawCards(state, 1, random); break;
    case 'measured-recall': drawCards(state, 2, random); break;
    case 'arcane-reservoir': state.player.mana = Math.min(state.player.maxMana, state.player.mana + 4); break;
  }

  if (card.exhaust) state.exhaustPile.push(instance);
  else state.discardPile.push(instance);
  finishCast(state, card.school);
  return { ok: true };
}

export function resolveHandDiscard(state: CombatState, cardUid: string): { ok: boolean; message?: string } {
  if (state.pendingChoice?.kind !== 'discard-hand') return { ok: false, message: 'No discard is required.' };
  const index = state.hand.findIndex((card) => card.uid === cardUid);
  if (index < 0) return { ok: false, message: 'Choose a spell in your hand.' };
  const [discarded] = state.hand.splice(index, 1);
  state.discardPile.push(discarded);
  addLog(state, `${cards[discarded.definitionId].name} is discarded.`);
  state.pendingChoice = null;
  return { ok: true };
}

export function playCantrip(state: CombatState, targetUid: string): { ok: boolean; message?: string } {
  const card = cards['arcane-dart'];
  if (!canPay(state, card.id)) return { ok: false, message: 'Not enough AP.' };
  const target = state.enemies.find((enemy) => enemy.uid === targetUid && enemy.hp > 0);
  if (!target) return { ok: false, message: 'Choose a living enemy.' };
  state.player.ap -= card.ap;
  damageEnemy(state, target, 3);
  addLog(state, 'Cast Arcane Dart.');
  finishCast(state, card.school);
  return { ok: true };
}

export function playUltimate(state: CombatState): { ok: boolean; message?: string } {
  if (!state.equippedUltimateId) return { ok: false, message: 'No ultimate spell is bound yet.' };
  const card = cards['runic-bulwark'];
  if (state.ultimateUsed) return { ok: false, message: 'The ultimate has already been used this battle.' };
  if (!canPay(state, card.id)) return { ok: false, message: 'Not enough AP or Mana.' };
  state.player.ap -= card.ap;
  state.player.mana -= card.mana;
  state.player.ward += 16;
  state.player.wardPersistTurns = 3;
  state.ultimateUsed = true;
  addLog(state, 'Runic Bulwark seals the Ward in place for 3 turns.');
  finishCast(state, card.school);
  return { ok: true };
}

function executeIntent(state: CombatState, enemy: EnemyState): void {
  const intent = getIntent(enemy);
  if (intent.kind === 'attack') {
    const packBonus = enemy.packHunter ? Math.max(0, livingEnemies(state).filter((other) => other.packHunter).length - 1) : 0;
    let amount = (intent.amount ?? 0) + enemy.attackBonus + packBonus;
    if (enemy.chill > 0) {
      amount = Math.max(0, amount - enemy.chill);
      addLog(state, `${enemy.name}'s attack is reduced by ${enemy.chill} Chill.`);
      enemy.chill = 0;
    }
    damagePlayer(state, amount, enemy.name);
  } else if (intent.kind === 'defend') {
    enemy.block += intent.block ?? 0;
    addLog(state, `${enemy.name} gains Block.`);
  } else if (intent.buffAttack) {
    livingEnemies(state).forEach((ally) => { ally.attackBonus += intent.buffAttack ?? 0; });
    addLog(state, `${enemy.name} empowers its allies.`);
  } else if (intent.blind) {
    state.player.blindTurns = Math.max(state.player.blindTurns, intent.blind);
    addLog(state, `${enemy.name} applies Blind.`);
  } else {
    addLog(state, `${enemy.name} prepares to strike.`);
  }
  enemy.intentIndex = (enemy.intentIndex + 1) % enemy.pattern.length;
}

function startPlayerTurn(state: CombatState, random: () => number): void {
  state.turn += 1;
  if (state.player.wardPersistTurns > 0) state.player.wardPersistTurns -= 1;
  else state.player.ward = 0;
  state.player.ap = state.player.maxAp;
  state.player.mana = Math.min(state.player.maxMana, state.player.mana + 2);
  state.player.generalistTriggered = false;
  state.player.reactiveWard = 0;
  drawCards(state, 5, random);
  state.phase = 'player';
  addLog(state, `Turn ${state.turn}: regain 2 Mana and draw 5 spells.`);
}

export function endTurn(state: CombatState, random: () => number = Math.random): { ok: boolean; message?: string } {
  if (state.phase !== 'player' || state.pendingChoice) return { ok: false, message: 'Resolve the current choice first.' };
  const retained: CardInstance[] = [];
  state.hand.forEach((instance) => {
    if (cards[instance.definitionId].retain) retained.push(instance);
    else state.discardPile.push(instance);
  });
  state.hand = retained;
  if (state.player.blindTurns > 0) state.player.blindTurns -= 1;
  state.phase = 'enemy';

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || state.player.hp <= 0) continue;
    enemy.block = 0;
    if (enemy.burning > 0) {
      const burning = enemy.burning;
      damageEnemy(state, enemy, burning, true);
      enemy.burning = Math.max(0, enemy.burning - 1);
      addLog(state, `${enemy.name} takes ${burning} Burning damage.`);
    }
    if (enemy.hp > 0) executeIntent(state, enemy);
  }

  if (state.player.hp <= 0) state.phase = 'defeat';
  else if (livingEnemies(state).length === 0) state.phase = 'victory';
  else startPlayerTurn(state, random);
  return { ok: true };
}

export function getAvailableEncounterIds(): string[] {
  return Object.keys(encounters);
}
