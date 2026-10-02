import { Container, Sprite, Text, Texture } from 'pixi.js';
import { buildDesertTerrain } from './desertTerrain';
import { buildGrassTerrain, type ResolvedGrassGrid } from './grassTerrain';
import { createEdgeHarmonizedTextures, createMutedInnerCornerTextures, destroyGeneratedTileTextures, resolveEdgeCompatibleVariants } from './tileEdgeMatching';
import { createFortLayout, createWallLayout, validateFortLayout, validateGeneratedWallPresets, validateWallLayout } from './wallRules';
import type { IslandEntity } from './types';

export interface IslandTextures {
  tiles: Readonly<Record<number, Texture>>;
}
export type IslandAtlasTextures = IslandTextures;

export const ISLAND_PROP_TILE_IDS = [49, 50, 51, 65, 66, 67] as const;
validateGeneratedWallPresets();
const VEGETATION_TILE_IDS = [70, 71, 72] as const;
const ROCK_TILE_IDS = [49, 50, 51, 65, 66, 67] as const;
const DEBUG_LAYERS = new WeakMap<Container, Container>();
const OWNED_TEXTURES = new WeakMap<Container, Set<Texture>>();

function stableHash(seed: number, column: number, row: number) {
  let value = (seed * 0x9e3779b1 + column * 0x85ebca6b + row * 0xc2b2ae35) | 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

function addTile(layer: Container, textures: IslandTextures, tileId: number, x: number, y: number) {
  const texture = textures.tiles[tileId];
  if (!texture) throw new Error(`Missing island atlas texture tile_${tileId}.png.`);
  layer.addChild(new Sprite({ texture, x, y }));
}

function addIsland(layer: Container, island: IslandEntity, textures: IslandTextures, ownedTextures: Set<Texture>) {
  const resolved = island.terrain === 'desert'
    ? buildDesertTerrain(island.grid, island.id)
    : buildGrassTerrain(island.grid, island.id);
  const grassResolved = island.terrain === 'desert' ? null : resolved as ResolvedGrassGrid;
  if (grassResolved) resolveEdgeCompatibleVariants(grassResolved, textures, island.id);
  const matchedCenters = grassResolved ? createEdgeHarmonizedTextures(grassResolved, textures) : new Map<string, Texture>();
  const mutedCorners = createMutedInnerCornerTextures(textures);
  for (const texture of [...matchedCenters.values(), ...mutedCorners.values()]) ownedTextures.add(texture);

  const originX = island.x - (island.grid[0]?.length ?? 0) * island.gridCellSize / 2;
  const originY = island.y - island.grid.length * island.gridCellSize / 2;
  const decorationLayer = new Container();
  const wallLayer = new Container();
  const wallSegments: { column: number; row: number; tile: number }[] = [];
  let wallPlaced = false;
  for (const row of resolved) {
    for (const cell of row) {
      if (!cell) continue;
      const x = originX + cell.column * island.gridCellSize;
      const y = originY + cell.row * island.gridCellSize;
      const matched = matchedCenters.get(`${cell.column},${cell.row}`);
      if (matched) layer.addChild(new Sprite({ texture: matched, x, y }));
      else addTile(layer, textures, cell.tile, x, y);
      for (const overlayTile of cell.overlays) {
        const overlay = mutedCorners.get(overlayTile) ?? textures.tiles[overlayTile];
        if (!overlay) throw new Error(`Missing island atlas overlay tile_${overlayTile}.png.`);
        layer.addChild(new Sprite({ texture: overlay, x, y }));
      }

      const hash = stableHash(island.id, cell.column, cell.row);
      const interior = cell.shape === 'CENTER' && cell.overlays.length === 0;
      if (interior && hash % 3 === 0) {
        const tileId = island.terrain === 'desert'
          ? ROCK_TILE_IDS[(hash >>> 8) % ROCK_TILE_IDS.length]
          : VEGETATION_TILE_IDS[(hash >>> 8) % VEGETATION_TILE_IDS.length];
        const prop = textures.tiles[tileId];
        if (prop) {
          const sprite = new Sprite(prop);
          sprite.anchor.set(0.5);
          sprite.position.set(x + island.gridCellSize / 2, y + island.gridCellSize / 2);
          sprite.scale.set(island.terrain === 'desert' ? 0.68 : 0.82);
          decorationLayer.addChild(sprite);
        }
      }

      if (!wallPlaced && cell.column <= (island.grid[0]?.length ?? 0) - 3) {
        const hasStraightRun = Array.from({ length: 3 }, (_, offset) => island.grid[cell.row]?.[cell.column + offset] === true).every(Boolean);
        if (hasStraightRun) {
          const layout = createWallLayout('horizontal', cell.column, cell.row, stableHash(island.id, cell.column, cell.row));
          validateWallLayout(layout, `island-${island.id}-horizontal`);
          wallSegments.push(...layout);
          wallPlaced = true;
        }
      }
    }
  }
  const occupied = new Set(wallSegments.map(({ column, row }) => `${column},${row}`));
  const findLandFootprint = (width: number, height: number, keepGap = false) => {
    for (let row = 0; row <= island.grid.length - height; row += 1) {
      for (let column = 0; column <= (island.grid[0]?.length ?? 0) - width; column += 1) {
        const cells = Array.from({ length: width * height }, (_, index) => ({
          column: column + index % width,
          row: row + Math.floor(index / width),
        }));
        const footprint = new Set(cells.map(({ column: cellColumn, row: cellRow }) => `${cellColumn},${cellRow}`));
        const clearOfOtherWalls = !keepGap || cells.every(({ column: cellColumn, row: cellRow }) => (
          Array.from({ length: 9 }, (_, index) => ({
            column: cellColumn + index % 3 - 1,
            row: cellRow + Math.floor(index / 3) - 1,
          })).every(({ column: neighborColumn, row: neighborRow }) => (
            (neighborColumn === cellColumn && neighborRow === cellRow)
            || footprint.has(`${neighborColumn},${neighborRow}`)
            || !occupied.has(`${neighborColumn},${neighborRow}`)
          ))
        ));
        if (clearOfOtherWalls && cells.every(({ column: cellColumn, row: cellRow }) => island.grid[cellRow]?.[cellColumn] === true && !occupied.has(`${cellColumn},${cellRow}`))) {
          return { column, row, cells };
        }
      }
    }
    return null;
  };
  // At most two connected wall formations can appear on one island. The
  // second formation alternates deterministically between vertical and fort.
  const preferredKind = stableHash(island.id, 0, 0) % 2 === 0 ? 'vertical' : 'fort';
  const secondKinds = preferredKind === 'vertical' ? ['vertical', 'fort'] as const : ['fort', 'vertical'] as const;
  for (const kind of secondKinds) {
    const footprint = kind === 'vertical' ? findLandFootprint(1, 3, true) : findLandFootprint(3, 2, true);
    if (!footprint) continue;
    const layout = kind === 'vertical'
      ? createWallLayout('vertical', footprint.column, footprint.row, stableHash(island.id, footprint.column, footprint.row))
      : createFortLayout(footprint.column, footprint.row);
    if (kind === 'vertical') validateWallLayout(layout, `island-${island.id}-vertical`);
    else validateFortLayout(layout, `island-${island.id}-fort`);
    wallSegments.push(...layout);
    for (const cell of footprint.cells) occupied.add(`${cell.column},${cell.row}`);
    break;
  }
  for (const towerTile of [13, 14]) {
    const tower = findLandFootprint(1, 1, true);
    if (!tower) break;
    wallSegments.push({ column: tower.column, row: tower.row, tile: towerTile });
    occupied.add(`${tower.column},${tower.row}`);
  }
  if (wallSegments.length) {
    for (const segment of wallSegments) {
      const texture = textures.tiles[segment.tile];
      if (!texture) continue;
      wallLayer.addChild(new Sprite({
        texture,
        x: originX + segment.column * island.gridCellSize,
        y: originY + segment.row * island.gridCellSize,
      }));
    }
  }
  layer.addChild(decorationLayer);
  layer.addChild(wallLayer);
  return { resolved, originX, originY };
}

/** Renders the same logical land grids used by vessel and projectile collision. */
export function createIslandLayer(islands: readonly IslandEntity[], textures: IslandTextures) {
  const layer = new Container();
  const ownedTextures = new Set<Texture>();
  OWNED_TEXTURES.set(layer, ownedTextures);
  const debugLayer = new Container();
  debugLayer.visible = false;
  for (const island of islands) {
    const { resolved, originX, originY } = addIsland(layer, island, textures, ownedTextures);
    for (const row of resolved) {
      for (const cell of row) {
        if (!cell) continue;
        const label = new Text({
          text: `x${cell.column},y${cell.row}\nm${cell.mask} t${cell.tile}`,
          style: { fontFamily: 'monospace', fontSize: 9, fill: '#fff4c4', stroke: { color: '#17212d', width: 3 }, align: 'center' },
        });
        label.anchor.set(0.5);
        label.position.set(originX + (cell.column + 0.5) * island.gridCellSize, originY + (cell.row + 0.5) * island.gridCellSize);
        debugLayer.addChild(label);
      }
    }
  }
  layer.addChild(debugLayer);
  DEBUG_LAYERS.set(layer, debugLayer);
  return layer;
}

export function setIslandDebugVisible(layer: Container, visible: boolean) {
  const debugLayer = DEBUG_LAYERS.get(layer);
  if (debugLayer) debugLayer.visible = visible;
}

export function destroyIslandLayer(layer: Container) {
  const ownedTextures = OWNED_TEXTURES.get(layer);
  if (ownedTextures) destroyGeneratedTileTextures(ownedTextures);
  OWNED_TEXTURES.delete(layer);
  DEBUG_LAYERS.delete(layer);
  layer.destroy({ children: true, texture: false, textureSource: false });
}
