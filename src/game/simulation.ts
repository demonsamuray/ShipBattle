import { circlesOverlapWrapped, distanceToIslandBoundary, findNavigableWaypoint, findSafeIslandPosition, findShortestNavigableWaypoint, getIslandPerimeterWaypoints, isNavigableDirectRoute, isProjectileOutsideArena, projectileHitsIsland, resolveVesselIslandCollision, wrappedDelta } from './collisions';
import { DEFAULT_GAME_SETTINGS, GAME_CONFIG, type GameSettings } from './config';
import type { EnemyKind, GameInput, GameState, ProjectileEntity, SimulationEvents, VesselEntity } from './types';

const EMPTY_EVENTS = (): SimulationEvents => ({ destroyedVessels: [], impacts: [], shotsFired: [] });

export function createGameState(settings: GameSettings = DEFAULT_GAME_SETTINGS): GameState {
  const { width, height } = GAME_CONFIG.arena;
  const islands = GAME_CONFIG.phaseIslands[0].map((island) => ({ ...island }));
  const spawn = findSafeIslandPosition(width / 2, height / 2, GAME_CONFIG.player.boundaryRadius, islands);
  const player: VesselEntity = {
    id: 0,
    kind: 'player',
    x: spawn.x,
    y: spawn.y,
    rotation: 0,
    health: GAME_CONFIG.player.maxHealth,
    maxHealth: GAME_CONFIG.player.maxHealth,
    collisionRadius: GAME_CONFIG.player.collisionRadius,
    boundaryRadius: GAME_CONFIG.player.boundaryRadius,
    alive: true,
    fireCooldown: 0,
    damageFlashSeconds: 0,
    islandDamageCooldownSeconds: 0,
    touchingIslandIds: [],
    navigationTarget: null,
    navigationRefreshSeconds: 0,
    driveDirection: 1,
    maneuverSeconds: 0,
    stuckSeconds: 0,
    stuckRouteAttempts: 0,
    boundaryEscapeSeconds: 0,
    circumnavigationIslandId: null,
    circumnavigationWaypoints: [],
    circumnavigationWaypointIndex: 0,
    circumnavigationDirection: 1,
    circumnavigationSteps: 0,
    circumnavigationLegSeconds: 0,
    stationarySeconds: 0,
    islandHitCount: 0,
    islandHitWindowSeconds: 0,
    islandHitCooldownSeconds: 0,
    islandEscapeSeconds: 0,
    islandEscapeX: 0,
    islandEscapeY: 0,
    steeringSide: 1,
    humanErrorSeconds: 0,
    humanOffsetX: 0,
    humanOffsetY: 0,
  };
  return {
    settings: { ...settings },
    player,
    enemies: [],
    projectiles: [],
    islands,
    spawnCountdown: settings.enemySpawnIntervalSeconds,
    frontFireCooldown: 0,
    leftFireCooldown: 0,
    rightFireCooldown: 0,
    timeRemainingSeconds: settings.sessionTimeSeconds,
    score: 0,
    phase: 1,
    endReason: null,
    nextSpawnKind: 'chaser',
    nextEntityId: 1,
  };
}

function wrapVesselPosition(vessel: VesselEntity) {
  const { width, height } = GAME_CONFIG.arena;
  const radius = vessel.boundaryRadius;
  if (vessel.kind !== 'player' && vessel.boundaryEscapeSeconds <= 0) {
    vessel.x = Math.max(radius, Math.min(width - radius, vessel.x));
    vessel.y = Math.max(radius, Math.min(height - radius, vessel.y));
    return;
  }
  let crossedScreenEdge = false;
  if (vessel.x < -radius) { vessel.x += width; crossedScreenEdge = true; }
  else if (vessel.x > width + radius) { vessel.x -= width; crossedScreenEdge = true; }
  if (vessel.y < -radius) { vessel.y += height; crossedScreenEdge = true; }
  else if (vessel.y > height + radius) { vessel.y -= height; crossedScreenEdge = true; }
  if (crossedScreenEdge && vessel.kind !== 'player') {
    vessel.boundaryEscapeSeconds = 0;
    vessel.navigationTarget = null;
    vessel.navigationRefreshSeconds = 0;
  }
}

function findOppositeEdgeRecoveryPosition(enemy: VesselEntity, state: GameState) {
  const { width, height } = GAME_CONFIG.arena;
  const margin = enemy.boundaryRadius + 4;
  const edgeLimit = enemy.boundaryRadius + GAME_CONFIG.enemyNavigation.stationaryEdgeDistance;
  const edges = [
    { distance: enemy.x, axis: 'left' as const },
    { distance: width - enemy.x, axis: 'right' as const },
    { distance: enemy.y, axis: 'top' as const },
    { distance: height - enemy.y, axis: 'bottom' as const },
  ].filter(({ distance }) => distance <= edgeLimit).sort((first, second) => first.distance - second.distance);

  for (const { axis } of edges) {
    const horizontalEdge = axis === 'left' || axis === 'right';
    const fixed = axis === 'left' ? width - margin
      : axis === 'right' ? margin
        : axis === 'top' ? height - margin
          : margin;
    const preferredTangent = horizontalEdge ? enemy.y : enemy.x;
    const tangentMax = (horizontalEdge ? height : width) - margin;
    const tangents = Array.from({ length: Math.floor((tangentMax - margin) / 24) + 1 }, (_, index) => margin + index * 24)
      .sort((first, second) => Math.abs(first - preferredTangent) - Math.abs(second - preferredTangent));

    for (const tangent of tangents) {
      const candidate = horizontalEdge
        ? { x: fixed, y: tangent }
        : { x: tangent, y: fixed };
      if (state.islands.every((island) => !resolveVesselIslandCollision(candidate.x, candidate.y, enemy.boundaryRadius, island))) {
        return candidate;
      }
    }
  }
  return null;
}

function recoverStationaryEnemyAtBoundary(enemy: VesselEntity, state: GameState) {
  const position = findOppositeEdgeRecoveryPosition(enemy, state);
  if (!position) return false;
  enemy.x = position.x;
  enemy.y = position.y;
  enemy.rotation = Math.atan2(-(state.player.x - enemy.x), state.player.y - enemy.y);
  enemy.navigationTarget = null;
  enemy.navigationRefreshSeconds = 0;
  enemy.boundaryEscapeSeconds = 0;
  enemy.driveDirection = 1;
  enemy.maneuverSeconds = 0;
  enemy.stuckSeconds = 0;
  enemy.stuckRouteAttempts = 0;
  enemy.stationarySeconds = 0;
  enemy.humanOffsetX = 0;
  enemy.humanOffsetY = 0;
  enemy.islandEscapeSeconds = 0;
  clearCircumnavigation(enemy);
  return true;
}

