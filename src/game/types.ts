import type { GameSettings } from './config';

export type EnemyKind = 'chaser' | 'shooter';
export type IslandTerrain = 'forest' | 'grass' | 'desert';
export type IslandTemplateKey = 'forestL' | 'desertRectangle' | 'forestRectangle'
  | 'desertL' | 'desertLFlipped' | 'grassRectangle';
export type IslandGrid = readonly (readonly boolean[])[];

export interface GameInput {
  forward: boolean;
  reverse: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export interface VesselEntity {
  id: number;
  kind: 'player' | EnemyKind;
  x: number;
  y: number;
  rotation: number;
  health: number;
  maxHealth: number;
  collisionRadius: number;
  boundaryRadius: number;
  alive: boolean;
  fireCooldown: number;
  damageFlashSeconds: number;
  islandDamageCooldownSeconds: number;
  touchingIslandIds: number[];
  navigationTarget: { x: number; y: number } | null;
  navigationRefreshSeconds: number;
  driveDirection: 1 | -1;
  maneuverSeconds: number;
  stuckSeconds: number;
  stuckRouteAttempts: number;
  boundaryEscapeSeconds: number;
  circumnavigationIslandId: number | null;
  circumnavigationWaypoints: { x: number; y: number }[];
  circumnavigationWaypointIndex: number;
  circumnavigationDirection: -1 | 1;
  circumnavigationSteps: number;
  circumnavigationLegSeconds: number;
  stationarySeconds: number;
  islandHitCount: number;
  islandHitWindowSeconds: number;
  islandHitCooldownSeconds: number;
  islandEscapeSeconds: number;
  islandEscapeX: number;
  islandEscapeY: number;
  steeringSide: 1 | -1;
  humanErrorSeconds: number;
  humanOffsetX: number;
  humanOffsetY: number;
}

export interface ProjectileEntity {
  id: number;
  owner: 'player' | 'enemy';
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  damage: number;
  remainingSeconds: number;
  alive: boolean;
}

export interface IslandEntity {
  id: number;
  terrain: IslandTerrain;
  x: number;
  y: number;
  grid: IslandGrid;
  gridCellSize: number;
}

export interface GameState {
  settings: GameSettings;
  player: VesselEntity;
  enemies: VesselEntity[];
  projectiles: ProjectileEntity[];
  islands: IslandEntity[];
  spawnCountdown: number;
  frontFireCooldown: number;
  leftFireCooldown: number;
  rightFireCooldown: number;
  timeRemainingSeconds: number;
  score: number;
  phase: 1 | 2 | 3;
  endReason: 'time' | 'player-destroyed' | null;
  nextSpawnKind: EnemyKind;
  nextEntityId: number;
}

export interface GameSnapshot {
  score: number;
  phase: 1 | 2 | 3;
  timeRemainingSeconds: number;
  playerHealth: number;
  playerMaxHealth: number;
}

export interface MatchResult extends GameSnapshot {
  timePlayedSeconds: number;
  endReason: 'time' | 'player-destroyed';
}

export interface ImpactEffect {
  x: number;
  y: number;
  scale: number;
  rotation?: number;
  vesselId?: number;
  impulseX?: number;
  impulseY?: number;
}

export interface SimulationEvents {
  destroyedVessels: VesselEntity[];
  impacts: ImpactEffect[];
  shotsFired: ImpactEffect[];
}
