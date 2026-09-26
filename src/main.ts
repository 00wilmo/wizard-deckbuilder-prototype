import Phaser from 'phaser';
import './styles.css';
import { cards, encounters } from './game/data';
import { createCombat, endTurn, getIntent, playCantrip, playCard, playUltimate, resolveHandDiscard } from './game/engine';
import { availableNodeIds, clearRun, completeNode, createRun, loadRun, nodePresentation, saveRun, scholars } from './game/run';
import type { MapNode, RunState, ScholarId } from './game/run';
import type { CardDefinition, CardInstance, CombatState, EnemyState } from './game/types';
import { CombatScene } from './scene';

type Selection = { kind: 'card'; uid: string } | { kind: 'cantrip' } | null;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar"><div class="brand-block"><span class="eyebrow">Act I framework · v0.3</span><h1>THE UNWRITTEN GRIMOIRE</h1></div><nav class="top-actions"><button class="secondary-button" id="spellbook-button" hidden>Spellbook <kbd>B</kbd></button><button class="secondary-button" id="abandon-button" hidden>Abandon Run</button></nav></header>
    <main id="selection-screen" class="selection-screen" hidden></main>
    <main id="run-screen" class="run-screen" hidden>
      <section class="map-panel"><div class="map-heading"><div><span class="eyebrow">Act I · the Verdant Trail</span><h2>A Rumor Beneath the Boughs</h2></div><p>The whole road is visible. Its exact dangers are not.</p></div><div class="forest-map" id="forest-map"></div></section>
      <aside class="run-sidebar"><section class="run-profile" id="run-profile"></section><section class="side-panel map-key"><h2>Map Key</h2><div id="map-key"></div></section><section class="side-panel"><span class="eyebrow">Prototype boundary</span><h2>The road is now playable</h2><p>Battles persist health and mana. Other locations have lightweight first-pass resolutions; rewards, shops, events, and the golem are the next content layer.</p></section></aside>
    </main>
    <main id="battle-screen" class="prototype-layout" hidden>
      <section class="battle-column"><div class="battle-frame"><div id="stage" aria-hidden="true"></div><div class="battle-overlay"><div class="turn-plaque" id="turn-plaque"></div><section class="combatant player-combatant" id="player-panel"></section><section class="enemy-line" id="enemy-line" aria-label="Enemies"></section><div class="selection-hint" id="selection-hint"></div></div></div><section class="bound-zone"><div class="bound-heading"><span>BOUND SPELLS</span><small>Always available outside the hand</small></div><div class="bound-cards" id="bound-cards"></div><button class="end-turn-button" id="end-turn-button">End Turn <kbd>E</kbd></button></section><section class="hand-zone"><div class="hand-heading"><div><span>CURRENT HAND</span><small id="pile-counts"></small></div><small>Click a spell, then a target when required</small></div><div class="hand" id="hand"></div></section></section>
      <aside class="sidebar"><section class="side-panel rules-panel"><span class="eyebrow">Current encounter</span><h2 id="encounter-name"></h2><p id="encounter-description"></p></section><section class="side-panel"><div class="panel-title-row"><h2>Combat Record</h2><span class="live-dot">LIVE</span></div><ol class="combat-log" id="combat-log"></ol></section><section class="side-panel compact-rules"><h2>Prototype rules</h2><p><b>Generalist’s Focus:</b> once per turn, changing schools restores 1 Mana.</p><p><b>Burning:</b> triggers at the start of the enemy’s turn, ignores Armor, then falls by 1.</p><p><b>Armor:</b> reduces every hit. Every 5 health damage breaks 1 Armor.</p><p><b>Intent:</b> categories are visible; exact values remain hidden.</p></section></aside>
    </main>
  </div><div class="toast" id="toast" role="status" aria-live="polite"></div><dialog class="modal" id="modal"><div id="modal-content"></div></dialog>`;

const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'stage', backgroundColor: '#091321', transparent: false, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, scene: [CombatScene], audio: { noAudio: true } });
const q = <T extends HTMLElement>(selector: string): T => { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing element ${selector}`); return element; };
let activeRun: RunState | null = loadRun();
let state: CombatState | null = null;
let selection: Selection = null;
let toastTimer = 0;
const modal = q<HTMLDialogElement>('#modal');
const modalContent = q<HTMLDivElement>('#modal-content');

