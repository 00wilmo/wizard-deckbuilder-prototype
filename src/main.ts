import Phaser from 'phaser';
import './styles.css';
import { cards, encounters, startingDeck } from './game/data';
import {
  createCombat, endTurn, getIntent, playCantrip, playCard, playUltimate, resolveHandDiscard,
} from './game/engine';
import type { CardDefinition, CardInstance, CombatState, EnemyState } from './game/types';
import { CombatScene } from './scene';

type Selection = { kind: 'card'; uid: string } | { kind: 'cantrip' } | null;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-block">
        <span class="eyebrow">Combat prototype · v0.2</span>
        <h1>THE UNWRITTEN GRIMOIRE</h1>
      </div>
      <nav class="top-actions" aria-label="Prototype controls">
        <button class="secondary-button" id="spellbook-button">Spellbook</button>
        <button class="secondary-button" id="restart-button">Restart Battle</button>
      </nav>
    </header>

    <main class="prototype-layout">
      <section class="battle-column">
        <div class="encounter-tabs" id="encounter-tabs"></div>
        <div class="battle-frame">
          <div id="stage" aria-hidden="true"></div>
          <div class="battle-overlay">
            <div class="turn-plaque" id="turn-plaque"></div>
            <section class="combatant player-combatant" id="player-panel"></section>
            <section class="enemy-line" id="enemy-line" aria-label="Enemies"></section>
            <div class="selection-hint" id="selection-hint"></div>
          </div>
        </div>

        <section class="bound-zone" aria-label="Bound spells">
          <div class="bound-heading">
            <span>BOUND SPELLS</span>
            <small>Always available outside the hand</small>
          </div>
          <div class="bound-cards" id="bound-cards"></div>
          <button class="end-turn-button" id="end-turn-button">End Turn <kbd>E</kbd></button>
        </section>

        <section class="hand-zone">
          <div class="hand-heading">
            <div><span>CURRENT HAND</span><small id="pile-counts"></small></div>
            <small>Click a spell, then a target when required</small>
          </div>
          <div class="hand" id="hand"></div>
        </section>
      </section>

      <aside class="sidebar">
        <section class="side-panel rules-panel">
          <span class="eyebrow">Current encounter</span>
          <h2 id="encounter-name"></h2>
          <p id="encounter-description"></p>
        </section>
        <section class="side-panel">
          <div class="panel-title-row"><h2>Combat Record</h2><span class="live-dot">LIVE</span></div>
          <ol class="combat-log" id="combat-log"></ol>
        </section>
        <section class="side-panel compact-rules">
          <h2>Prototype rules</h2>
          <p><b>Generalist’s Focus:</b> once per turn, changing schools restores 1 Mana.</p>
          <p><b>Burning:</b> triggers at the start of the enemy’s turn, ignores Armor, then falls by 1.</p>
          <p><b>Armor:</b> reduces every hit. Every 5 health damage breaks 1 Armor.</p>
          <p><b>Intent:</b> categories are visible; exact values remain hidden.</p>
        </section>
      </aside>
    </main>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <dialog class="modal" id="modal"><div id="modal-content"></div></dialog>