function enemyVessel(state: GameState, kind: EnemyKind, x: number, y: number, random: () => number): VesselEntity {
  const stats = kind === 'chaser' ? GAME_CONFIG.chaser : GAME_CONFIG.shooter;
  return {
    id: state.nextEntityId++,
    kind,
    x,
    y,
    rotation: 0,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    collisionRadius: stats.collisionRadius,
    boundaryRadius: stats.boundaryRadius,
    alive: true,
    fireCooldown: kind === 'shooter' ? GAME_CONFIG.shooter.fireIntervalSeconds * 0.65 : 0,
    damageFlashSeconds: 0,
    islandDamageCooldownSeconds: 0,
    touchingIslandIds: [],
    navigationTarget: null,
    navigationRefreshSeconds: 0,
    driveDirection: 1,
    maneuverSeconds: 0,
    stuckSeconds: 0,
    stuckRouteAttempts: 0,
    boundaryEscapeSeconds: 0,
    circumnavigationIslandId: null,
    circumnavigationWaypoints: [],
    circumnavigationWaypointIndex: 0,
    circumnavigationDirection: 1,
    circumnavigationSteps: 0,
    circumnavigationLegSeconds: 0,
    stationarySeconds: 0,
    islandHitCount: 0,
    islandHitWindowSeconds: 0,
    islandHitCooldownSeconds: 0,
    islandEscapeSeconds: 0,
    islandEscapeX: 0,
    islandEscapeY: 0,
    steeringSide: random() < 0.5 ? -1 : 1,
    humanErrorSeconds: GAME_CONFIG.enemyNavigation.mistakeCooldownMinimumSeconds
      + random() * (GAME_CONFIG.enemyNavigation.mistakeCooldownMaximumSeconds - GAME_CONFIG.enemyNavigation.mistakeCooldownMinimumSeconds),
    humanOffsetX: 0,
    humanOffsetY: 0,
  };
}

function spawnCandidate(random: () => number) {
  const { width, height } = GAME_CONFIG.arena;
  const margin = GAME_CONFIG.spawns.margin;
  const horizontalPosition = margin + random() * (width - margin * 2);
  const verticalPosition = margin + random() * (height - margin * 2);
  const edge = Math.floor(random() * 4);
  if (edge === 0) return { x: horizontalPosition, y: margin };
  if (edge === 1) return { x: width - margin, y: verticalPosition };
  if (edge === 2) return { x: horizontalPosition, y: height - margin };
  return { x: margin, y: verticalPosition };
}

function createEnemy(state: GameState, random: () => number): VesselEntity | undefined {
  const minimumDistance = GAME_CONFIG.spawns.minimumDistanceFromPlayer;
  let farthestSafeCandidate: { x: number; y: number; distance: number } | undefined;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = spawnCandidate(random);
    const distance = Math.hypot(
      wrappedDelta(candidate.x, state.player.x, GAME_CONFIG.arena.width),
      wrappedDelta(candidate.y, state.player.y, GAME_CONFIG.arena.height),
    );
    const clearOfIslands = state.islands.every((island) => !resolveVesselIslandCollision(
      candidate.x,
      candidate.y,
      GAME_CONFIG.chaser.boundaryRadius,
      island,
    ));
    if (clearOfIslands && (!farthestSafeCandidate || distance > farthestSafeCandidate.distance)) {
      farthestSafeCandidate = { ...candidate, distance };
    }
    if (clearOfIslands && distance >= minimumDistance) {
      const enemy = enemyVessel(state, state.nextSpawnKind, candidate.x, candidate.y, random);
      state.nextSpawnKind = state.nextSpawnKind === 'chaser' ? 'shooter' : 'chaser';
      return enemy;
    }
  }

  if (!farthestSafeCandidate || farthestSafeCandidate.distance < minimumDistance * 0.75) return undefined;
  const enemy = enemyVessel(state, state.nextSpawnKind, farthestSafeCandidate.x, farthestSafeCandidate.y, random);
  state.nextSpawnKind = state.nextSpawnKind === 'chaser' ? 'shooter' : 'chaser';
  return enemy;
}

function makeProjectile(
  state: GameState,
  owner: ProjectileEntity['owner'],
  x: number,
  y: number,
  directionX: number,
  directionY: number,
  damage: number,
  speed: number,
  radius: number,
  lifetimeSeconds: number,
): ProjectileEntity {
  return {
    id: state.nextEntityId++,
    owner,
    x,
    y,
    velocityX: directionX * speed,
    velocityY: directionY * speed,
    radius,
    damage,
    remainingSeconds: lifetimeSeconds,
    alive: true,
  };
}

function fireFront(state: GameState, events: SimulationEvents) {
  const { player } = state;
  const forwardX = -Math.sin(player.rotation);
  const forwardY = Math.cos(player.rotation);
  const weapon = GAME_CONFIG.weapons.front;
  const muzzleX = player.x + forwardX * GAME_CONFIG.player.frontMuzzleOffset;
  const muzzleY = player.y + forwardY * GAME_CONFIG.player.frontMuzzleOffset;
  state.projectiles.push(makeProjectile(
    state,
    'player',
    muzzleX,
    muzzleY,
    forwardX,
    forwardY,
    weapon.damage,
    weapon.speed,
    weapon.radius,
    weapon.lifetimeSeconds,
  ));
  events.shotsFired.push({
    x: muzzleX,
    y: muzzleY,
    scale: GAME_CONFIG.effects.muzzleFlashScale,
    rotation: player.rotation,
    vesselId: player.id,
    impulseX: -forwardX,
    impulseY: -forwardY,
  });
}

function fireBroadside(state: GameState, side: 'left' | 'right', events: SimulationEvents) {
  const { player } = state;
  const forwardX = -Math.sin(player.rotation);
  const forwardY = Math.cos(player.rotation);
  const sideSign = side === 'right' ? 1 : -1;
  const sideX = forwardY * sideSign;
  const sideY = -forwardX * sideSign;
  const weapon = GAME_CONFIG.weapons.broadside;
  const firstOffset = -((weapon.projectileCount - 1) * weapon.spacing) / 2;

  for (let index = 0; index < weapon.projectileCount; index += 1) {
    const alongShip = firstOffset + index * weapon.spacing;
    const muzzleX = player.x + sideX * GAME_CONFIG.player.broadsideMuzzleOffset + forwardX * alongShip;
    const muzzleY = player.y + sideY * GAME_CONFIG.player.broadsideMuzzleOffset + forwardY * alongShip;
    state.projectiles.push(makeProjectile(
      state,
      'player',
      muzzleX,
      muzzleY,
      sideX,
      sideY,
      weapon.damage,
      weapon.speed,
      weapon.radius,
      weapon.lifetimeSeconds,
    ));
    events.shotsFired.push({
      x: muzzleX,
      y: muzzleY,
      scale: GAME_CONFIG.effects.muzzleFlashScale * 0.8,
      rotation: Math.atan2(sideY, sideX),
      vesselId: player.id,
      impulseX: -sideX,
      impulseY: -sideY,
    });
  }
}

