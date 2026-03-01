import type { MarkerRange } from './marker';

export interface AllSelection {
  mode: 'all';
}

export interface RangeSelection {
  mode: 'range';
  range: MarkerRange;
}

export type Selection = AllSelection | RangeSelection;

export const ALL_SELECTION: AllSelection = { mode: 'all' };