function setScreen(screen: 'selection' | 'run' | 'battle'): void {
  q('#selection-screen').hidden = screen !== 'selection'; q('#run-screen').hidden = screen !== 'run'; q('#battle-screen').hidden = screen !== 'battle';
  q<HTMLButtonElement>('#spellbook-button').hidden = screen === 'selection'; q<HTMLButtonElement>('#abandon-button').hidden = screen === 'selection';
  if (screen === 'battle') window.setTimeout(() => game.scale.refresh(), 0);
}
function showToast(message: string): void { const toast = q<HTMLDivElement>('#toast'); toast.textContent = message; toast.classList.add('visible'); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200); }
function openModal(content: string, closable = true): void { modalContent.innerHTML = `${closable ? '<button class="modal-close" data-close-modal aria-label="Close">×</button>' : ''}${content}`; if (!modal.open) modal.showModal(); }
function closeModal(): void { if (modal.open && !state?.pendingChoice && state?.phase !== 'victory' && state?.phase !== 'defeat') modal.close(); }

function renderCharacterSelect(): void {
  setScreen('selection');
  q('#selection-screen').innerHTML = `<section class="selection-intro"><span class="eyebrow">Begin a new trail</span><h2>Choose the Scholar</h2><p>Dorian and Ilyra are the same established character in play: a curious generalist following rumors of a powerful spell. This choice is visual.</p></section><section class="scholar-grid">${(['dorian', 'ilyra'] as ScholarId[]).map((id) => `<button class="scholar-card scholar-${id}" data-scholar="${id}"><div class="scholar-portrait"><span class="portrait-rune">✦</span></div><div class="scholar-copy"><span class="eyebrow">${scholars[id].pronouns}</span><h3>${scholars[id].name}</h3><p>A travelling wizard with an eclectic spellbook and an eye for lost knowledge.</p><div class="loadout"><span>70 Health</span><span>12 Mana</span><span>10 Spells</span></div><b>Choose ${scholars[id].name}</b></div></button>`).join('')}</section>`;
}