function fireShooter(state: GameState, shooter: VesselEntity, events: SimulationEvents, random: () => number) {
  const deltaX = state.player.x - shooter.x;
  const deltaY = state.player.y - shooter.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) return;
  const forwardX = -Math.sin(shooter.rotation);
  const forwardY = Math.cos(shooter.rotation);
  const targetX = deltaX / distance;
  const targetY = deltaY / distance;
  const forwardAlignment = forwardX * targetX + forwardY * targetY;
  if (forwardAlignment < Math.cos(GAME_CONFIG.shooter.frontFireArcRadians)) return;

  const aimError = (random() - 0.5) * GAME_CONFIG.shooter.aimErrorRadians;
  const aimAngle = Math.atan2(forwardY, forwardX) + aimError;
  const directionX = Math.cos(aimAngle);
  const directionY = Math.sin(aimAngle);
  const muzzleOffset = GAME_CONFIG.shooter.projectileMuzzleOffset;
  state.projectiles.push(makeProjectile(
    state,
    'enemy',
    shooter.x + directionX * muzzleOffset,
    shooter.y + directionY * muzzleOffset,
    directionX,
    directionY,
    GAME_CONFIG.shooter.projectileDamage,
    GAME_CONFIG.shooter.projectileSpeed,
    GAME_CONFIG.weapons.front.radius,
    GAME_CONFIG.weapons.front.lifetimeSeconds,
  ));
  events.shotsFired.push({
    x: shooter.x + directionX * muzzleOffset,
    y: shooter.y + directionY * muzzleOffset,
    scale: GAME_CONFIG.effects.muzzleFlashScale * 0.85,
    rotation: shooter.rotation,
    vesselId: shooter.id,
    impulseX: -directionX,
    impulseY: -directionY,
  });
  shooter.fireCooldown = GAME_CONFIG.shooter.fireIntervalSeconds;
}

function damageVessel(vessel: VesselEntity, damage: number, events: SimulationEvents) {
  if (!vessel.alive) return;
  vessel.health = Math.max(0, vessel.health - damage);
  vessel.damageFlashSeconds = 0.2;
  if (vessel.health === 0) {
    vessel.alive = false;
    events.destroyedVessels.push(vessel);
  }
}

function damageIslandContact(vessel: VesselEntity, events: SimulationEvents) {
  if (vessel.islandDamageCooldownSeconds > 0) return;
  damageVessel(vessel, GAME_CONFIG.player.islandCollisionDamage, events);
  vessel.islandDamageCooldownSeconds = GAME_CONFIG.player.islandCollisionDamageIntervalSeconds;
  events.impacts.push({ x: vessel.x, y: vessel.y, scale: GAME_CONFIG.effects.impactScale * 1.4 });
}

function resolveVesselAgainstIslands(vessel: VesselEntity, state: GameState, events: SimulationEvents) {
  const previousContacts = new Set(vessel.touchingIslandIds);
  const currentContacts = new Set<number>();
  // Keep navigation's larger hull clearance, but only register impact once the
  // rendered ship has visibly entered the shoreline.
  const islandContactRadius = Math.max(8, vessel.collisionRadius * 0.4);

  for (const island of state.islands) {
    const resolved = resolveVesselIslandCollision(vessel.x, vessel.y, islandContactRadius, island);
    if (!resolved) continue;
    vessel.x = resolved.x;
    vessel.y = resolved.y;
    currentContacts.add(island.id);

  }

  if (currentContacts.size > 0) damageIslandContact(vessel, events);

  for (const island of state.islands) {
    if (currentContacts.has(island.id) || !previousContacts.has(island.id)) continue;
    if (distanceToIslandBoundary(vessel.x, vessel.y, island)
      <= islandContactRadius * GAME_CONFIG.effects.collisionReleaseDistance) {
      currentContacts.add(island.id);
    }
  }
  vessel.touchingIslandIds = [...currentContacts];
  wrapVesselPosition(vessel);
}

function normalizeAngle(angle: number) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function rerouteStuckEnemy(enemy: VesselEntity, goalX: number, goalY: number, state: GameState) {
  enemy.steeringSide = enemy.steeringSide === 1 ? -1 : 1;
  enemy.driveDirection = 1;
  enemy.maneuverSeconds = 0;
  enemy.stuckSeconds = 0;
  enemy.stuckRouteAttempts += 1;
  if (enemy.stuckRouteAttempts >= 2) {
    enemy.boundaryEscapeSeconds = 12;
    enemy.maneuverSeconds = 2.4;
    enemy.stuckRouteAttempts = 0;
  } else {
    enemy.maneuverSeconds = 1.35;
  }
  const routeGoalX = enemy.boundaryEscapeSeconds > 0
    ? enemy.x + wrappedDelta(enemy.x, goalX, GAME_CONFIG.arena.width)
    : goalX;
  const routeGoalY = enemy.boundaryEscapeSeconds > 0
    ? enemy.y + wrappedDelta(enemy.y, goalY, GAME_CONFIG.arena.height)
    : goalY;
  enemy.navigationTarget = findNavigableWaypoint(
    enemy.x,
    enemy.y,
    routeGoalX,
    routeGoalY,
    enemy.boundaryRadius,
    state.islands,
    enemy.steeringSide,
  ) ?? null;
  enemy.navigationRefreshSeconds = GAME_CONFIG.enemyNavigation.replanIntervalSeconds;
}

function clearCircumnavigation(enemy: VesselEntity) {
  enemy.circumnavigationIslandId = null;
  enemy.circumnavigationWaypoints = [];
  enemy.circumnavigationWaypointIndex = 0;
  enemy.circumnavigationSteps = 0;
  enemy.circumnavigationLegSeconds = 0;
}

function reverseCircumnavigation(enemy: VesselEntity, state: GameState) {
  const points = enemy.circumnavigationWaypoints;
  if (points.length === 0) return false;
  enemy.circumnavigationDirection = enemy.circumnavigationDirection === 1 ? -1 : 1;
  enemy.circumnavigationWaypointIndex = (enemy.circumnavigationWaypointIndex + enemy.circumnavigationDirection + points.length) % points.length;
  const target = points[enemy.circumnavigationWaypointIndex];
  if (!isNavigableDirectRoute(enemy.x, enemy.y, target.x, target.y, enemy.boundaryRadius, state.islands)) return false;
  enemy.navigationTarget = target;
  enemy.stuckSeconds = 0;
  enemy.maneuverSeconds = 0;
  return true;
}

