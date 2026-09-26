export type School =
  | 'Arcane'
  | 'Evocation'
  | 'Warding'
  | 'Restoration'
  | 'Augury'
  | 'Glamour'
  | 'Transformation'
  | 'Thanaturgy';

export type TargetType = 'enemy' | 'self' | 'all-enemies' | 'discard';

export interface CardDefinition {
  id: string;
  name: string;
  school: School;
  ap: number;
  mana: number;
  target: TargetType;
  rules: string;
  retain?: boolean;
  exhaust?: boolean;
  art: string;
}

export interface CardInstance {
  uid: string;
  definitionId: string;
}

export type IntentKind = 'attack' | 'defend' | 'support' | 'debuff' | 'hidden';

export interface EnemyIntent {
  kind: IntentKind;
  label: string;
  amount?: number;
  block?: number;
  blind?: number;
  buffAttack?: number;
  concealed?: boolean;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  subtitle: string;
  maxHp: number;
  armor?: number;
  color: string;
  pattern: EnemyIntent[];
  packHunter?: boolean;
}

export interface EnemyState {
  uid: string;
  definitionId: string;
  name: string;
  subtitle: string;
  hp: number;
  maxHp: number;
  block: number;
  armor: number;
  armorBreak: number;
  burning: number;
  chill: number;
  attackBonus: number;
  intentIndex: number;
  pattern: EnemyIntent[];
  color: string;
  packHunter: boolean;
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  ap: number;
  maxAp: number;
  ward: number;
  armor: number;
  armorBreak: number;
  burning: number;
  blindTurns: number;
  reactiveWard: number;
  wardPersistTurns: number;
  generalistTriggered: boolean;
  previousSchool: School | null;
}

export type CombatPhase = 'player' | 'enemy' | 'victory' | 'defeat';

export interface PendingChoice {
  kind: 'discard-hand';
  count: number;
  prompt: string;
}

export interface CombatState {
  encounterId: string;
  turn: number;
  phase: CombatPhase;
  player: PlayerState;
  enemies: EnemyState[];
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  ultimateUsed: boolean;
  pendingChoice: PendingChoice | null;
  log: string[];
}

export interface EncounterDefinition {
  id: string;
  name: string;
  description: string;
  enemies: string[];
}