function renderRunMap(): void {
  if (!activeRun) return renderCharacterSelect();
  setScreen('run');
  const available = new Set(availableNodeIds(activeRun)); const completed = new Set(activeRun.completedNodeIds); const width = 720; const height = 1080;
  const positions = new Map(activeRun.map.map((node) => [node.id, { x: node.lane === 1 ? width / 2 : 120 + node.lane * 240, y: height - 70 - node.row * 78 }]));
  const lines = activeRun.map.flatMap((node) => node.connections.map((targetId) => { const from = positions.get(node.id)!; const to = positions.get(targetId)!; const travelled = completed.has(node.id) && (completed.has(targetId) || available.has(targetId)); return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="${travelled ? 'travelled' : ''}" />`; })).join('');
  const nodes = activeRun.map.map((node) => { const p = nodePresentation[node.type]; const pos = positions.get(node.id)!; const status = completed.has(node.id) ? 'completed' : available.has(node.id) ? 'available' : 'locked'; return `<button class="map-node type-${node.type} ${status}" style="left:${pos.x}px;top:${pos.y}px" data-node="${node.id}" ${status !== 'available' ? 'disabled' : ''} title="${p.description}"><span>${p.icon}</span><small>${p.label}</small></button>`; }).join('');
  q('#forest-map').innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${nodes}<div class="map-mist mist-one"></div><div class="map-mist mist-two"></div>`;
  const scholar = scholars[activeRun.scholar];
  q('#run-profile').innerHTML = `<div class="profile-portrait scholar-${activeRun.scholar}"><span>✦</span></div><span class="eyebrow">The Scholar</span><h2>${scholar.name}</h2><p>Following the next fragment of a rumor.</p><div class="run-resources"><span><b>${activeRun.hp}</b> / ${activeRun.maxHp}<small>Health</small></span><span><b>${activeRun.mana}</b> / ${activeRun.maxMana}<small>Mana</small></span><span><b>${activeRun.gold}</b><small>Gold</small></span></div><div class="relic-chip">✦ Generalist’s Focus</div>`;
  const types = ['battle', 'elite', 'event', 'rest', 'research', 'shop', 'ruins', 'boss'] as const;
  q('#map-key').innerHTML = types.map((type) => `<span><i class="key-${type}">${nodePresentation[type].icon}</i>${nodePresentation[type].label}</span>`).join('');
}

function resolveNonCombatNode(node: MapNode): void {
  if (!activeRun) return;
  let copy = '';
  if (node.type === 'event') { activeRun.gold += 15; copy = 'A moss-covered waystone conceals an old coin cache. Gain 15 Gold.'; }
  if (node.type === 'rest') { const healed = Math.min(18, activeRun.maxHp - activeRun.hp); activeRun.hp += healed; activeRun.mana = activeRun.maxMana; copy = `The quiet fire restores ${healed} Health and all Mana.`; }
  if (node.type === 'research') { activeRun.mana = activeRun.maxMana; copy = 'You record a curious sigil and restore all Mana. Cantrip and ultimate research arrives in the next content pass.'; }
  if (node.type === 'shop') copy = 'A forest peddler displays spells and relics. The full shop inventory and spell-forgetting service arrive next.';
  if (node.type === 'ruins') { const healed = Math.min(18, activeRun.maxHp - activeRun.hp); activeRun.hp += healed; activeRun.mana = activeRun.maxMana; copy = `You rest beneath the engraved archways, restoring ${healed} Health and all Mana. The golem stirs below.`; }
  completeNode(activeRun, node.id); saveRun(activeRun);
  openModal(`<div class="node-result"><span class="outcome-icon">${nodePresentation[node.type].icon}</span><span class="eyebrow">Trail resolved</span><h2>${nodePresentation[node.type].label}</h2><p>${copy}</p><button class="primary-button" data-return-map>Continue</button></div>`, false);
}

function chooseNode(nodeId: string): void {
  if (!activeRun || !availableNodeIds(activeRun).includes(nodeId)) return;
  const node = activeRun.map.find((item) => item.id === nodeId); if (!node) return;
  activeRun.activeNodeId = node.id; saveRun(activeRun);
  if (node.type === 'battle' || node.type === 'elite') startEncounter(node.type === 'elite' || node.row % 2 === 1 ? 'goblins' : 'wolves');
  else if (node.type === 'boss') openModal('<div class="node-result"><span class="outcome-icon">⬢</span><span class="eyebrow">Milestone boundary</span><h2>The Engraved Golem</h2><p>The guardian, its second magical phase, and the three-ultimate reward are the next major playable encounter.</p><button class="primary-button" data-return-map>Return to Map</button></div>', false);
  else resolveNonCombatNode(node);
}

function definition(instance: CardInstance): CardDefinition { return cards[instance.definitionId]; }
function cardMarkup(card: CardDefinition, uidValue: string, extraClass = '', disabled = false): string { const selected = selection?.kind === 'card' && selection.uid === uidValue; return `<button class="spell-card school-${card.school.toLowerCase()} ${extraClass} ${selected ? 'selected' : ''}" data-card="${uidValue}" ${disabled ? 'disabled' : ''} aria-label="${card.name}: ${card.rules}"><span class="card-title">${card.name}</span><span class="card-art" aria-hidden="true">${card.art}</span><span class="cost-row"><b>${card.ap} AP</b><b>${card.mana} MANA</b></span><span class="card-rules">${card.rules}</span><span class="card-school">${card.school}${card.retain ? ' · RETAIN' : ''}</span></button>`; }
function intentMarkup(enemy: EnemyState): string { if (!state) return ''; const intent = getIntent(enemy); if (state.player.blindTurns > 0 || intent.concealed) return '<span class="intent hidden-intent"><i>?</i> Hidden intention</span>'; const icons: Record<string, string> = { attack: '⚔', defend: '⬡', support: '✦', debuff: '◌', hidden: '?' }; return `<span class="intent intent-${intent.kind}"><i>${icons[intent.kind]}</i>${intent.label}</span>`; }
function enemyMarkup(enemy: EnemyState): string { const dead = enemy.hp <= 0; const hpPercent = Math.max(0, (enemy.hp / enemy.maxHp) * 100); return `<button class="enemy-card ${dead ? 'defeated' : ''}" data-enemy="${enemy.uid}" ${dead ? 'disabled' : ''} style="--enemy-color:${enemy.color}"><span class="enemy-sigil">${enemy.definitionId.includes('wolf') ? '◢' : '♟'}</span><span class="enemy-name">${enemy.name}</span><small>${enemy.subtitle}</small>${dead ? '<span class="defeated-label">DEFEATED</span>' : intentMarkup(enemy)}<span class="hp-bar"><i style="width:${hpPercent}%"></i></span><span class="enemy-stats"><b>${enemy.hp}/${enemy.maxHp} HP</b><b>${enemy.block} Block</b></span><span class="enemy-stats minor"><span>${enemy.armor} Armor · ${enemy.armor > 0 ? `${enemy.armorBreak}/5` : '—'}</span><span>${enemy.burning} Burning</span><span>${enemy.chill} Chill</span></span></button>`; }

function renderPlayer(): void { if (!state || !activeRun) return; const player = state.player; q('#player-panel').innerHTML = `<div class="mage-portrait scholar-${activeRun.scholar}" aria-hidden="true"><span>✦</span></div><div class="combatant-copy"><span class="eyebrow">The Scholar</span><h2>${scholars[activeRun.scholar].name}</h2><div class="resource-line"><span class="resource health"><b>${player.hp}</b> / ${player.maxHp} Health</span><span class="resource mana"><b>${player.mana}</b> / ${player.maxMana} Mana</span><span class="resource action"><b>${player.ap}</b> / ${player.maxAp} AP</span></div><div class="resource-line secondary-resources"><span>${player.ward} Ward</span><span>${player.armor} Armor</span>${player.wardPersistTurns > 0 ? `<span class="buff">Ward persists: ${player.wardPersistTurns}</span>` : ''}${player.blindTurns > 0 ? '<span class="debuff">Blind</span>' : ''}</div></div>`; }
function renderBoundCards(): void { if (!state) return; const cantrip = cards['arcane-dart']; const disabled = state.phase !== 'player' || state.player.ap < cantrip.ap || Boolean(state.pendingChoice); q('#bound-cards').innerHTML = `<button class="bound-card cantrip-card ${selection?.kind === 'cantrip' ? 'selected' : ''}" data-cantrip ${disabled ? 'disabled' : ''}><span><small>BOUND CANTRIP</small><b>Arcane Dart</b></span><span class="bound-effect">1 AP · Deal 3 damage</span></button><button class="bound-card ultimate-card locked" disabled><span><small>ULTIMATE SLOT</small><b>Unbound</b></span><span class="bound-effect">Defeat the act boss to learn one</span></button>`; }
function renderOutcome(): void { if (!state || (state.phase !== 'victory' && state.phase !== 'defeat') || modal.open) return; const won = state.phase === 'victory'; openModal(`<div class="outcome ${won ? 'victory' : 'defeat'}"><span class="outcome-icon">${won ? '✦' : '◇'}</span><span class="eyebrow">${won ? 'Encounter complete' : 'The spellbook closes'}</span><h2>${won ? 'Victory' : 'Defeat'}</h2><p>${won ? 'Health persists. Five Mana and a small purse are recovered before moving on.' : 'This trail ends here. Begin a new run when you are ready.'}</p><div class="modal-actions"><button class="primary-button" ${won ? 'data-complete-battle' : 'data-new-run'}>${won ? 'Return to Map' : 'New Run'}</button></div></div>`, false); }

function renderCombat(): void {
  if (!state) return; renderPlayer(); renderBoundCards();
  q('#hand').innerHTML = state.hand.map((instance) => { const card = definition(instance); return cardMarkup(card, instance.uid, '', state!.phase !== 'player' || Boolean(state!.pendingChoice) || state!.player.ap < card.ap || state!.player.mana < card.mana); }).join('') || '<div class="empty-hand">No spells in hand.</div>';
  q('#pile-counts').textContent = `${state.drawPile.length} draw · ${state.discardPile.length} discard · ${state.exhaustPile.length} exhaust`; q('#enemy-line').innerHTML = state.enemies.map(enemyMarkup).join(''); q('#combat-log').innerHTML = state.log.map((entry, index) => `<li class="${index === 0 ? 'latest' : ''}">${entry}</li>`).join(''); q('#turn-plaque').innerHTML = `<small>TURN</small><b>${state.turn}</b><span>${state.phase === 'player' ? 'YOUR MOVE' : state.phase.toUpperCase()}</span>`; q<HTMLButtonElement>('#end-turn-button').disabled = state.phase !== 'player' || Boolean(state.pendingChoice); q('#selection-hint').textContent = selection ? 'Select an enemy target' : state.pendingChoice?.prompt ?? ''; q('#encounter-name').textContent = encounters[state.encounterId].name; q('#encounter-description').textContent = encounters[state.encounterId].description;
  if (state.pendingChoice && !modal.open) openDiscardHandModal(); renderOutcome();
}

function startEncounter(encounterId: string): void { if (!activeRun) return; if (modal.open) modal.close(); state = createCombat(encounterId, Math.random, { hp: activeRun.hp, maxHp: activeRun.maxHp, mana: activeRun.mana, maxMana: activeRun.maxMana, deckIds: activeRun.deck }); selection = null; setScreen('battle'); renderCombat(); }
function openSpellbook(): void { if (!activeRun) return; const deckCards = activeRun.deck.map((id, index) => cardMarkup(cards[id], `book-${index}`, 'book-card')).join(''); openModal(`<div class="spellbook-modal"><span class="eyebrow">Prepared knowledge</span><h2>${scholars[activeRun.scholar].name}’s Spellbook</h2><p>Ten unique spells. Bound spells are recorded separately and never enter the draw pile.</p><div class="spellbook-grid">${deckCards}</div><h3>Bound spells</h3><div class="bound-summary"><b>Arcane Dart</b><span>Repeatable cantrip</span><b>Ultimate slot</b><span>Unbound until the boss falls</span></div></div>`); }
function openDiscardModal(cardUid: string): void { if (!state) return; const choices = state.discardPile.map((instance) => `<button class="choice-row" data-recall-card="${cardUid}" data-discard-choice="${instance.uid}"><b>${definition(instance).name}</b><span>${definition(instance).rules}</span></button>`).join(''); openModal(`<div class="choice-modal"><span class="eyebrow">Recollection</span><h2>Choose a discarded spell</h2>${choices}</div>`); }
function openDiscardHandModal(): void { if (!state) return; const choices = state.hand.map((instance) => `<button class="choice-row" data-hand-discard="${instance.uid}"><b>${definition(instance).name}</b><span>${definition(instance).rules}</span></button>`).join(''); openModal(`<div class="choice-modal"><span class="eyebrow">Quick Study</span><h2>Discard one spell</h2><p>Knowledge requires editing.</p>${choices}</div>`); }
function castVisual(school: string): void { const colors: Record<string, number> = { Arcane: 0x77bfff, Evocation: 0xff7658, Warding: 0xf4d778 }; (game.scene.getScene('combat') as CombatScene | undefined)?.castEffect(colors[school] ?? 0x77bfff); }

function attemptCard(cardUid: string): void { if (!state) return; const instance = state.hand.find((item) => item.uid === cardUid); if (!instance) return; const card = definition(instance); if (card.target === 'enemy') { selection = selection?.kind === 'card' && selection.uid === cardUid ? null : { kind: 'card', uid: cardUid }; renderCombat(); return; } if (card.target === 'discard') { if (!state.discardPile.length) showToast('The discard pile is empty.'); else openDiscardModal(cardUid); return; } const result = playCard(state, cardUid); if (!result.ok) showToast(result.message ?? 'The spell fails.'); else castVisual(card.school); selection = null; renderCombat(); }
function targetEnemy(enemyUid: string): void { if (!state) return; if (!selection) { showToast('Select a targeted spell first.'); return; } if (selection.kind === 'cantrip') { const result = playCantrip(state, enemyUid); if (!result.ok) showToast(result.message ?? 'The cantrip fails.'); else castVisual('Arcane'); } else { const selectedUid = selection.uid; const instance = state.hand.find((item) => item.uid === selectedUid); const school = instance ? definition(instance).school : 'Arcane'; const result = playCard(state, selectedUid, enemyUid); if (!result.ok) showToast(result.message ?? 'The spell fails.'); else castVisual(school); } selection = null; renderCombat(); }
function finishBattle(): void { if (!activeRun || !state || state.phase !== 'victory' || !activeRun.activeNodeId) return; const nodeId = activeRun.activeNodeId; const node = activeRun.map.find((item) => item.id === nodeId); activeRun.hp = state.player.hp; activeRun.mana = Math.min(activeRun.maxMana, state.player.mana + 5); activeRun.gold += node?.type === 'elite' ? 30 : 12; completeNode(activeRun, nodeId); saveRun(activeRun); state = null; modal.close(); renderRunMap(); }

document.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
  if (button.dataset.scholar) { activeRun = createRun(button.dataset.scholar as ScholarId); saveRun(activeRun); renderRunMap(); }
  else if (button.dataset.node) chooseNode(button.dataset.node);
  else if (button.dataset.card && !button.classList.contains('book-card')) attemptCard(button.dataset.card);
  else if (button.dataset.enemy) targetEnemy(button.dataset.enemy);
  else if (button.hasAttribute('data-cantrip')) { selection = selection?.kind === 'cantrip' ? null : { kind: 'cantrip' }; renderCombat(); }
  else if (button.hasAttribute('data-ultimate') && state) { const result = playUltimate(state); if (!result.ok) showToast(result.message ?? 'The ultimate fails.'); renderCombat(); }
  else if (button.dataset.recallCard && button.dataset.discardChoice && state) { const result = playCard(state, button.dataset.recallCard, undefined, button.dataset.discardChoice); if (!result.ok) showToast(result.message ?? 'Recollection fails.'); else modal.close(); renderCombat(); }
  else if (button.dataset.handDiscard && state) { const result = resolveHandDiscard(state, button.dataset.handDiscard); if (!result.ok) showToast(result.message ?? 'Choose a spell.'); else modal.close(); renderCombat(); }
  else if (button.hasAttribute('data-complete-battle')) finishBattle();
  else if (button.hasAttribute('data-return-map')) { if (activeRun?.activeNodeId === 'golem-vault') activeRun.activeNodeId = null; if (activeRun) saveRun(activeRun); modal.close(); renderRunMap(); }
  else if (button.hasAttribute('data-new-run')) { clearRun(); activeRun = null; state = null; modal.close(); renderCharacterSelect(); }
  else if (button.hasAttribute('data-close-modal')) closeModal();
});
q<HTMLButtonElement>('#end-turn-button').addEventListener('click', () => { if (!state) return; const result = endTurn(state); if (!result.ok) showToast(result.message ?? 'The turn cannot end yet.'); selection = null; renderCombat(); });
q<HTMLButtonElement>('#spellbook-button').addEventListener('click', openSpellbook);
q<HTMLButtonElement>('#abandon-button').addEventListener('click', () => openModal('<div class="choice-modal"><span class="eyebrow">End this trail?</span><h2>Abandon Run</h2><p>This clears the saved route and returns to character selection.</p><div class="modal-actions"><button class="secondary-button" data-close-modal>Keep Going</button><button class="primary-button" data-new-run>Abandon</button></div></div>'));
window.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'e' && !modal.open && state) q<HTMLButtonElement>('#end-turn-button').click(); if (event.key.toLowerCase() === 'b' && !modal.open && activeRun) openSpellbook(); if (event.key === 'Escape') closeModal(); });

if (activeRun?.activeNodeId) { const node = activeRun.map.find((item) => item.id === activeRun!.activeNodeId); if (node?.type === 'battle' || node?.type === 'elite') startEncounter(node.type === 'elite' || node.row % 2 === 1 ? 'goblins' : 'wolves'); else { activeRun.activeNodeId = null; saveRun(activeRun); renderRunMap(); } }
else if (activeRun) renderRunMap(); else renderCharacterSelect();
