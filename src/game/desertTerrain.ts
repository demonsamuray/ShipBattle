import { getNeighborMask } from './autotile';
import { selectDesertTile, type DesertTileSelection } from './desertTileRules';
import type { IslandGrid } from './types';

export interface DesertTileCell extends DesertTileSelection {
  column: number;
  row: number;
}

export type ResolvedDesertGrid = (DesertTileCell | null)[][];

export function buildDesertTerrain(grid: IslandGrid, seed: number): ResolvedDesertGrid {
  const width = grid[0]?.length ?? 0;
  if (grid.some((row) => row.length !== width)) throw new Error('Island grid rows must all have the same width.');
  return grid.map((line, row) => line.map((isLand, column) => {
    if (!isLand) return null;
    return { column, row, ...selectDesertTile(getNeighborMask(grid, column, row), column, row, seed) };
  }));
}