function startCircumnavigation(enemy: VesselEntity, island: GameState['islands'][number], state: GameState) {
  const waypoints = getIslandPerimeterWaypoints(island, enemy.boundaryRadius, state.islands);
  if (waypoints.length === 0) return false;

  const reachableStarts = waypoints
    .map((point, index) => ({
      index,
      distance: Math.hypot(point.x - enemy.x, point.y - enemy.y),
      reachable: isNavigableDirectRoute(enemy.x, enemy.y, point.x, point.y, enemy.boundaryRadius, state.islands),
    }))
    .filter((candidate) => candidate.reachable)
    .sort((first, second) => first.distance - second.distance);
  const startIndex = reachableStarts[0]?.index ?? waypoints
    .map((point, index) => ({ index, distance: Math.hypot(point.x - enemy.x, point.y - enemy.y) }))
    .sort((first, second) => first.distance - second.distance)[0]?.index;
  if (startIndex === undefined) return false;

  enemy.circumnavigationIslandId = island.id;
  enemy.circumnavigationWaypoints = waypoints;
  enemy.circumnavigationWaypointIndex = startIndex;
  enemy.circumnavigationDirection = enemy.steeringSide;
  enemy.circumnavigationSteps = 0;
  enemy.circumnavigationLegSeconds = 0;
  enemy.boundaryEscapeSeconds = 0;
  const firstTarget = waypoints[enemy.circumnavigationWaypointIndex];
  const navigationTarget = isNavigableDirectRoute(
    enemy.x,
    enemy.y,
    firstTarget.x,
    firstTarget.y,
    enemy.boundaryRadius,
    state.islands,
  ) ? firstTarget : findNavigableWaypoint(
    enemy.x,
    enemy.y,
    firstTarget.x,
    firstTarget.y,
    enemy.boundaryRadius,
    state.islands,
    enemy.circumnavigationDirection,
  );
  if (!navigationTarget) {
    clearCircumnavigation(enemy);
    return false;
  }
  enemy.navigationTarget = navigationTarget;
  enemy.rotation = Math.atan2(-(enemy.navigationTarget.x - enemy.x), enemy.navigationTarget.y - enemy.y);
  enemy.driveDirection = 1;
  enemy.maneuverSeconds = 0;
  enemy.stuckSeconds = 0;
  enemy.humanOffsetX = 0;
  enemy.humanOffsetY = 0;
  enemy.navigationRefreshSeconds = GAME_CONFIG.enemyNavigation.replanIntervalSeconds;
  return true;
}

function registerEnemyIslandHit(
  enemy: VesselEntity,
  island: GameState['islands'][number],
  attemptedX: number,
  attemptedY: number,
  state: GameState,
  speed: number,
) {
  if (enemy.islandHitCooldownSeconds > 0) return;
  enemy.islandHitCooldownSeconds = 0.32;
  if (enemy.islandHitWindowSeconds > 0) enemy.islandHitCount += 1;
  else enemy.islandHitCount = 1;
  enemy.islandHitWindowSeconds = 0.95;

  if (enemy.islandHitCount < 2) return;
  enemy.islandHitCount = 0;
  enemy.islandHitWindowSeconds = 0;

  const attemptedLength = Math.hypot(attemptedX, attemptedY) || 1;
  const opposite = { x: -attemptedX / attemptedLength, y: -attemptedY / attemptedLength };
  const candidates = [opposite, ...[-60, 60, -110, 110].map((degrees) => {
    const angle = degrees * Math.PI / 180;
    return {
      x: opposite.x * Math.cos(angle) - opposite.y * Math.sin(angle),
      y: opposite.x * Math.sin(angle) + opposite.y * Math.cos(angle),
    };
  })];
  const escapeDistance = Math.max(speed * 2.2, enemy.boundaryRadius * 4);
  const safeDirection = candidates.find((direction) => isNavigableDirectRoute(
    enemy.x,
    enemy.y,
    enemy.x + direction.x * escapeDistance,
    enemy.y + direction.y * escapeDistance,
    enemy.boundaryRadius,
    state.islands,
  )) ?? opposite;

  if (enemy.circumnavigationIslandId === null) startCircumnavigation(enemy, island, state);
  enemy.circumnavigationIslandId = island.id;
  enemy.islandEscapeX = safeDirection.x;
  enemy.islandEscapeY = safeDirection.y;
  enemy.islandEscapeSeconds = 2;
  // Keep the contour mission alive for a short leg after the two-second escape.
  enemy.circumnavigationLegSeconds = 5;
  enemy.navigationTarget = null;
  enemy.navigationRefreshSeconds = 0;
  enemy.rotation = Math.atan2(-safeDirection.x, safeDirection.y);
  enemy.driveDirection = 1;
  enemy.maneuverSeconds = 0;
  enemy.stuckSeconds = 0;
}

function reverseBeforeIslandTurn(
  enemy: VesselEntity,
  island: GameState['islands'][number],
  speed: number,
  deltaSeconds: number,
  state: GameState,
) {
  const distances = [Math.max(2, speed * deltaSeconds), Math.max(5, speed * deltaSeconds * 2), 12, 18];
  const reverseX = Math.sin(enemy.rotation);
  const reverseY = -Math.cos(enemy.rotation);
  const awayLength = Math.hypot(enemy.x - island.x, enemy.y - island.y) || 1;
  const directions = [
    { x: reverseX, y: reverseY },
    { x: (enemy.x - island.x) / awayLength, y: (enemy.y - island.y) / awayLength },
  ];
  for (const distance of distances) {
    for (const direction of directions) {
      const targetX = enemy.x + direction.x * distance;
      const targetY = enemy.y + direction.y * distance;
      if (enemy.boundaryEscapeSeconds <= 0
        && (targetX < enemy.boundaryRadius || targetX > GAME_CONFIG.arena.width - enemy.boundaryRadius
          || targetY < enemy.boundaryRadius || targetY > GAME_CONFIG.arena.height - enemy.boundaryRadius)) continue;
      if (!isNavigableDirectRoute(enemy.x, enemy.y, targetX, targetY, enemy.boundaryRadius, state.islands)) continue;
      enemy.x = targetX;
      enemy.y = targetY;
      enemy.driveDirection = -1;
      enemy.stuckSeconds = 0;
      return true;
    }
  }
  return false;
}

function findSafeCircumnavigationTarget(
  enemy: VesselEntity,
  island: GameState['islands'][number],
  state: GameState,
  speed: number,
) {
  const radialX = enemy.x - island.x;
  const radialY = enemy.y - island.y;
  const radialLength = Math.hypot(radialX, radialY) || 1;
  const tangentX = -radialY / radialLength * enemy.circumnavigationDirection;
  const tangentY = radialX / radialLength * enemy.circumnavigationDirection;
  const travelDistance = Math.max(speed * 4, enemy.boundaryRadius * 6);
  const { width, height } = GAME_CONFIG.arena;
  const candidates = Array.from({ length: 24 }, (_, index) => {
    const angle = (index - 12) * Math.PI / 12;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return {
      x: tangentX * cosine - tangentY * sine,
      y: tangentX * sine + tangentY * cosine,
      alignment: cosine,
    };
  }).sort((first, second) => second.alignment - first.alignment);

  for (const candidate of candidates) {
    // Test progressively shorter legs, but keep a useful minimum so ships do
    // not stall when a long straight run is interrupted by another island.
    for (const scale of [1, 0.75, 0.5, 0.3]) {
      const target = {
        x: enemy.x + candidate.x * travelDistance * scale,
        y: enemy.y + candidate.y * travelDistance * scale,
      };
      const crossesEdge = target.x < enemy.boundaryRadius || target.x > width - enemy.boundaryRadius
        || target.y < enemy.boundaryRadius || target.y > height - enemy.boundaryRadius;
      if (!isNavigableDirectRoute(enemy.x, enemy.y, target.x, target.y, enemy.boundaryRadius, state.islands)) continue;
      return { target, crossesEdge };
    }
  }

  // Last-resort escape still picks a verified open-water heading around the
  // island, even if it needs the screen-wrap route.
  const awayX = (enemy.x - island.x) / radialLength;
  const awayY = (enemy.y - island.y) / radialLength;
  return {
    target: { x: enemy.x + awayX * travelDistance, y: enemy.y + awayY * travelDistance },
    crossesEdge: true,
  };
}

