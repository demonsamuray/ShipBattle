import { Texture } from 'pixi.js';
import type { ResolvedGrassGrid } from './grassTerrain';
import type { IslandAtlasTextures } from './islands';

const CENTER_TILE_IDS = new Set([39, 40, 23, 24]);
const INNER_CORNER_TILE_IDS = [52, 53, 36, 37] as const;
const PROFILE_BINS = 8;
const PROFILE_DEPTH = 8;
const HARMONIZE_BAND_RATIO = 0.20;

type Side = 'north' | 'east' | 'south' | 'west';
type LabColor = readonly [number, number, number];
interface TilePixels { image: ImageData; canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; resolution: number }
interface EdgeProfiles { north: (LabColor | null)[]; east: (LabColor | null)[]; south: (LabColor | null)[]; west: (LabColor | null)[] }

function rgbToLab(red: number, green: number, blue: number): LabColor {
  const linearize = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const r = linearize(red), g = linearize(green), b = linearize(blue);
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1.0;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function readTilePixels(texture: Texture): TilePixels | null {
  const resource = texture.source.resource as CanvasImageSource & { width?: number; height?: number };
  const resolution = texture.source.resolution;
  const width = Math.round(texture.frame.width * resolution);
  const height = Math.round(texture.frame.height * resolution);
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(
    resource,
    texture.frame.x * resolution,
    texture.frame.y * resolution,
    width,
    height,
    0,
    0,
    width,
    height,
  );
  return {
    image: context.getImageData(0, 0, width, height),
    canvas,
    context,
    resolution,
  };
}

function makeEdgeProfile(image: ImageData, side: Side): (LabColor | null)[] {
  const profile: (LabColor | null)[] = [];
  for (let bin = 0; bin < PROFILE_BINS; bin += 1) {
    let red = 0, green = 0, blue = 0, count = 0;
    const start = Math.floor(bin * (side === 'north' || side === 'south' ? image.width : image.height) / PROFILE_BINS);
    const end = Math.floor((bin + 1) * (side === 'north' || side === 'south' ? image.width : image.height) / PROFILE_BINS);
    for (let along = start; along < Math.max(start + 1, end); along += 1) {
      for (let depth = 0; depth < PROFILE_DEPTH; depth += 1) {
        const x = side === 'west' ? depth : side === 'east' ? image.width - 1 - depth : along;
        const y = side === 'north' ? depth : side === 'south' ? image.height - 1 - depth : along;
        if (x < 0 || x >= image.width || y < 0 || y >= image.height) continue;
        const index = (y * image.width + x) * 4;
        if (image.data[index + 3] < 220) continue;
        red += image.data[index]; green += image.data[index + 1]; blue += image.data[index + 2]; count += 1;
      }
    }
    profile.push(count ? rgbToLab(red / count, green / count, blue / count) : null);
  }
  return profile;
}

function makeProfiles(image: ImageData): EdgeProfiles {
  return {
    north: makeEdgeProfile(image, 'north'), east: makeEdgeProfile(image, 'east'),
    south: makeEdgeProfile(image, 'south'), west: makeEdgeProfile(image, 'west'),
  };
}

function edgeDifference(first: (LabColor | null)[], second: (LabColor | null)[]) {
  let difference = 0, samples = 0;
  for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
    const a = first[index], b = second[index];
    if (!a || !b) continue;
    difference += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    samples += 1;
  }
  return samples ? difference / samples : 0;
}

function matchingCost(firstTile: number, secondTile: number, side: Side, profiles: Map<number, EdgeProfiles>) {
  const first = profiles.get(firstTile), second = profiles.get(secondTile);
  if (!first || !second) return 0;
  const opposite: Record<Side, Side> = { north: 'south', east: 'west', south: 'north', west: 'east' };
  return edgeDifference(first[side], second[opposite[side]]);
}

function variantTieBreak(seed: number, column: number, row: number, tile: number) {
  let hash = (seed * 0x9e3779b1 + column * 0x85ebca6b + row * 0xc2b2ae35 + tile * 0x27d4eb2f) | 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffffffff * 0.02;
}

