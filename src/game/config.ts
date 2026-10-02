import { getIslandTemplate, islandGridFromRows, ISLAND_TILE_SIZE } from './mapTemplates';
import type { IslandTemplateKey } from './types';

export interface GameSettings {
  sessionTimeSeconds: number;
  enemySpawnIntervalSeconds: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  sessionTimeSeconds: 120,
  enemySpawnIntervalSeconds: 3,
};

function tileIsland(id: number, templateKey: IslandTemplateKey, x: number, y: number) {
  const template = getIslandTemplate(templateKey);
  return {
    id,
    terrain: template.terrain,
    x,
    y,
    grid: islandGridFromRows(template.rows),
    gridCellSize: ISLAND_TILE_SIZE,
  };
}

// Compact blocks and L-shaped islands stay inside the arena with a clear channel.
const ISLAND_PHASE_ONE = [
  tileIsland(1, 'forestL', 280, 220),
  tileIsland(2, 'desertRectangle', 990, 520),
];
const ISLAND_PHASE_TWO = [
  tileIsland(11, 'forestRectangle', 280, 520),
  tileIsland(12, 'desertL', 1000, 220),
];
const ISLAND_PHASE_THREE = [
  tileIsland(21, 'desertLFlipped', 280, 220),
  tileIsland(22, 'grassRectangle', 990, 520),
];

const PHASE_ISLANDS = [ISLAND_PHASE_ONE, ISLAND_PHASE_TWO, ISLAND_PHASE_THREE] as const;

export const GAME_CONFIG = {
  arena: {
    width: 1280,
    height: 720,
  },
  simulation: {
    maxDeltaSeconds: 0.05,
  },
  player: {
    maxHealth: 100,
    speed: 230,
    turnSpeed: 2.6,
    collisionRadius: 36,
    // Circumscribed safety radius for the 66x113 ship sprite at 1.15 scale,
    // including wave bob and recoil offset. Navigation clears the whole hull.
    boundaryRadius: 84,
    frontMuzzleOffset: 70,
    broadsideMuzzleOffset: 42,
    islandCollisionDamage: 12,
    islandCollisionDamageIntervalSeconds: 0.75,
    scorePerEnemy: 1,
  },
  chaser: {
    maxHealth: 50,
    speed: 78,
    turnSpeed: 1.75,
    collisionRadius: 34,
    boundaryRadius: 84,
    contactDamage: 20,
  },
  shooter: {
    maxHealth: 50,
    speed: 64,
    turnSpeed: 1.45,
    collisionRadius: 34,
    boundaryRadius: 84,
    preferredDistance: 225,
    distanceTolerance: 35,
    attackRange: 440,
    projectileDamage: 12,
    projectileSpeed: 330,
    aimErrorRadians: 0.18,
    frontFireArcRadians: 0.34,
    projectileMuzzleOffset: 82,
    fireIntervalSeconds: 1.35,
  },
  spawns: {
    minimumDistanceFromPlayer: 260,
    margin: 100,
  },
  enemyNavigation: {
    waypointArrivalDistance: 28,
    waypointClearance: 8,
    pathSampleDistance: 24,
    replanIntervalSeconds: 0.45,
    alignmentToleranceRadians: 0.34,
    reverseTurnAdvantageRadians: 0.16,
    mistakeChance: 0.14,
    mistakeOffsetMinimum: 12,
    mistakeOffsetMaximum: 45,
    mistakeCooldownMinimumSeconds: 4,
    mistakeCooldownMaximumSeconds: 8,
    maneuverMinimumSeconds: 0.4,
    maneuverMaximumSeconds: 0.7,
    stationaryWrapSeconds: 5,
    stationaryEdgeDistance: 56,
  },
  phases: {
    killsPerPhase: 10,
    maximum: 3,
  },
  weapons: {
    front: {
      damage: 25,
      speed: 520,
      radius: 7,
      lifetimeSeconds: 3,
      fireIntervalSeconds: 0.24,
    },
    broadside: {
      projectileCount: 3,
      damage: 25,
      speed: 460,
      radius: 7,
      lifetimeSeconds: 3,
      spacing: 24,
      fireIntervalSeconds: 0.65,
    },
  },
  session: {
    minimumTimeSeconds: 60,
    maximumTimeSeconds: 180,
  },
  islands: ISLAND_PHASE_ONE,
  phaseIslands: PHASE_ISLANDS,
  healthBar: {
    width: 54,
    height: 7,
    verticalOffset: 17,
  },
  effects: {
    explosionLifetimeSeconds: 0.38,
    explosionScale: 0.8,
    impactLifetimeSeconds: 0.22,
    impactScale: 0.32,
    muzzleFlashLifetimeSeconds: 0.12,
    muzzleFlashScale: 0.48,
    collisionReleaseDistance: 1.035,
  },
  seaTileScale: 1,
} as const;