function updateIslandCircumnavigation(enemy: VesselEntity, state: GameState, deltaSeconds: number, speed: number) {
  enemy.circumnavigationLegSeconds = Math.max(0, enemy.circumnavigationLegSeconds - deltaSeconds);
  if (enemy.islandEscapeSeconds > 0) return true;
  // Once physical contact starts the mission, visual line of sight can end it
  // after the current three-second open-water leg has completed.
  if (enemy.circumnavigationIslandId === null) return false;
  const blockingIsland = state.islands.find((candidate) => !isNavigableDirectRoute(
    enemy.x,
    enemy.y,
    state.player.x,
    state.player.y,
    1,
    [candidate],
  ));
  if (!blockingIsland && enemy.circumnavigationLegSeconds <= 0) {
    clearCircumnavigation(enemy);
    enemy.navigationTarget = null;
    enemy.navigationRefreshSeconds = 0;
    return false;
  }

  let island = blockingIsland;
  if (!island && enemy.circumnavigationLegSeconds > 0) {
    island = state.islands.find((candidate) => candidate.id === enemy.circumnavigationIslandId);
  }
  if (island && island.id !== enemy.circumnavigationIslandId) {
    clearCircumnavigation(enemy);
    if (!startCircumnavigation(enemy, island, state)) return false;
  }
  if (!island) {
    if (!blockingIsland) {
      clearCircumnavigation(enemy);
      enemy.navigationTarget = null;
      enemy.navigationRefreshSeconds = 0;
      return false;
    }
    clearCircumnavigation(enemy);
    if (!startCircumnavigation(enemy, blockingIsland, state)) {
      // Keep the state locked even if a full ring cannot be built (for example,
      // an island against the arena edge). Never fall back to charging land.
      enemy.circumnavigationIslandId = blockingIsland.id;
      enemy.circumnavigationWaypoints = getIslandPerimeterWaypoints(blockingIsland, enemy.boundaryRadius, [blockingIsland]);
      enemy.circumnavigationWaypointIndex = 0;
      enemy.navigationTarget = null;
      enemy.maneuverSeconds = 0;
      return true;
    }
    island = blockingIsland;
  }

  const currentTarget = enemy.navigationTarget;
  if (enemy.circumnavigationLegSeconds > 0 && currentTarget
    && isNavigableDirectRoute(enemy.x, enemy.y, currentTarget.x, currentTarget.y, enemy.boundaryRadius, state.islands)) {
    const remaining = Math.hypot(currentTarget.x - enemy.x, currentTarget.y - enemy.y);
    if (remaining < Math.max(18, speed * deltaSeconds * 2)) {
      const headingLength = remaining || 1;
      enemy.navigationTarget = {
        x: enemy.x + (currentTarget.x - enemy.x) / headingLength * Math.max(speed * 3, enemy.boundaryRadius * 4),
        y: enemy.y + (currentTarget.y - enemy.y) / headingLength * Math.max(speed * 3, enemy.boundaryRadius * 4),
      };
      const next = enemy.navigationTarget;
      if (!isNavigableDirectRoute(enemy.x, enemy.y, next.x, next.y, enemy.boundaryRadius, state.islands)) {
        enemy.circumnavigationLegSeconds = 0;
      } else {
        enemy.boundaryEscapeSeconds = next.x < enemy.boundaryRadius || next.x > GAME_CONFIG.arena.width - enemy.boundaryRadius
          || next.y < enemy.boundaryRadius || next.y > GAME_CONFIG.arena.height - enemy.boundaryRadius ? 12 : 0;
        return true;
      }
    } else {
      enemy.boundaryEscapeSeconds = currentTarget.x < enemy.boundaryRadius || currentTarget.x > GAME_CONFIG.arena.width - enemy.boundaryRadius
        || currentTarget.y < enemy.boundaryRadius || currentTarget.y > GAME_CONFIG.arena.height - enemy.boundaryRadius ? 12 : 0;
      return true;
    }
  }

  const safeLeg = findSafeCircumnavigationTarget(enemy, island, state, speed);
  enemy.navigationTarget = safeLeg.target;
  enemy.boundaryEscapeSeconds = safeLeg.crossesEdge ? 12 : 0;
  enemy.circumnavigationLegSeconds = 3;
  enemy.navigationRefreshSeconds = GAME_CONFIG.enemyNavigation.replanIntervalSeconds;
  return true;
}


