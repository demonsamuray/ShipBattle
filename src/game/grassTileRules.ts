import { canonicalMasks, canonicalizeMask, classifyTerrainShape, innerInsetDiagonals, MASK, type TerrainShape } from './autotile';

export interface TileDefinition {
  mask: number;
  shape: TerrainShape;
  terrainTiles: readonly number[];
  overlays: readonly number[];
}

export interface GrassTileSelection extends TileDefinition {
  tile: number;
}

const INNER_CORNER_TILE: Readonly<Record<'NW' | 'NE' | 'SE' | 'SW', number>> = {
  NW: 53,
  NE: 52,
  SE: 36,
  SW: 37,
};

export const GRASS_TILE_IDS = new Set([6, 7, 8, 9, 22, 25, 38, 39, 40, 23, 24, 54, 55, 56, 57]);
export const GRASS_OVERLAY_TILE_IDS = new Set([36, 37, 52, 53, 49, 50, 51, 65, 66, 67]);

function terrainFamilyForMask(mask: number): readonly number[] {
  const n = !!(mask & MASK.N), e = !!(mask & MASK.E);
  const s = !!(mask & MASK.S), w = !!(mask & MASK.W);
  const openSides = [!n && 'N', !e && 'E', !s && 'S', !w && 'W'].filter(Boolean);

  if (openSides.length === 1) {
    switch (openSides[0]) {
      case 'N': return [7, 8];
      case 'S': return [55, 56];
      case 'W': return [22, 38];
      case 'E': return [25];
    }
  }

  if (openSides.length === 2) {
    const pair = new Set(openSides);
    if (pair.has('N') && pair.has('W')) return [6];
    if (pair.has('N') && pair.has('E')) return [9];
    if (pair.has('S') && pair.has('W')) return [54];
    if (pair.has('S') && pair.has('E')) return [57];
  }

  // Opposing open sides, narrow tips, isolated cells, and fully surrounded
  // cells use the authored grassy center family; no geometric fill is added.
  return [39, 40, 23, 24];
}

function definitionForCanonicalMask(mask: number): TileDefinition {
  return {
    mask,
    shape: classifyTerrainShape(mask),
    terrainTiles: terrainFamilyForMask(mask),
    overlays: innerInsetDiagonals(mask).map((corner) => INNER_CORNER_TILE[corner]),
  };
}

/** Explicit canonical-mask → project tile-family lookup (47 entries). */
export const AUTOTILE_LOOKUP: Readonly<Record<number, TileDefinition>> = Object.freeze(
  Object.fromEntries(canonicalMasks().map((mask) => [mask, definitionForCanonicalMask(mask)])),
);

function stableHash(seed: number, column: number, row: number) {
  let value = (seed * 0x9e3779b1 + column * 0x85ebca6b + row * 0xc2b2ae35) | 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

export function selectGrassTile(mask: number, column: number, row: number, seed: number): GrassTileSelection {
  const canonical = canonicalizeMask(mask);
  const definition = AUTOTILE_LOOKUP[canonical] ?? definitionForCanonicalMask(canonical);
  const choices = definition.terrainTiles;
  const hash = stableHash(seed, column, row);
  const tile = choices[hash % choices.length];
  return { ...definition, tile };
}

export interface NeighborMaskAudit {
  mask: number;
  canonicalMask: number;
  shape: TerrainShape;
  tile: number;
  overlays: readonly number[];
}

/** Provides compact mask/tile diagnostics for all raw 8-bit combinations. */
export function auditAllNeighborMasks(seed = 0): NeighborMaskAudit[] {
  return Array.from({ length: 256 }, (_, mask) => {
    const selection = selectGrassTile(mask, 0, 0, seed);
    return {
      mask,
      canonicalMask: canonicalizeMask(mask),
      shape: selection.shape,
      tile: selection.tile,
      overlays: selection.overlays,
    };
  });
}

export function validateAllNeighborMasks() {
  const canonical = canonicalMasks();
  const audit = auditAllNeighborMasks();
  if (canonical.length !== 47 || Object.keys(AUTOTILE_LOOKUP).length !== 47) {
    throw new Error(`Expected 47 canonical lookup entries, found ${canonical.length}.`);
  }
  for (const entry of audit) {
    if (entry.canonicalMask !== canonicalizeMask(entry.mask)) throw new Error(`Canonical mask mismatch for ${entry.mask}.`);
    if (!GRASS_TILE_IDS.has(entry.tile)) throw new Error(`Invalid terrain tile ${entry.tile} for mask ${entry.mask}.`);
    if (entry.overlays.some((tile) => !GRASS_OVERLAY_TILE_IDS.has(tile))) {
      throw new Error(`Invalid inner-corner overlay for mask ${entry.mask}.`);
    }
  }
  return { rawMaskCount: audit.length, canonicalMaskCount: canonical.length, lookupEntryCount: Object.keys(AUTOTILE_LOOKUP).length, audit };
}
