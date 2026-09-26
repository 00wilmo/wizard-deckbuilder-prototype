import { describe, expect, it } from 'vitest';
import { availableNodeIds, completeNode, createRun, generateForestMap } from '../src/game/run';
import { createCombat } from '../src/game/engine';

describe('guided forest run', () => {
  it('generates a deterministic full map with fixed ruins and boss landmarks', () => {
    const first = generateForestMap(4127);
    const second = generateForestMap(4127);
    expect(first).toEqual(second);
    expect(first).toHaveLength(35);
    expect(first.find((node) => node.id === 'ancient-ruins')).toMatchObject({ row: 11, type: 'ruins' });
    expect(first.find((node) => node.id === 'golem-vault')).toMatchObject({ row: 12, type: 'boss' });
  });

  it('gives every non-boss node at least one forward connection', () => {
    const map = generateForestMap(91);
    expect(map.filter((node) => node.type !== 'boss').every((node) => node.connections.length > 0)).toBe(true);
  });

  it('begins with three choices and follows the chosen route', () => {
    const run = createRun('ilyra', 77);
    const opening = availableNodeIds(run);
    expect(opening).toHaveLength(3);
    const chosen = run.map.find((node) => node.id === opening[0])!;
    completeNode(run, chosen.id);
    expect(availableNodeIds(run)).toEqual(chosen.connections);
  });

  it('carries run health, mana, and spellbook into combat', () => {
    const run = createRun('dorian', 3);
    run.hp = 43;
    run.mana = 7;
    const combat = createCombat('wolves', () => 0.4, { hp: run.hp, mana: run.mana, deckIds: run.deck });
    expect(combat.player.hp).toBe(43);
    expect(combat.player.mana).toBe(7);
    expect([...combat.hand, ...combat.drawPile]).toHaveLength(run.deck.length);
  });
});