function moveEnemy(state: GameState, enemy: VesselEntity, deltaSeconds: number, random: () => number, events: SimulationEvents) {
  enemy.islandHitWindowSeconds = Math.max(0, enemy.islandHitWindowSeconds - deltaSeconds);
  enemy.islandHitCooldownSeconds = Math.max(0, enemy.islandHitCooldownSeconds - deltaSeconds);
  enemy.islandEscapeSeconds = Math.max(0, enemy.islandEscapeSeconds - deltaSeconds);
  if (enemy.boundaryEscapeSeconds > 0) {
    enemy.boundaryEscapeSeconds = Math.max(0, enemy.boundaryEscapeSeconds - deltaSeconds);
    if (enemy.boundaryEscapeSeconds === 0) {
      enemy.navigationTarget = null;
      enemy.navigationRefreshSeconds = 0;
    }
  }

  const directX = state.player.x - enemy.x;
  const directY = state.player.y - enemy.y;
  const directDistance = Math.hypot(directX, directY);
  const clearShot = isNavigableDirectRoute(enemy.x, enemy.y, state.player.x, state.player.y, 1, state.islands);
  const targetIsScreenPassage = enemy.navigationTarget !== null
    && (enemy.navigationTarget.x < 0 || enemy.navigationTarget.x > GAME_CONFIG.arena.width
      || enemy.navigationTarget.y < 0 || enemy.navigationTarget.y > GAME_CONFIG.arena.height);
  if (clearShot && !targetIsScreenPassage) {
    enemy.boundaryEscapeSeconds = 0;
    if (enemy.circumnavigationIslandId !== null) {
      clearCircumnavigation(enemy);
      enemy.islandEscapeSeconds = 0;
      enemy.navigationTarget = null;
      enemy.navigationRefreshSeconds = 0;
    }
  }

  let useBoundaryRoute = enemy.boundaryEscapeSeconds > 0;
  const deltaX = useBoundaryRoute ? wrappedDelta(enemy.x, state.player.x, GAME_CONFIG.arena.width) : directX;
  const deltaY = useBoundaryRoute ? wrappedDelta(enemy.y, state.player.y, GAME_CONFIG.arena.height) : directY;
  const distance = Math.hypot(deltaX, deltaY);
  let goalX = enemy.x + deltaX;
  let goalY = enemy.y + deltaY;
  const speed = enemy.kind === 'chaser' ? GAME_CONFIG.chaser.speed : GAME_CONFIG.shooter.speed;

  if (enemy.kind === 'shooter' && clearShot && directDistance <= GAME_CONFIG.shooter.attackRange) {
    const aim = Math.atan2(-directX, directY);
    const turn = normalizeAngle(aim - enemy.rotation);
    enemy.rotation = normalizeAngle(enemy.rotation + Math.sign(turn)
      * Math.min(Math.abs(turn), GAME_CONFIG.shooter.turnSpeed * deltaSeconds));
    enemy.navigationTarget = null;
    enemy.navigationRefreshSeconds = 0;
    enemy.maneuverSeconds = 0;
    enemy.stuckSeconds = 0;
    return;
  }

  if (enemy.kind === 'shooter' && clearShot) {
    const preferred = GAME_CONFIG.shooter.preferredDistance;
    const radialX = deltaX / (distance || 1);
    const radialY = deltaY / (distance || 1);
    const approach = distance > preferred ? preferred * 0.68 : Math.max(90, distance - 55);
    const orbit = distance <= preferred + GAME_CONFIG.shooter.distanceTolerance ? 105 * enemy.steeringSide : 0;
    goalX = enemy.x + deltaX - radialX * approach + radialY * orbit;
    goalY = enemy.y + deltaY - radialY * approach - radialX * orbit;
  }

  enemy.humanErrorSeconds -= deltaSeconds;
  if (enemy.humanErrorSeconds <= 0) {
    enemy.humanErrorSeconds = GAME_CONFIG.enemyNavigation.mistakeCooldownMinimumSeconds
      + random() * (GAME_CONFIG.enemyNavigation.mistakeCooldownMaximumSeconds - GAME_CONFIG.enemyNavigation.mistakeCooldownMinimumSeconds);
    if (random() < GAME_CONFIG.enemyNavigation.mistakeChance) {
      const angle = random() * Math.PI * 2;
      const offset = GAME_CONFIG.enemyNavigation.mistakeOffsetMinimum
        + random() * (GAME_CONFIG.enemyNavigation.mistakeOffsetMaximum - GAME_CONFIG.enemyNavigation.mistakeOffsetMinimum);
      enemy.humanOffsetX = Math.cos(angle) * offset;
      enemy.humanOffsetY = Math.sin(angle) * offset;
      enemy.maneuverSeconds = GAME_CONFIG.enemyNavigation.maneuverMinimumSeconds
        + random() * (GAME_CONFIG.enemyNavigation.maneuverMaximumSeconds - GAME_CONFIG.enemyNavigation.maneuverMinimumSeconds);
    } else {
      enemy.humanOffsetX = 0;
      enemy.humanOffsetY = 0;
    }
  }
  goalX += enemy.humanOffsetX;
  goalY += enemy.humanOffsetY;
  if (!useBoundaryRoute) {
    goalX = Math.max(enemy.boundaryRadius, Math.min(GAME_CONFIG.arena.width - enemy.boundaryRadius, goalX));
    goalY = Math.max(enemy.boundaryRadius, Math.min(GAME_CONFIG.arena.height - enemy.boundaryRadius, goalY));
  }

  const followingPerimeter = updateIslandCircumnavigation(enemy, state, deltaSeconds, speed);
  if (followingPerimeter) {
    enemy.maneuverSeconds = 0;
    enemy.humanOffsetX = 0;
    enemy.humanOffsetY = 0;
  }

  if (followingPerimeter && enemy.islandEscapeSeconds > 0) {
    const step = speed * deltaSeconds;
    const nextX = enemy.x + enemy.islandEscapeX * step;
    const nextY = enemy.y + enemy.islandEscapeY * step;
    enemy.rotation = Math.atan2(-enemy.islandEscapeX, enemy.islandEscapeY);
    if (isNavigableDirectRoute(enemy.x, enemy.y, nextX, nextY, enemy.boundaryRadius, state.islands)) {
      enemy.x = nextX;
      enemy.y = nextY;
    } else {
      const island = state.islands.find((item) => resolveVesselIslandCollision(nextX, nextY, enemy.boundaryRadius, item));
      if (island) {
        const length = Math.hypot(enemy.x - island.x, enemy.y - island.y) || 1;
        enemy.islandEscapeX = (enemy.x - island.x) / length;
        enemy.islandEscapeY = (enemy.y - island.y) / length;
      }
    }
    return;
  }

  if (!followingPerimeter) {
    enemy.navigationRefreshSeconds = Math.max(0, enemy.navigationRefreshSeconds - deltaSeconds);
    const targetDistance = enemy.navigationTarget
      ? Math.hypot(
        useBoundaryRoute ? wrappedDelta(enemy.x, enemy.navigationTarget.x, GAME_CONFIG.arena.width) : enemy.navigationTarget.x - enemy.x,
        useBoundaryRoute ? wrappedDelta(enemy.y, enemy.navigationTarget.y, GAME_CONFIG.arena.height) : enemy.navigationTarget.y - enemy.y,
      )
      : Number.POSITIVE_INFINITY;
    if (!enemy.navigationTarget || enemy.navigationRefreshSeconds <= 0
      || targetDistance <= GAME_CONFIG.enemyNavigation.waypointArrivalDistance) {
      const directDistanceToGoal = Math.hypot(goalX - enemy.x, goalY - enemy.y);
      const wrappedDistanceToGoal = Math.hypot(
        wrappedDelta(enemy.x, goalX, GAME_CONFIG.arena.width),
        wrappedDelta(enemy.y, goalY, GAME_CONFIG.arena.height),
      );
      const wrapIsShorter = wrappedDistanceToGoal + 32 < directDistanceToGoal;
      const directSafe = !wrapIsShorter
        && isNavigableDirectRoute(enemy.x, enemy.y, goalX, goalY, enemy.boundaryRadius, state.islands);
      const pathGoalX = clearShot ? goalX : state.player.x;
      const pathGoalY = clearShot ? goalY : state.player.y;
      enemy.navigationTarget = directSafe
        ? { x: goalX, y: goalY }
        : findShortestNavigableWaypoint(enemy.x, enemy.y, pathGoalX, pathGoalY, enemy.boundaryRadius, state.islands, 32, true)
          ?? findNavigableWaypoint(enemy.x, enemy.y, pathGoalX, pathGoalY, enemy.boundaryRadius, state.islands, enemy.steeringSide)
          ?? null;
      if (enemy.navigationTarget && (enemy.navigationTarget.x < 0 || enemy.navigationTarget.x > GAME_CONFIG.arena.width
        || enemy.navigationTarget.y < 0 || enemy.navigationTarget.y > GAME_CONFIG.arena.height)) {
        enemy.boundaryEscapeSeconds = 12;
        useBoundaryRoute = true;
      }
      enemy.navigationRefreshSeconds = GAME_CONFIG.enemyNavigation.replanIntervalSeconds;
    }
  }

  if (enemy.maneuverSeconds > 0 && !followingPerimeter) {
    enemy.maneuverSeconds = Math.max(0, enemy.maneuverSeconds - deltaSeconds);
    const turnRate = enemy.kind === 'chaser' ? GAME_CONFIG.chaser.turnSpeed : GAME_CONFIG.shooter.turnSpeed;
    enemy.rotation = normalizeAngle(enemy.rotation + enemy.steeringSide * turnRate * deltaSeconds);
    const maneuverStep = speed * 0.78 * deltaSeconds * enemy.driveDirection;
    const nextX = enemy.x - Math.sin(enemy.rotation) * maneuverStep;
    const nextY = enemy.y + Math.cos(enemy.rotation) * maneuverStep;
    const island = state.islands.find((item) => resolveVesselIslandCollision(nextX, nextY, enemy.boundaryRadius, item));
    if (island) {
      damageIslandContact(enemy, events);
      reverseBeforeIslandTurn(enemy, island, speed, deltaSeconds, state);
      registerEnemyIslandHit(enemy, island, nextX - enemy.x, nextY - enemy.y, state, speed);
      enemy.stuckSeconds += deltaSeconds;
    } else {
      enemy.x = nextX;
      enemy.y = nextY;
      enemy.stuckSeconds = Math.max(0, enemy.stuckSeconds - deltaSeconds * 2);
      enemy.stuckRouteAttempts = 0;
    }
    return;
  }

  const target = enemy.navigationTarget;
  if (!target) {
    return;
  }
  const waypointX = useBoundaryRoute ? wrappedDelta(enemy.x, target.x, GAME_CONFIG.arena.width) : target.x - enemy.x;
  const waypointY = useBoundaryRoute ? wrappedDelta(enemy.y, target.y, GAME_CONFIG.arena.height) : target.y - enemy.y;
  const waypointDistance = Math.hypot(waypointX, waypointY);
  if (waypointDistance <= 0.001) return;

  const routeRotation = Math.atan2(-waypointX, waypointY);
  const targetRotation = enemy.kind === 'shooter' && clearShot && directDistance <= GAME_CONFIG.shooter.attackRange
    ? Math.atan2(-directX, directY)
    : routeRotation;
  const turnError = normalizeAngle(targetRotation - enemy.rotation);
  const turnRate = enemy.kind === 'chaser' ? GAME_CONFIG.chaser.turnSpeed : GAME_CONFIG.shooter.turnSpeed;
  enemy.rotation = normalizeAngle(enemy.rotation + Math.sign(turnError)
    * Math.min(Math.abs(turnError), turnRate * deltaSeconds));

  // Normal pursuit faces the waypoint and turns before moving. Reverse is kept
  // for collision escape/maneuver recovery, where it clears room for the turn.
  enemy.driveDirection = 1;
  if (Math.abs(normalizeAngle(targetRotation - enemy.rotation)) > GAME_CONFIG.enemyNavigation.alignmentToleranceRadians) return;
  const step = Math.min(speed * deltaSeconds, waypointDistance);
  const nextX = enemy.x - Math.sin(enemy.rotation) * step;
  const nextY = enemy.y + Math.cos(enemy.rotation) * step;
  const blockedIsland = state.islands.find((island) => resolveVesselIslandCollision(nextX, nextY, enemy.boundaryRadius, island));
  if (blockedIsland) {
    damageIslandContact(enemy, events);
    reverseBeforeIslandTurn(enemy, blockedIsland, speed, deltaSeconds, state);
    registerEnemyIslandHit(enemy, blockedIsland, nextX - enemy.x, nextY - enemy.y, state, speed);
    if (enemy.circumnavigationIslandId === null) startCircumnavigation(enemy, blockedIsland, state);
    enemy.stuckSeconds += deltaSeconds;
    if (enemy.stuckSeconds >= 0.32) {
      if (enemy.circumnavigationIslandId !== null) reverseCircumnavigation(enemy, state);
      else rerouteStuckEnemy(enemy, goalX, goalY, state);
      enemy.stuckSeconds = 0;
    }
    return;
  }

  enemy.x = nextX;
  enemy.y = nextY;
  enemy.stuckSeconds = Math.max(0, enemy.stuckSeconds - deltaSeconds * 2);
  enemy.stuckRouteAttempts = 0;
}