/** Chooses only among the atlas IDs already allowed by each cell's autotile rule. */
export function resolveEdgeCompatibleVariants(resolved: ResolvedGrassGrid, textures: IslandAtlasTextures, seed: number) {
  const pixels = new Map<number, TilePixels>();
  const profiles = new Map<number, EdgeProfiles>();
  for (const row of resolved) {
    for (const cell of row) {
      if (!cell) continue;
      for (const tileId of [...cell.terrainTiles, cell.tile]) {
        const texture = textures.tiles[tileId];
        if (!texture || pixels.has(tileId)) continue;
        const tilePixels = readTilePixels(texture);
        if (tilePixels) {
          pixels.set(tileId, tilePixels);
          profiles.set(tileId, makeProfiles(tilePixels.image));
        }
      }
    }
  }

  const candidates = new Map<string, number[]>();
  const key = (column: number, row: number) => `${column},${row}`;
  for (const row of resolved) {
    for (const cell of row) {
      if (!cell) continue;
      const allowed = cell.tile === 82 || cell.tile === 86
        ? [cell.tile]
        : cell.terrainTiles.filter((tileId) => profiles.has(tileId));
      candidates.set(key(cell.column, cell.row), allowed.length ? allowed : [cell.tile]);
    }
  }

  const neighbors: { dx: number; dy: number; side: Side }[] = [
    { dx: 0, dy: -1, side: 'north' }, { dx: 1, dy: 0, side: 'east' },
    { dx: 0, dy: 1, side: 'south' }, { dx: -1, dy: 0, side: 'west' },
  ];
  // Checkerboard coordinate descent lets each cell fit against stable neighbors,
  // using Lab edge colors while retaining the resolver's legal sprite families.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    for (let parity = 0; parity < 2; parity += 1) {
      for (const row of resolved) {
        for (const cell of row) {
          if (!cell || (cell.column + cell.row) % 2 !== parity) continue;
          const choices = candidates.get(key(cell.column, cell.row)) ?? [cell.tile];
          if (choices.length < 2) continue;
          let selected = cell.tile, selectedCost = Number.POSITIVE_INFINITY;
          for (const choice of choices) {
            let cost = variantTieBreak(seed, cell.column, cell.row, choice);
            for (const neighbor of neighbors) {
              const adjacent = resolved[cell.row + neighbor.dy]?.[cell.column + neighbor.dx];
              if (adjacent) cost += matchingCost(choice, adjacent.tile, neighbor.side, profiles);
            }
            if (cost < selectedCost) { selected = choice; selectedCost = cost; }
          }
          cell.tile = selected;
        }
      }
    }
  }
}

function toLinearSrgb(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function toSrgb(value: number) {
  const channel = Math.max(0, Math.min(1, value));
  return 255 * (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055);
}

/** Samples the actual seam edge into a low-frequency linear-light color profile. */
function edgeColorProfile(image: ImageData, side: Side, band: number) {
  const alongLength = side === 'east' || side === 'west' ? image.height : image.width;
  const nearEdgeDepth = Math.min(4, band);
  const profile = new Float32Array(alongLength * 3);
  for (let along = 0; along < alongLength; along += 1) {
    let red = 0, green = 0, blue = 0, count = 0;
    for (let depth = 0; depth < nearEdgeDepth; depth += 1) {
      const x = side === 'west' ? depth : side === 'east' ? image.width - 1 - depth : along;
      const y = side === 'north' ? depth : side === 'south' ? image.height - 1 - depth : along;
      const index = (y * image.width + x) * 4;
      if (image.data[index + 3] < 220) continue;
      red += toLinearSrgb(image.data[index]);
      green += toLinearSrgb(image.data[index + 1]);
      blue += toLinearSrgb(image.data[index + 2]);
      count += 1;
    }
    if (count) {
      profile[along * 3] = red / count;
      profile[along * 3 + 1] = green / count;
      profile[along * 3 + 2] = blue / count;
    }
  }
  return profile;
}

/** Gaussian low-pass profile used at two spatial scales to avoid a flat tint band. */
function gaussianSmoothProfile(profile: Float32Array, sigma: number) {
  const length = profile.length / 3;
  const radius = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, index) => {
    const distance = index - radius;
    return Math.exp(-(distance * distance) / (2 * sigma * sigma));
  });
  const smoothed = new Float32Array(profile.length);
  for (let along = 0; along < length; along += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      let sum = 0, weight = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sample = Math.max(0, Math.min(length - 1, along + offset));
        const sampleWeight = kernel[offset + radius];
        sum += profile[sample * 3 + channel] * sampleWeight;
        weight += sampleWeight;
      }
      smoothed[along * 3 + channel] = weight ? sum / weight : profile[along * 3 + channel];
    }
  }
  return smoothed;
}

/** Combines fine and broad color mismatch while leaving high-frequency art in each sprite alone. */
function multiscaleSeamDelta(first: ImageData, second: ImageData, firstSide: Side, secondSide: Side, band: number) {
  const firstProfile = edgeColorProfile(first, firstSide, band);
  const secondProfile = edgeColorProfile(second, secondSide, band);
  const length = Math.min(firstProfile.length, secondProfile.length) / 3;
  const difference = new Float32Array(length * 3);
  for (let index = 0; index < difference.length; index += 1) difference[index] = secondProfile[index] - firstProfile[index];
  const fine = gaussianSmoothProfile(difference, 1.5);
  const broad = gaussianSmoothProfile(difference, 5.5);
  const delta = new Float32Array(difference.length);
  for (let index = 0; index < delta.length; index += 1) delta[index] = (fine[index] * 0.65 + broad[index] * 0.35) * 0.5;
  return delta;
}

