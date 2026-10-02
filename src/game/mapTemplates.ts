import type { IslandGrid, IslandTemplateKey, IslandTerrain } from './types';

export const ISLAND_TILE_SIZE = 64;

export interface IslandTemplate {
  rows: readonly string[];
  terrain: IslandTerrain;
}

type Rectangle = { left: number; top: number; right: number; bottom: number };

function rowsFromRectangles(width: number, height: number, rectangles: readonly Rectangle[]) {
  return Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => (
    rectangles.some(({ left, top, right, bottom }) => column >= left && column <= right && row >= top && row <= bottom) ? '#' : '.'
  )).join(''));
}

function rectangleRows(width: number, height: number) {
  return rowsFromRectangles(width, height, [{ left: 0, top: 0, right: width - 1, bottom: height - 1 }]);
}

// A broad block path with four square turns. Straight legs stay level, so the
// shoreline reads as deliberate L bends instead of a sequence of humps.
const L_SHAPE = rowsFromRectangles(8, 5, [
  { left: 0, top: 0, right: 5, bottom: 1 },
  { left: 4, top: 1, right: 5, bottom: 2 },
  { left: 2, top: 2, right: 5, bottom: 3 },
  { left: 2, top: 3, right: 3, bottom: 4 },
  { left: 2, top: 3, right: 7, bottom: 4 },
]);
const FLIPPED_L_SHAPE = L_SHAPE.map((row) => [...row].reverse().join(''));

export const ISLAND_TEMPLATES: Readonly<Record<IslandTemplateKey, IslandTemplate>> = {
  forestL: { terrain: 'forest', rows: L_SHAPE },
  desertRectangle: { terrain: 'desert', rows: rectangleRows(7, 4) },
  forestRectangle: { terrain: 'forest', rows: rectangleRows(7, 4) },
  desertL: { terrain: 'desert', rows: L_SHAPE },
  desertLFlipped: { terrain: 'desert', rows: FLIPPED_L_SHAPE },
  grassRectangle: { terrain: 'grass', rows: rectangleRows(7, 4) },
};

export function getIslandTemplate(key: IslandTemplateKey) {
  return ISLAND_TEMPLATES[key];
}

export function islandGridFromRows(rows: readonly string[]): boolean[][] {
  const width = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== width)) {
    throw new Error('Island grid rows must all have the same width.');
  }
  return rows.map((row) => Array.from(row, (cell) => cell === '#'));
}

export function setIslandGridCell(grid: IslandGrid, column: number, row: number, isLand: boolean): boolean[][] {
  if (!Number.isInteger(column) || !Number.isInteger(row) || row < 0 || column < 0
    || row >= grid.length || column >= (grid[row]?.length ?? 0)) {
    throw new RangeError(`Island grid cell ${column},${row} is outside the grid.`);
  }
  const next = grid.map((line) => [...line]);
  next[row][column] = isLand;
  return next;
}
