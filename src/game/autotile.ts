import type { IslandGrid } from './types';

/** Blob-autotile bit order: N, NE, E, SE, S, SW, W, NW. */
export const MASK = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;

export type TerrainShape = 'CENTER' | 'TOP_EDGE' | 'RIGHT_EDGE' | 'BOTTOM_EDGE' | 'LEFT_EDGE'
  | 'OUTER_TOP_LEFT' | 'OUTER_TOP_RIGHT' | 'OUTER_BOTTOM_LEFT' | 'OUTER_BOTTOM_RIGHT'
  | 'INNER_TOP_LEFT' | 'INNER_TOP_RIGHT' | 'INNER_BOTTOM_LEFT' | 'INNER_BOTTOM_RIGHT'
  | 'MULTIPLE_INNER_CORNERS' | 'EDGE_WITH_INNER_CORNER' | 'ISOLATED' | 'THIN_HORIZONTAL' | 'THIN_VERTICAL';

const ORTHOGONAL_MASK = MASK.N | MASK.E | MASK.S | MASK.W;

/** Removes diagonal bits unless both adjoining orthogonal cells are land. */
export function canonicalizeMask(mask: number): number {
  let result = mask & ORTHOGONAL_MASK;
  if ((mask & MASK.NE) && (result & MASK.N) && (result & MASK.E)) result |= MASK.NE;
  if ((mask & MASK.SE) && (result & MASK.S) && (result & MASK.E)) result |= MASK.SE;
  if ((mask & MASK.SW) && (result & MASK.S) && (result & MASK.W)) result |= MASK.SW;
  if ((mask & MASK.NW) && (result & MASK.N) && (result & MASK.W)) result |= MASK.NW;
  return result;
}

/** Reads an 8-neighbor mask from the logical land/water grid. Out of bounds is water. */
export function getNeighborMask(grid: IslandGrid, column: number, row: number): number {
  const isLand = (x: number, y: number) => grid[y]?.[x] === true;
  const rawMask = (isLand(column, row - 1) ? MASK.N : 0)
    | (isLand(column + 1, row - 1) ? MASK.NE : 0)
    | (isLand(column + 1, row) ? MASK.E : 0)
    | (isLand(column + 1, row + 1) ? MASK.SE : 0)
    | (isLand(column, row + 1) ? MASK.S : 0)
    | (isLand(column - 1, row + 1) ? MASK.SW : 0)
    | (isLand(column - 1, row) ? MASK.W : 0)
    | (isLand(column - 1, row - 1) ? MASK.NW : 0);
  return canonicalizeMask(rawMask);
}

const INNER_CORNERS = [
  [MASK.NW, MASK.N, MASK.W, 'NW', 'INNER_TOP_LEFT'],
  [MASK.NE, MASK.N, MASK.E, 'NE', 'INNER_TOP_RIGHT'],
  [MASK.SW, MASK.S, MASK.W, 'SW', 'INNER_BOTTOM_LEFT'],
  [MASK.SE, MASK.S, MASK.E, 'SE', 'INNER_BOTTOM_RIGHT'],
] as const;

/** Returns inward-facing water diagonals, with their matching corner overlays. */
export function innerInsetDiagonals(mask: number): ('NW' | 'NE' | 'SW' | 'SE')[] {
  const canonical = canonicalizeMask(mask);
  return INNER_CORNERS
    .filter(([diagonal, first, second]) => (canonical & first) && (canonical & second) && !(canonical & diagonal))
    .map(([, , , name]) => name);
}

export function classifyTerrainShape(mask: number): TerrainShape {
  const canonical = canonicalizeMask(mask);
  const n = !!(canonical & MASK.N), e = !!(canonical & MASK.E);
  const s = !!(canonical & MASK.S), w = !!(canonical & MASK.W);
  const corners = INNER_CORNERS.filter(([diagonal, first, second]) => (
    (canonical & first) && (canonical & second) && !(canonical & diagonal)
  ));
  const sides = Number(n) + Number(e) + Number(s) + Number(w);

  if (sides === 4) {
    if (corners.length > 1) return 'MULTIPLE_INNER_CORNERS';
    if (corners.length === 1) return corners[0][4];
    return 'CENTER';
  }
  if (sides === 3) {
    if (corners.length) return 'EDGE_WITH_INNER_CORNER';
    if (!n) return 'TOP_EDGE';
    if (!s) return 'BOTTOM_EDGE';
    if (!w) return 'LEFT_EDGE';
    return 'RIGHT_EDGE';
  }
  if (sides === 2) {
    if (n && e) return 'OUTER_BOTTOM_LEFT';
    if (n && w) return 'OUTER_BOTTOM_RIGHT';
    if (s && e) return 'OUTER_TOP_LEFT';
    if (s && w) return 'OUTER_TOP_RIGHT';
    return e && w ? 'THIN_HORIZONTAL' : 'THIN_VERTICAL';
  }
  if (sides === 1) return e || w ? 'THIN_HORIZONTAL' : 'THIN_VERTICAL';
  return 'ISOLATED';
}

/** There are exactly 47 canonical 8-neighbor masks after diagonal reduction. */
export function canonicalMasks(): number[] {
  return Array.from({ length: 256 }, (_, mask) => canonicalizeMask(mask))
    .filter((mask, index, all) => all.indexOf(mask) === index)
    .sort((first, second) => first - second);
}