function addProfileCorrection(tile: TilePixels, side: Side, delta: Float32Array, direction: number, adjustment: Float32Array, band: number) {
  const { width, height, data } = tile.image;
  const alongLength = side === 'east' || side === 'west' ? height : width;
  for (let along = 0; along < alongLength; along += 1) {
    for (let depth = 0; depth < band; depth += 1) {
      const x = side === 'west' ? depth : side === 'east' ? width - 1 - depth : along;
      const y = side === 'north' ? depth : side === 'south' ? height - 1 - depth : along;
      const index = (y * width + x) * 4;
      if (data[index + 3] < 220) continue;
      const progress = 1 - depth / band;
      const falloff = progress * progress * (3 - 2 * progress);
      for (let channel = 0; channel < 3; channel += 1) {
        adjustment[index + channel] += delta[along * 3 + channel] * direction * falloff;
      }
    }
  }
}

/**
 * Harmonizes low-frequency color with a two-scale seam profile in inner-grass edge bands.
 * Alpha, tile silhouettes, coastline sprites, high-frequency detail, and pixels outside the bands stay intact.
 */
export function createEdgeHarmonizedTextures(resolved: ResolvedGrassGrid, textures: IslandAtlasTextures) {
  const tiles = new Map<string, TilePixels>();
  const adjustments = new Map<string, Float32Array>();
  const key = (column: number, row: number) => `${column},${row}`;
  for (const row of resolved) {
    for (const cell of row) {
      if (!cell || !CENTER_TILE_IDS.has(cell.tile)) continue;
      const source = textures.tiles[cell.tile];
      const base = source ? readTilePixels(source) : null;
      if (!base) continue;
      const id = key(cell.column, cell.row);
      tiles.set(id, base);
      adjustments.set(id, new Float32Array(base.image.data.length));
    }
  }

  const applySeam = (firstId: string, secondId: string, firstSide: Side, secondSide: Side) => {
    const first = tiles.get(firstId), second = tiles.get(secondId);
    const firstAdjustment = adjustments.get(firstId), secondAdjustment = adjustments.get(secondId);
    if (!first || !second || !firstAdjustment || !secondAdjustment) return;
    const band = Math.max(1, Math.round(Math.min(first.image.width, first.image.height, second.image.width, second.image.height) * HARMONIZE_BAND_RATIO));
    const delta = multiscaleSeamDelta(first.image, second.image, firstSide, secondSide, band);
    addProfileCorrection(first, firstSide, delta, 1, firstAdjustment, band);
    addProfileCorrection(second, secondSide, delta, -1, secondAdjustment, band);
  };

  for (const row of resolved) {
    for (const cell of row) {
      if (!cell || !CENTER_TILE_IDS.has(cell.tile)) continue;
      const right = resolved[cell.row]?.[cell.column + 1];
      if (right && CENTER_TILE_IDS.has(right.tile)) applySeam(key(cell.column, cell.row), key(right.column, right.row), 'east', 'west');
      const below = resolved[cell.row + 1]?.[cell.column];
      if (below && CENTER_TILE_IDS.has(below.tile)) applySeam(key(cell.column, cell.row), key(below.column, below.row), 'south', 'north');
    }
  }

  const matched = new Map<string, Texture>();
  for (const [id, tile] of tiles) {
    const adjustment = adjustments.get(id)!;
    for (let index = 0; index < tile.image.data.length; index += 4) {
      if (tile.image.data[index + 3] < 220) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const limitedAdjustment = Math.max(-0.12, Math.min(0.12, adjustment[index + channel]));
        tile.image.data[index + channel] = Math.round(toSrgb(toLinearSrgb(tile.image.data[index + channel]) + limitedAdjustment));
      }
    }
    tile.context.putImageData(tile.image, 0, 0);
    const texture = Texture.from({ resource: tile.canvas, resolution: tile.resolution }, true);
    matched.set(id, texture);
  }
  return matched;
}

/** Strongly tones down only the sand pixels of the four concave-corner sprites, blending them into the inner grass. */
export function createMutedInnerCornerTextures(textures: IslandAtlasTextures) {
  const adjusted = new Map<number, Texture>();
  for (const tileId of INNER_CORNER_TILE_IDS) {
    const source = textures.tiles[tileId];
    const tile = source ? readTilePixels(source) : null;
    if (!tile) continue;
    const { data } = tile.image;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index], green = data[index + 1], blue = data[index + 2];
      if (data[index + 3] < 220 || red < 170 || green < 130 || red < green + 12 || green < blue + 35) continue;
      data[index] = Math.round(red * 0.92);
      data[index + 1] = Math.round(green * 0.88);
      data[index + 2] = Math.round(blue * 0.83);
    }
    tile.context.putImageData(tile.image, 0, 0);
    adjusted.set(tileId, Texture.from({ resource: tile.canvas, resolution: tile.resolution }, true));
  }
  return adjusted;
}

export function destroyGeneratedTileTextures(textures: Iterable<Texture>) {
  for (const texture of textures) texture.destroy(true);
}