`;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  backgroundColor: '#091321',
  transparent: false,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [CombatScene],
  audio: { noAudio: true },
});

let state: CombatState = createCombat('wolves');
let selection: Selection = null;
let toastTimer = 0;

const q = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
};

const handElement = q<HTMLDivElement>('#hand');
const enemyLine = q<HTMLElement>('#enemy-line');
const modal = q<HTMLDialogElement>('#modal');
const modalContent = q<HTMLDivElement>('#modal-content');

function definition(instance: CardInstance): CardDefinition {
  return cards[instance.definitionId];
}

function showToast(message: string): void {
  const toast = q<HTMLDivElement>('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
}

function cardMarkup(card: CardDefinition, uidValue: string, extraClass = '', disabled = false): string {
  const selected = selection?.kind === 'card' && selection.uid === uidValue;
  return `
    <button class="spell-card school-${card.school.toLowerCase()} ${extraClass} ${selected ? 'selected' : ''}"
      data-card="${uidValue}" ${disabled ? 'disabled' : ''} aria-label="${card.name}: ${card.rules}">
      <span class="card-title">${card.name}</span>
      <span class="card-art" aria-hidden="true">${card.art}</span>
      <span class="cost-row"><b>${card.ap} AP</b><b>${card.mana} MANA</b></span>
      <span class="card-rules">${card.rules}</span>
      <span class="card-school">${card.school}${card.retain ? ' · RETAIN' : ''}</span>
    </button>`;
}

function intentMarkup(enemy: EnemyState): string {
  const intent = getIntent(enemy);
  const hidden = state.player.blindTurns > 0 || intent.concealed;
  if (hidden) return `<span class="intent hidden-intent"><i>?</i> Hidden intention</span>`;
  const icons: Record<string, string> = { attack: '⚔', defend: '⬡', support: '✦', debuff: '◌', hidden: '?' };
  return `<span class="intent intent-${intent.kind}"><i>${icons[intent.kind]}</i>${intent.label}</span>`;
}

function enemyMarkup(enemy: EnemyState): string {
  const dead = enemy.hp <= 0;
  const hpPercent = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
  const armorProgress = enemy.armor > 0 ? `${enemy.armorBreak}/5` : '—';
  return `
    <button class="enemy-card ${dead ? 'defeated' : ''}" data-enemy="${enemy.uid}" ${dead ? 'disabled' : ''}
      style="--enemy-color:${enemy.color}">
      <span class="enemy-sigil">${enemy.definitionId.includes('wolf') ? '◢' : '♟'}</span>
      <span class="enemy-name">${enemy.name}</span>
      <small>${enemy.subtitle}</small>
      ${dead ? '<span class="defeated-label">DEFEATED</span>' : intentMarkup(enemy)}
      <span class="hp-bar"><i style="width:${hpPercent}%"></i></span>
      <span class="enemy-stats"><b>${enemy.hp}/${enemy.maxHp} HP</b><b>${enemy.block} Block</b></span>
      <span class="enemy-stats minor"><span>${enemy.armor} Armor · ${armorProgress}</span><span>${enemy.burning} Burning</span><span>${enemy.chill} Chill</span></span>
    </button>`;
}

function renderPlayer(): void {
  const player = state.player;
  q<HTMLElement>('#player-panel').innerHTML = `
    <div class="mage-portrait" aria-hidden="true"><span>✦</span></div>
    <div class="combatant-copy">
      <span class="eyebrow">The Scholar</span>
      <h2>Wandering Wizard</h2>
      <div class="resource-line">
        <span class="resource health"><b>${player.hp}</b> / ${player.maxHp} Health</span>
        <span class="resource mana"><b>${player.mana}</b> / ${player.maxMana} Mana</span>
        <span class="resource action"><b>${player.ap}</b> / ${player.maxAp} AP</span>
      </div>
      <div class="resource-line secondary-resources">
        <span>${player.ward} Ward</span><span>${player.armor} Armor</span>
        ${player.wardPersistTurns > 0 ? `<span class="buff">Ward persists: ${player.wardPersistTurns}</span>` : ''}
        ${player.blindTurns > 0 ? '<span class="debuff">Blind</span>' : ''}
      </div>
    </div>`;
}

function renderBoundCards(): void {
  const cantrip = cards['arcane-dart'];
  const cantripDisabled = state.phase !== 'player' || state.player.ap < cantrip.ap || Boolean(state.pendingChoice);
  const ultimate = state.equippedUltimateId ? cards[state.equippedUltimateId] : null;
  const ultimateDisabled = !ultimate || state.phase !== 'player' || state.ultimateUsed || state.player.ap < ultimate.ap || state.player.mana < ultimate.mana || Boolean(state.pendingChoice);
  const ultimateMarkup = ultimate ? `
    <button class="bound-card ultimate-card" data-ultimate ${ultimateDisabled ? 'disabled' : ''}>
      <span><small>${state.ultimateUsed ? 'ULTIMATE SPENT' : 'BOUND ULTIMATE'}</small><b>${ultimate.name}</b></span>
      <span class="bound-effect">${ultimate.ap} AP · ${ultimate.mana} Mana · ${ultimate.rules}</span>
    </button>` : `
    <button class="bound-card ultimate-card locked-bound" disabled>
      <span><small>ULTIMATE UNBOUND</small><b>Empty Binding</b></span>
      <span class="bound-effect">Defeat the act boss to learn an ultimate</span>
    </button>`;
  q<HTMLDivElement>('#bound-cards').innerHTML = `
    <button class="bound-card cantrip-card ${selection?.kind === 'cantrip' ? 'selected' : ''}" data-cantrip
      ${cantripDisabled ? 'disabled' : ''}>
      <span><small>BOUND CANTRIP</small><b>Arcane Dart</b></span><span class="bound-effect">1 AP · Deal 3 damage</span>
    </button>
    ${ultimateMarkup}`;
}

function renderHand(): void {
  handElement.innerHTML = state.hand.map((instance) => {
    const card = definition(instance);
    const disabled = state.phase !== 'player' || Boolean(state.pendingChoice) || state.player.ap < card.ap || state.player.mana < card.mana;
    return cardMarkup(card, instance.uid, '', disabled);
  }).join('') || '<div class="empty-hand">No spells in hand.</div>';
  q<HTMLElement>('#pile-counts').textContent = `${state.drawPile.length} draw · ${state.discardPile.length} discard · ${state.exhaustPile.length} exhaust`;
}

function renderLog(): void {
  q<HTMLOListElement>('#combat-log').innerHTML = state.log.map((entry, index) => `<li class="${index === 0 ? 'latest' : ''}">${entry}</li>`).join('');
}

function renderOutcome(): void {
  if (state.phase !== 'victory' && state.phase !== 'defeat') return;
  const won = state.phase === 'victory';
  openModal(`
    <div class="outcome ${won ? 'victory' : 'defeat'}">
      <span class="outcome-icon">${won ? '✦' : '◇'}</span>
      <span class="eyebrow">${won ? 'Encounter complete' : 'The spellbook closes'}</span>
      <h2>${won ? 'Victory' : 'Defeat'}</h2>
      <p>${won ? 'The combat foundation survived its first test.' : 'Try another draw or a different sequence of spells.'}</p>
      <div class="modal-actions">
        <button class="primary-button" data-retry>Fight Again</button>
        <button class="secondary-button" data-switch-encounter>${state.encounterId === 'wolves' ? 'Try Goblins' : 'Try Wolves'}</button>
      </div>
    </div>`);
}

function render(): void {
  renderPlayer();
  renderBoundCards();
  renderHand();
  enemyLine.innerHTML = state.enemies.map(enemyMarkup).join('');
  renderLog();
  q<HTMLElement>('#turn-plaque').innerHTML = `<small>TURN</small><b>${state.turn}</b><span>${state.phase === 'player' ? 'YOUR MOVE' : state.phase.toUpperCase()}</span>`;
  q<HTMLButtonElement>('#end-turn-button').disabled = state.phase !== 'player' || Boolean(state.pendingChoice);
  q<HTMLElement>('#selection-hint').textContent = selection ? 'Select an enemy target' : state.pendingChoice?.prompt ?? '';
  const encounter = encounters[state.encounterId];
  q<HTMLElement>('#encounter-name').textContent = encounter.name;
  q<HTMLElement>('#encounter-description').textContent = encounter.description;
  renderOutcome();
  if (state.pendingChoice && !modal.open) openDiscardHandModal();
}

function openModal(content: string): void {
  modalContent.innerHTML = `<button class="modal-close" data-close-modal aria-label="Close">×</button>${content}`;
  if (!modal.open) modal.showModal();
}

function closeModal(): void {
  if (modal.open && !state.pendingChoice && state.phase !== 'victory' && state.phase !== 'defeat') modal.close();
}

function openSpellbook(): void {
  const deckCards = startingDeck.map((id, index) => cardMarkup(cards[id], `book-${index}`, 'book-card')).join('');
  openModal(`
    <div class="spellbook-modal">
      <span class="eyebrow">Prepared knowledge</span>
      <h2>Starting Spellbook</h2>
      <p>Ten unique spells. Bound spells are recorded separately and never enter the draw pile.</p>
      <div class="spellbook-grid">${deckCards}</div>
      <h3>Bound spells</h3>
      <div class="bound-summary"><b>Arcane Dart</b><span>Repeatable cantrip</span><b>Ultimate binding</b><span>Empty until the act boss is defeated</span></div>
    </div>`);
}

function openDiscardModal(cardUid: string): void {
  const choices = state.discardPile.map((instance) => {
    const card = definition(instance);
    return `<button class="choice-row" data-recall-card="${cardUid}" data-discard-choice="${instance.uid}"><b>${card.name}</b><span>${card.rules}</span></button>`;
  }).join('');
  openModal(`<div class="choice-modal"><span class="eyebrow">Recollection</span><h2>Choose a discarded spell</h2>${choices || '<p>The discard pile is empty.</p>'}</div>`);
}

function openDiscardHandModal(): void {
  const choices = state.hand.map((instance) => {
    const card = definition(instance);
    return `<button class="choice-row" data-hand-discard="${instance.uid}"><b>${card.name}</b><span>${card.rules}</span></button>`;
  }).join('');
  openModal(`<div class="choice-modal"><span class="eyebrow">Quick Study</span><h2>Discard one spell</h2><p>Knowledge requires editing.</p>${choices}</div>`);
}

function castVisual(school: string): void {
  const colors: Record<string, number> = { Arcane: 0x77bfff, Evocation: 0xff7658, Warding: 0xf4d778 };
  const scene = game.scene.getScene('combat') as CombatScene | undefined;
  scene?.castEffect(colors[school] ?? 0x77bfff);
}

function startEncounter(encounterId: string): void {
  if (modal.open) modal.close();
  state = createCombat(encounterId);
  selection = null;
  render();
}

function attemptCard(cardUid: string): void {
  const instance = state.hand.find((item) => item.uid === cardUid);
  if (!instance) return;
  const card = definition(instance);
  if (card.target === 'enemy') {
    selection = selection?.kind === 'card' && selection.uid === cardUid ? null : { kind: 'card', uid: cardUid };
    render();
    return;
  }
  if (card.target === 'discard') {
    if (state.discardPile.length === 0) { showToast('The discard pile is empty.'); return; }
    openDiscardModal(cardUid);
    return;
  }
  const result = playCard(state, cardUid);
  if (!result.ok) showToast(result.message ?? 'The spell fails.');
  else castVisual(card.school);
  selection = null;
  render();
}

function targetEnemy(enemyUid: string): void {
  if (!selection) { showToast('Select a targeted spell first.'); return; }
  if (selection.kind === 'cantrip') {
    const result = playCantrip(state, enemyUid);
    if (!result.ok) showToast(result.message ?? 'The cantrip fails.');
    else castVisual('Arcane');
  } else {
    const selectedUid = selection.uid;
    const instance = state.hand.find((item) => item.uid === selectedUid);
    const school = instance ? definition(instance).school : 'Arcane';
    const result = playCard(state, selectedUid, enemyUid);
    if (!result.ok) showToast(result.message ?? 'The spell fails.');
    else castVisual(school);
  }
  selection = null;
  render();
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('button');
  if (!button) return;
  if (button.dataset.card && !button.classList.contains('book-card')) attemptCard(button.dataset.card);
  else if (button.dataset.enemy) targetEnemy(button.dataset.enemy);
  else if (button.hasAttribute('data-cantrip')) { selection = selection?.kind === 'cantrip' ? null : { kind: 'cantrip' }; render(); }
  else if (button.hasAttribute('data-ultimate')) {
    const result = playUltimate(state);
    if (!result.ok) showToast(result.message ?? 'The ultimate fails.');
    else castVisual('Warding');
    selection = null;
    render();
  } else if (button.dataset.recallCard && button.dataset.discardChoice) {
    const instance = state.hand.find((item) => item.uid === button.dataset.recallCard);
    const school = instance ? definition(instance).school : 'Arcane';
    const result = playCard(state, button.dataset.recallCard, undefined, button.dataset.discardChoice);
    if (!result.ok) showToast(result.message ?? 'Recollection fails.');
    else { castVisual(school); modal.close(); }
    render();
  } else if (button.dataset.handDiscard) {
    const result = resolveHandDiscard(state, button.dataset.handDiscard);
    if (!result.ok) showToast(result.message ?? 'Choose a spell.');
    else modal.close();
    render();
  } else if (button.hasAttribute('data-close-modal')) closeModal();
  else if (button.hasAttribute('data-retry')) startEncounter(state.encounterId);
  else if (button.hasAttribute('data-switch-encounter')) startEncounter(state.encounterId === 'wolves' ? 'goblins' : 'wolves');
});

q<HTMLButtonElement>('#end-turn-button').addEventListener('click', () => {
  const result = endTurn(state);
  if (!result.ok) showToast(result.message ?? 'The turn cannot end yet.');
  selection = null;
  render();
});
q<HTMLButtonElement>('#restart-button').addEventListener('click', () => startEncounter(state.encounterId));
q<HTMLButtonElement>('#spellbook-button').addEventListener('click', openSpellbook);

q<HTMLDivElement>('#encounter-tabs').innerHTML = Object.values(encounters).map((encounter) =>
  `<button class="encounter-tab" data-start-encounter="${encounter.id}">${encounter.name}</button>`).join('');
q<HTMLDivElement>('#encounter-tabs').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-start-encounter]');
  if (button?.dataset.startEncounter) startEncounter(button.dataset.startEncounter);
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'e' && !modal.open) q<HTMLButtonElement>('#end-turn-button').click();
  if (event.key.toLowerCase() === 'b' && !modal.open) openSpellbook();
  if (event.key === 'Escape') closeModal();
});

render();
