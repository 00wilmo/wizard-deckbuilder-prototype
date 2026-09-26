import { startingDeck } from './data';

export type ScholarId = 'dorian' | 'ilyra';
export type MapNodeType = 'battle' | 'elite' | 'event' | 'rest' | 'research' | 'shop' | 'ruins' | 'boss';

export interface MapNode {
  id: string;
  row: number;
  lane: number;
  type: MapNodeType;
  connections: string[];
}

export interface RunState {
  version: 1;
  seed: number;
  scholar: ScholarId;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  gold: number;
  deck: string[];
  relics: string[];
  completedNodeIds: string[];
  activeNodeId: string | null;
  map: MapNode[];
}

export const scholars = {
  dorian: { name: 'Dorian', pronouns: 'he / him' },
  ilyra: { name: 'Ilyra', pronouns: 'she / her' },
} as const;

export const nodePresentation: Record<MapNodeType, { label: string; icon: string; description: string }> = {
  battle: { label: 'Battle', icon: '⚔', description: 'A hostile presence blocks the trail.' },
  elite: { label: 'Elite', icon: '♜', description: 'A dangerous foe guards greater spoils.' },
  event: { label: 'Unknown', icon: '?', description: 'An uncertain discovery in the forest.' },
  rest: { label: 'Rest', icon: '♨', description: 'Recover health or improve a normal spell.' },
  research: { label: 'Research', icon: '⌘', description: 'Study cantrips, ultimates, or forgotten knowledge.' },
  shop: { label: 'Peddler', icon: '¤', description: 'Buy spells and relics, or forget one spell.' },
  ruins: { label: 'Ancient Ruins', icon: '⌂', description: 'All paths converge before the sealed vault.' },
  boss: { label: 'Golem Vault', icon: '⬢', description: 'The engraved guardian waits below.' },
};

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

const rowPools: MapNodeType[][] = [
  ['battle', 'battle', 'battle'],
  ['battle', 'battle', 'event'],
  ['battle', 'event', 'shop'],
  ['battle', 'elite', 'rest'],
  ['research', 'battle', 'event'],
  ['battle', 'battle', 'event'],
  ['elite', 'battle', 'shop'],
  ['rest', 'battle', 'event'],
  ['research', 'battle', 'event'],
  ['elite', 'battle', 'event'],
  ['rest', 'battle', 'shop'],
];

export function generateForestMap(seed: number): MapNode[] {
  const random = seededRandom(seed);
  const rows: MapNode[][] = rowPools.map((pool, row) => shuffle(pool, random).map((type, lane) => ({
    id: `r${row}-l${lane}`,
    row,
    lane,
    type,
    connections: [],
  })));

  for (let row = 0; row < rows.length - 1; row += 1) {
    const current = rows[row];
    const next = rows[row + 1];
    current.forEach((node) => {
      const candidates = next.filter((candidate) => Math.abs(candidate.lane - node.lane) <= 1);
      const picked = candidates.filter(() => random() > 0.38);
      node.connections = (picked.length ? picked : [candidates[Math.floor(random() * candidates.length)]]).map((item) => item.id);
    });
    next.forEach((candidate) => {
      if (!current.some((node) => node.connections.includes(candidate.id))) {
        const sources = current.filter((node) => Math.abs(node.lane - candidate.lane) <= 1);
        sources[Math.floor(random() * sources.length)].connections.push(candidate.id);
      }
    });
  }

  const ruins: MapNode = { id: 'ancient-ruins', row: 11, lane: 1, type: 'ruins', connections: ['golem-vault'] };
  const boss: MapNode = { id: 'golem-vault', row: 12, lane: 1, type: 'boss', connections: [] };
  rows[10].forEach((node) => { node.connections = [ruins.id]; });
  return [...rows.flat(), ruins, boss];
}

export function createRun(scholar: ScholarId, seed = Date.now()): RunState {
  return {
    version: 1,
    seed,
    scholar,
    hp: 70,
    maxHp: 70,
    mana: 12,
    maxMana: 12,
    gold: 50,
    deck: [...startingDeck],
    relics: ["Generalist's Focus"],
    completedNodeIds: [],
    activeNodeId: null,
    map: generateForestMap(seed),
  };
}

export function availableNodeIds(run: RunState): string[] {
  if (run.completedNodeIds.length === 0) return run.map.filter((node) => node.row === 0).map((node) => node.id);
  const lastId = run.completedNodeIds[run.completedNodeIds.length - 1];
  return run.map.find((node) => node.id === lastId)?.connections ?? [];
}

export function completeNode(run: RunState, nodeId: string): void {
  if (!run.completedNodeIds.includes(nodeId)) run.completedNodeIds.push(nodeId);
  run.activeNodeId = null;
}

const STORAGE_KEY = 'unwritten-grimoire-run-v1';

export function saveRun(run: RunState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
}

export function loadRun(): RunState | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as RunState;
    return parsed.version === 1 && Array.isArray(parsed.map) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  localStorage.removeItem(STORAGE_KEY);
}