function updateProjectiles(state: GameState, deltaSeconds: number, events: SimulationEvents) {
  for (const projectile of state.projectiles) {
    if (!projectile.alive) continue;
    projectile.x += projectile.velocityX * deltaSeconds;
    projectile.y += projectile.velocityY * deltaSeconds;
    projectile.remainingSeconds -= deltaSeconds;

    if (projectile.remainingSeconds <= 0) {
      projectile.alive = false;
      continue;
    }

    if (isProjectileOutsideArena(projectile.x, projectile.y, projectile.radius)) {
      projectile.alive = false;
      events.impacts.push({ x: projectile.x, y: projectile.y, scale: GAME_CONFIG.effects.impactScale });
      continue;
    }

    const island = state.islands.find((obstacle) => projectileHitsIsland(
      projectile.x,
      projectile.y,
      projectile.radius,
      obstacle,
    ));
    if (island) {
      projectile.alive = false;
      events.impacts.push({ x: projectile.x, y: projectile.y, scale: GAME_CONFIG.effects.impactScale });
      continue;
    }

    const target = projectile.owner === 'player'
      ? state.enemies.find((enemy) => enemy.alive && circlesOverlapWrapped(
        projectile.x,
        projectile.y,
        projectile.radius,
        enemy.x,
        enemy.y,
        enemy.collisionRadius,
      ))
      : state.player.alive && circlesOverlapWrapped(
        projectile.x,
        projectile.y,
        projectile.radius,
        state.player.x,
        state.player.y,
        state.player.collisionRadius,
      )
        ? state.player
        : undefined;

    if (!target) continue;
    projectile.alive = false;
    damageVessel(target, projectile.damage, events);
    const projectileSpeed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
    events.impacts.push({
      x: projectile.x,
      y: projectile.y,
      scale: GAME_CONFIG.effects.impactScale,
      vesselId: target.id,
      impulseX: projectile.velocityX / projectileSpeed,
      impulseY: projectile.velocityY / projectileSpeed,
    });
    if (target.kind !== 'player' && !target.alive && projectile.owner === 'player') {
      state.score += GAME_CONFIG.player.scorePerEnemy;
      const nextPhase = Math.min(GAME_CONFIG.phases.maximum, Math.floor(state.score / GAME_CONFIG.phases.killsPerPhase) + 1) as 1 | 2 | 3;
      if (nextPhase !== state.phase) {
        state.phase = nextPhase;
        const phaseMap = GAME_CONFIG.phaseIslands[nextPhase - 1];
        state.islands = phaseMap.map((island) => ({ ...island }));
        for (const enemy of state.enemies) {
          if (!enemy.alive) continue;
          enemy.alive = false;
          events.destroyedVessels.push(enemy);
        }
        state.enemies = [];
        for (const remainingProjectile of state.projectiles) remainingProjectile.alive = false;
        state.projectiles = [];
        state.spawnCountdown = state.settings.enemySpawnIntervalSeconds;
        state.frontFireCooldown = 0;
        state.leftFireCooldown = 0;
        state.rightFireCooldown = 0;
        const safeSpawn = findSafeIslandPosition(
          GAME_CONFIG.arena.width / 2,
          GAME_CONFIG.arena.height / 2,
          state.player.boundaryRadius,
          state.islands,
        );
        state.player.x = safeSpawn.x;
        state.player.y = safeSpawn.y;
        state.player.rotation = 0;
        state.player.touchingIslandIds = [];
        state.player.navigationTarget = null;
        state.player.navigationRefreshSeconds = 0;
        state.player.stuckSeconds = 0;
      }
    }
    if (target.kind === 'player' && !target.alive) {
      state.endReason = 'player-destroyed';
      break;
    }
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.alive);
}

