import { describe, expect, it } from 'vitest';
import { createCombat, damageEnemy, endTurn, playCantrip, playCard, playUltimate } from '../src/game/engine';
import type { CardInstance, CombatState } from '../src/game/types';

const steadyRandom = (): number => 0.42;

function card(definitionId: string, suffix = definitionId): CardInstance {
  return { uid: `test-${suffix}`, definitionId };
}

function fresh(encounter = 'wolves'): CombatState {
  return createCombat(encounter, steadyRandom);
}

describe('combat foundation', () => {
  it('starts with the agreed player resources and five drawn spells', () => {
    const state = fresh();
    expect(state.player).toMatchObject({ hp: 70, mana: 12, ap: 3 });
    expect(state.hand).toHaveLength(5);
    expect(state.drawPile).toHaveLength(5);
  });

  it('lets the bound cantrip be cast repeatedly while AP remains', () => {
    const state = fresh();
    const target = state.enemies[0];
    const startingHp = target.hp;
    expect(playCantrip(state, target.uid).ok).toBe(true);
    expect(playCantrip(state, target.uid).ok).toBe(true);
    expect(playCantrip(state, target.uid).ok).toBe(true);
    expect(playCantrip(state, target.uid).ok).toBe(false);
    expect(target.hp).toBe(startingHp - 9);
  });

  it('breaks one Armor for every five health damage and carries progress', () => {
    const state = fresh('goblins');
    const target = state.enemies[0];
    target.armor = 2;
    damageEnemy(state, target, 6);
    expect(target.hp).toBe(26);
    expect(target.armor).toBe(2);
    expect(target.armorBreak).toBe(4);
    damageEnemy(state, target, 3);
    expect(target.hp).toBe(25);
    expect(target.armor).toBe(1);
    expect(target.armorBreak).toBe(0);
  });

  it('triggers Burning at the start of an enemy turn, ignoring Armor', () => {
    const state = fresh('goblins');
    const target = state.enemies[0];
    target.armor = 3;
    target.burning = 3;
    state.player.ward = 99;
    endTurn(state, steadyRandom);
    expect(target.hp).toBe(27);
    expect(target.burning).toBe(2);
    expect(target.armorBreak).toBe(3);
  });

  it("triggers Generalist's Focus only once each turn", () => {
    const state = fresh();
    state.player.mana = 10;
    state.hand = [card('arcane-missile', 'a'), card('lesser-ward', 'b'), card('kindle', 'c')];
    const target = state.enemies[0];
    expect(playCard(state, 'test-a', target.uid, undefined, steadyRandom).ok).toBe(true);
    expect(playCard(state, 'test-b', undefined, undefined, steadyRandom).ok).toBe(true);
    expect(state.player.mana).toBe(9);
    expect(playCard(state, 'test-c', target.uid, undefined, steadyRandom).ok).toBe(true);
    expect(state.player.mana).toBe(7);
  });

  it('retains Aegis Script when the turn ends', () => {
    const state = fresh();
    state.hand = [card('aegis-script')];
    state.player.ward = 99;
    endTurn(state, steadyRandom);
    expect(state.hand.some((item) => item.definitionId === 'aegis-script')).toBe(true);
  });

  it('gives the strengthened Lesser Ward eight Ward', () => {
    const state = fresh();
    state.hand = [card('lesser-ward')];
    expect(playCard(state, 'test-lesser-ward').ok).toBe(true);
    expect(state.player.ward).toBe(8);
  });

  it('keeps the wolf pack opening at twelve incoming damage', () => {
    const state = fresh();
    endTurn(state, steadyRandom);
    expect(state.player.hp).toBe(58);
  });

  it('allows Runic Bulwark only once per battle and preserves Ward', () => {
    const state = fresh();
    state.equippedUltimateId = 'runic-bulwark';
    expect(playUltimate(state).ok).toBe(true);
    expect(state.player.ward).toBe(16);
    expect(state.player.wardPersistTurns).toBe(3);
    expect(playUltimate(state).ok).toBe(false);
    state.player.ward += 99;
    endTurn(state, steadyRandom);
    expect(state.player.wardPersistTurns).toBe(2);
    expect(state.player.ward).toBeGreaterThan(0);
  });

  it('does not grant an ultimate before the act boss is defeated', () => {
    const state = fresh();
    expect(state.equippedUltimateId).toBeNull();
    expect(playUltimate(state)).toEqual({ ok: false, message: 'No ultimate spell has been bound yet.' });
  });
});
