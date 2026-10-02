import { canonicalizeMask, canonicalMasks, classifyTerrainShape, innerInsetDiagonals, MASK } from './autotile';
import type { TileDefinition } from './grassTileRules';

export interface DesertTileSelection extends TileDefinition {
  tile: number;
}

const INNER_CORNER_TILE: Readonly<Record<'NW' | 'NE' | 'SE' | 'SW', number>> = {
  NW: 21,
  NE: 20,
  SE: 4,
  SW: 5,
};

export const DESERT_TILE_IDS = new Set([1, 2, 3, 17, 18, 19, 33, 34, 35, 68, 69]);
export const DESERT_OVERLAY_TILE_IDS = new Set([21, 20, 5, 4]);

function terrainFamilyForMask(mask: number): readonly number[] {
  const n = !!(mask & MASK.N), e = !!(mask & MASK.E);
  const s = !!(mask & MASK.S), w = !!(mask & MASK.W);
  const openSides = [!n && 'N', !e && 'E', !s && 'S', !w && 'W'].filter(Boolean);

  if (openSides.length === 1) {
    switch (openSides[0]) {
      case 'N': return [2];
      case 'S': return [34];
      case 'W': return [17];
      case 'E': return [19]; // Authored right-hand vertical desert edge.
    }
  }
  if (openSides.length === 2) {
    const pair = new Set(openSides);
    if (pair.has('N') && pair.has('W')) return [1];
    if (pair.has('N') && pair.has('E')) return [3];
    if (pair.has('S') && pair.has('W')) return [33];
    if (pair.has('S') && pair.has('E')) return [35];
  }
  return [18, 68, 69];
}

function definitionForCanonicalMask(mask: number): TileDefinition {
  return {
    mask,
    shape: classifyTerrainShape(mask),
    terrainTiles: terrainFamilyForMask(mask),
    overlays: innerInsetDiagonals(mask).map((corner) => INNER_CORNER_TILE[corner]),
  };
}

/** Desert atlas equivalent of the project's 47 canonical 8-neighbor masks. */
export const DESERT_AUTOTILE_LOOKUP: Readonly<Record<number, TileDefinition>> = Object.freeze(
  Object.fromEntries(canonicalMasks().map((mask) => [mask, definitionForCanonicalMask(mask)])),
);

function stableHash(seed: number, column: number, row: number) {
  let value = (seed * 0x9e3779b1 + column * 0x85ebca6b + row * 0xc2b2ae35) | 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

export function selectDesertTile(mask: number, column: number, row: number, seed: number): DesertTileSelection {
  const canonical = canonicalizeMask(mask);
  const definition = DESERT_AUTOTILE_LOOKUP[canonical] ?? definitionForCanonicalMask(canonical);
  const hash = stableHash(seed, column, row);
  const tile = definition.terrainTiles[hash % definition.terrainTiles.length];
  return { ...definition, tile };
}

export function validateDesertTileRules() {
  const masks = canonicalMasks();
  if (masks.length !== 47 || Object.keys(DESERT_AUTOTILE_LOOKUP).length !== 47) {
    throw new Error(`Expected 47 canonical desert configurations, found ${masks.length}.`);
  }
  for (const mask of masks) {
    const definition = DESERT_AUTOTILE_LOOKUP[mask];
    for (const tile of definition.terrainTiles) {
      if (!DESERT_TILE_IDS.has(tile)) throw new Error(`Invalid desert base tile ${tile} for mask ${mask}.`);
    }
    for (const tile of definition.overlays) {
      if (!DESERT_OVERLAY_TILE_IDS.has(tile)) throw new Error(`Invalid desert corner overlay ${tile} for mask ${mask}.`);
    }
  }
}