export function stepSimulation(
  state: GameState,
  input: GameInput,
  deltaSeconds: number,
  random: () => number = Math.random,
): SimulationEvents {
  const events = EMPTY_EVENTS();
  if (state.endReason) return events;

  state.timeRemainingSeconds = Math.max(0, state.timeRemainingSeconds - deltaSeconds);
  if (state.timeRemainingSeconds === 0) {
    state.endReason = 'time';
    return events;
  }

  const player = state.player;
  player.islandDamageCooldownSeconds = Math.max(0, player.islandDamageCooldownSeconds - deltaSeconds);
  player.damageFlashSeconds = Math.max(0, player.damageFlashSeconds - deltaSeconds);
  const turnDirection = Number(input.turnRight) - Number(input.turnLeft);
  const driveDirection = Number(input.forward) - Number(input.reverse);
  const startRotation = player.rotation;
  const angularVelocity = turnDirection * GAME_CONFIG.player.turnSpeed;
  player.rotation += angularVelocity * deltaSeconds;
  if (driveDirection !== 0) {
    const distancePerSecond = driveDirection * GAME_CONFIG.player.speed;
    if (Math.abs(angularVelocity) > 0.0001) {
      player.x += distancePerSecond * (Math.cos(player.rotation) - Math.cos(startRotation)) / angularVelocity;
      player.y += distancePerSecond * (Math.sin(player.rotation) - Math.sin(startRotation)) / angularVelocity;
    } else {
      player.x -= Math.sin(startRotation) * distancePerSecond * deltaSeconds;
      player.y += Math.cos(startRotation) * distancePerSecond * deltaSeconds;
    }
  }
  resolveVesselAgainstIslands(player, state, events);
  if (!player.alive) {
    state.endReason = 'player-destroyed';
    state.projectiles = [];
    return events;
  }

  state.frontFireCooldown = Math.max(0, state.frontFireCooldown - deltaSeconds);
  state.leftFireCooldown = Math.max(0, state.leftFireCooldown - deltaSeconds);
  state.rightFireCooldown = Math.max(0, state.rightFireCooldown - deltaSeconds);
  if (input.fireFront && state.frontFireCooldown === 0) {
    fireFront(state, events);
    state.frontFireCooldown = GAME_CONFIG.weapons.front.fireIntervalSeconds;
  }
  if (input.fireLeft && state.leftFireCooldown === 0) {
    fireBroadside(state, 'left', events);
    state.leftFireCooldown = GAME_CONFIG.weapons.broadside.fireIntervalSeconds;
  }
  if (input.fireRight && state.rightFireCooldown === 0) {
    fireBroadside(state, 'right', events);
    state.rightFireCooldown = GAME_CONFIG.weapons.broadside.fireIntervalSeconds;
  }

  state.spawnCountdown -= deltaSeconds;
  if (state.spawnCountdown <= 0) {
    const enemy = createEnemy(state, random);
    if (enemy) state.enemies.push(enemy);
    state.spawnCountdown = state.settings.enemySpawnIntervalSeconds;
  }

  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    enemy.damageFlashSeconds = Math.max(0, enemy.damageFlashSeconds - deltaSeconds);
    enemy.islandDamageCooldownSeconds = Math.max(0, enemy.islandDamageCooldownSeconds - deltaSeconds);
    if (enemy.kind === 'shooter') {
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - deltaSeconds);
    }
    const previousX = enemy.x;
    const previousY = enemy.y;
    moveEnemy(state, enemy, deltaSeconds, random, events);
    resolveVesselAgainstIslands(enemy, state, events);
    if (!enemy.alive) continue;
    const movement = Math.hypot(enemy.x - previousX, enemy.y - previousY);
    const holdingShooterPosition = enemy.kind === 'shooter'
      && Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y) <= GAME_CONFIG.shooter.attackRange
      && isNavigableDirectRoute(enemy.x, enemy.y, state.player.x, state.player.y, 1, state.islands);
    enemy.stationarySeconds = movement < 1 && !holdingShooterPosition
      ? enemy.stationarySeconds + deltaSeconds
      : 0;
    if (enemy.stationarySeconds >= GAME_CONFIG.enemyNavigation.stationaryWrapSeconds
      && recoverStationaryEnemyAtBoundary(enemy, state)) {
      resolveVesselAgainstIslands(enemy, state, events);
    }
    if (enemy.kind === 'shooter') {
      const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      const clearShot = isNavigableDirectRoute(enemy.x, enemy.y, player.x, player.y, 1, state.islands);
      if (clearShot && distance <= GAME_CONFIG.shooter.attackRange && enemy.fireCooldown === 0) {
        fireShooter(state, enemy, events, random);
      }
    }
  }

  if (state.endReason === 'player-destroyed') state.projectiles = [];
  state.enemies = state.enemies.filter((enemy) => enemy.alive);
  updateProjectiles(state, deltaSeconds, events);

  for (const enemy of state.enemies) {
    if (enemy.kind !== 'chaser' || !enemy.alive || !player.alive) continue;
    if (!circlesOverlapWrapped(player.x, player.y, player.collisionRadius, enemy.x, enemy.y, enemy.collisionRadius)) continue;
    enemy.alive = false;
    events.destroyedVessels.push(enemy);
    damageVessel(player, GAME_CONFIG.chaser.contactDamage, events);
    events.impacts.push({ x: enemy.x, y: enemy.y, scale: GAME_CONFIG.effects.impactScale * 1.4 });
    if (!player.alive) {
      state.endReason = 'player-destroyed';
      state.projectiles = [];
    }
  }

  state.enemies = state.enemies.filter((enemy) => enemy.alive);
  return events;
}
