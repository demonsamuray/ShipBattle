import { getNeighborMask } from './autotile';
import { selectGrassTile, type GrassTileSelection } from './grassTileRules';
import type { IslandGrid } from './types';

export interface GrassTileCell extends GrassTileSelection {
  column: number;
  row: number;
}

export type ResolvedGrassGrid = (GrassTileCell | null)[][];

export function validateIslandGrid(grid: IslandGrid) {
  const width = grid[0]?.length ?? 0;
  if (grid.some((row) => row.length !== width)) throw new Error('Island grid rows must all have the same width.');
  if (grid.some((row) => row.some((cell) => typeof cell !== 'boolean'))) throw new Error('Island grid cells must be boolean land/water values.');
}

/** Pure generation stage: logical grid → canonical 8-neighbor masks → project atlas tiles. */
export function buildGrassTerrain(grid: IslandGrid, seed: number): ResolvedGrassGrid {
  validateIslandGrid(grid);
  return grid.map((line, row) => line.map((isLand, column) => {
    if (!isLand) return null;
    const mask = getNeighborMask(grid, column, row);
    return { column, row, ...selectGrassTile(mask, column, row, seed) };
  }));
}

/** A cell edit changes only its own 8-neighbor mask and those of adjacent cells. */
export function affectedAutotileCells(grid: IslandGrid, column: number, row: number) {
  const cells: { column: number; row: number }[] = [];
  for (let y = Math.max(0, row - 1); y <= Math.min(grid.length - 1, row + 1); y += 1) {
    const width = grid[y]?.length ?? 0;
    for (let x = Math.max(0, column - 1); x <= Math.min(width - 1, column + 1); x += 1) {
      cells.push({ column: x, row: y });
    }
  }
  return cells;
}

/** Useful when editing a grid interactively: returns only the cells to re-resolve. */
export function resolveAffectedGrassTiles(grid: IslandGrid, column: number, row: number, seed: number) {
  const resolved = buildGrassTerrain(grid, seed);
  return affectedAutotileCells(grid, column, row).map(({ column: x, row: y }) => resolved[y][x]);
}
