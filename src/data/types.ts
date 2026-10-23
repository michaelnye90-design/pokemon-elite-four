// Shapes of the exported per-generation JSON in data/gen<N>/.

import type { BattleItem } from '../engine/items';
import type { EliteFourData } from './trainers';

export interface SpeciesData {
  num: number;
  id: string;
  name: string;
  types: string[];
  baseStats: Record<string, number>;
  bst: number;
  prevo: string | null;
  evos: string[];
  evolution: { method: string; level?: number; item?: string } | null;
  tags: string[];
}

export interface MoveData {
  num: number;
  id: string;
  name: string;
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  basePower: number;
  accuracy: number | true;
  pp: number;
  priority: number;
  critRatio?: number;
  damage?: number | 'level';
  multihit?: number | number[];
  ohko?: boolean;
  selfdestruct?: string | boolean;
  recoil?: number[];
}

export interface LearnEntry {
  move: string;
  method: string;
  level?: number;
}

export interface ShopItemData extends BattleItem {
  category: 'healing' | 'revive' | 'status' | 'battle' | 'held';
  price: number;
  notSoldInGame?: boolean;
}

export interface GenData {
  species: SpeciesData[];
  moves: MoveData[];
  learnsets: Record<string, LearnEntry[]>;
  types: { types: string[]; chart: Record<string, Record<string, number>> };
  items: { heldItems: boolean; items: ShopItemData[] };
  elite4: EliteFourData;
}
