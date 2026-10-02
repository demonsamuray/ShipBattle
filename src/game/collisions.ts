import { GAME_CONFIG } from './config';
import { ISLAND_TILE_SIZE } from './mapTemplates';
import type { IslandEntity } from './types';

export function circlesOverlap(
  firstX: number,
  firstY: number,
  firstRadius: number,
  secondX: number,
  secondY: number,
  secondRadius: number,
): boolean {
  const deltaX = firstX - secondX;
  const deltaY = firstY - secondY;
  const combinedRadius = firstRadius + secondRadius;
  return deltaX * deltaX + deltaY * deltaY <= combinedRadius * combinedRadius;
}

export function wrappedDelta(from: number, to: number, span: number): number {
  const delta = to - from;
  return delta - Math.round(delta / span) * span;
}

export function circlesOverlapWrapped(
  firstX: number,
  firstY: number,
  firstRadius: number,
  secondX: number,
  secondY: number,
  secondRadius: number,
): boolean {
  const deltaX = wrappedDelta(firstX, secondX, GAME_CONFIG.arena.width);
  const deltaY = wrappedDelta(firstY, secondY, GAME_CONFIG.arena.height);
  const combinedRadius = firstRadius + secondRadius;
  return deltaX * deltaX + deltaY * deltaY <= combinedRadius * combinedRadius;
}

export function isProjectileOutsideArena(x: number, y: number, radius: number): boolean {
  return x - radius <= 0
    || x + radius >= GAME_CONFIG.arena.width
    || y - radius <= 0
    || y + radius >= GAME_CONFIG.arena.height;
}

function islandOrigin(island: IslandEntity) {
  const cellSize = island.gridCellSize ?? ISLAND_TILE_SIZE;
  return {
    x: island.x - (island.grid[0]?.length ?? 0) * cellSize / 2,
    y: island.y - island.grid.length * cellSize / 2,
  };
}

function landCellRect(island: IslandEntity, row: number, column: number) {
  const origin = islandOrigin(island);
  const cellSize = island.gridCellSize ?? ISLAND_TILE_SIZE;
  const left = origin.x + column * cellSize;
  const top = origin.y + row * cellSize;
  const halfTile = cellSize / 2;
  const minimumLandSpan = Math.min(8, cellSize);
  let rectLeft = left + (!island.grid[row]?.[column - 1] ? halfTile : 0);
  let rectRight = left + cellSize - (!island.grid[row]?.[column + 1] ? halfTile : 0);
  let rectTop = top + (!island.grid[row - 1]?.[column] ? halfTile : 0);
  let rectBottom = top + cellSize - (!island.grid[row + 1]?.[column] ? halfTile : 0);

  if (rectRight - rectLeft < minimumLandSpan) {
    rectLeft = left + (cellSize - minimumLandSpan) / 2;
    rectRight = rectLeft + minimumLandSpan;
  }
  if (rectBottom - rectTop < minimumLandSpan) {
    rectTop = top + (cellSize - minimumLandSpan) / 2;
    rectBottom = rectTop + minimumLandSpan;
  }

  return { left: rectLeft, top: rectTop, right: rectRight, bottom: rectBottom };
}

function landCellsInBounds(island: IslandEntity, left: number, top: number, right: number, bottom: number) {
  const origin = islandOrigin(island);
  const cellSize = island.gridCellSize ?? ISLAND_TILE_SIZE;
  const width = island.grid[0]?.length ?? 0;
  const firstColumn = Math.max(0, Math.floor((left - origin.x) / cellSize));
  const lastColumn = Math.min(width - 1, Math.floor((right - origin.x) / cellSize));
  const firstRow = Math.max(0, Math.floor((top - origin.y) / cellSize));
  const lastRow = Math.min(island.grid.length - 1, Math.floor((bottom - origin.y) / cellSize));
  const cells: { column: number; row: number; left: number; top: number; right: number; bottom: number }[] = [];

  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      if (!island.grid[row]?.[column]) continue;
      cells.push({ column, row, ...landCellRect(island, row, column) });
    }
  }
  return cells;
}

function circleIntersectsRect(x: number, y: number, radius: number, rect: { left: number; top: number; right: number; bottom: number }) {
  const closestX = Math.max(rect.left, Math.min(rect.right, x));
  const closestY = Math.max(rect.top, Math.min(rect.bottom, y));
  const deltaX = x - closestX;
  const deltaY = y - closestY;
  return deltaX * deltaX + deltaY * deltaY < radius * radius;
}

function resolveCircleAgainstRect(
  x: number,
  y: number,
  radius: number,
  rect: { left: number; top: number; right: number; bottom: number },
) {
  const closestX = Math.max(rect.left, Math.min(rect.right, x));
  const closestY = Math.max(rect.top, Math.min(rect.bottom, y));
  let deltaX = x - closestX;
  let deltaY = y - closestY;
  let distance = Math.hypot(deltaX, deltaY);
  if (distance >= radius) return undefined;

  if (distance < 0.001) {
    const exits = [
      { distance: x - rect.left, x: -1, y: 0, position: rect.left - radius },
      { distance: rect.right - x, x: 1, y: 0, position: rect.right + radius },
      { distance: y - rect.top, x: 0, y: -1, position: rect.top - radius },
      { distance: rect.bottom - y, x: 0, y: 1, position: rect.bottom + radius },
    ].sort((first, second) => first.distance - second.distance);
    const exit = exits[0];
    return exit.x ? { x: exit.position, y } : { x, y: exit.position };
  }

  deltaX /= distance;
  deltaY /= distance;
  distance = radius - distance;
  return { x: x + deltaX * distance, y: y + deltaY * distance };
}

/** Ship collision resolves against occupied logical grid cells (water cells never collide). */
export function resolveVesselIslandCollision(
  x: number,
  y: number,
  vesselRadius: number,
  island: IslandEntity,
): { x: number; y: number } | undefined {
  let resolvedX = x;
  let resolvedY = y;
  let collided = false;

  for (let pass = 0; pass < 3; pass += 1) {
    const cells = landCellsInBounds(island, resolvedX - vesselRadius, resolvedY - vesselRadius, resolvedX + vesselRadius, resolvedY + vesselRadius);
    let corrected = false;
    for (const cell of cells) {
      const result = resolveCircleAgainstRect(resolvedX, resolvedY, vesselRadius, cell);
      if (!result) continue;
      resolvedX = result.x;
      resolvedY = result.y;
      corrected = true;
      collided = true;
    }
    if (!corrected) break;
  }
  return collided ? { x: resolvedX, y: resolvedY } : undefined;
}

export function projectileHitsIsland(x: number, y: number, radius: number, island: IslandEntity): boolean {
  return landCellsInBounds(island, x - radius, y - radius, x + radius, y + radius)
    .some((cell) => circleIntersectsRect(x, y, radius, cell));
}

export function distanceToIslandBoundary(x: number, y: number, island: IslandEntity) {
  const width = island.grid[0]?.length ?? 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let row = 0; row < island.grid.length; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (!island.grid[row]?.[column]) continue;
      const rect = landCellRect(island, row, column);
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      nearestDistance = Math.min(nearestDistance, Math.hypot(dx, dy));
    }
  }
  return nearestDistance;
}

function boundaryWaypoints(island: IslandEntity, clearance: number) {
  const width = island.grid[0]?.length ?? 0;
  const candidates: { x: number; y: number }[] = [];
  const add = (x: number, y: number, dx: number, dy: number) => {
    const candidate = { x: x + dx * clearance, y: y + dy * clearance };
    if (resolveVesselIslandCollision(candidate.x, candidate.y, 0.5, island)) return;
    candidates.push(candidate);
  };

  for (let row = 0; row < island.grid.length; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (!island.grid[row]?.[column]) continue;
      const rect = landCellRect(island, row, column);
      const middleX = (rect.left + rect.right) / 2;
      const middleY = (rect.top + rect.bottom) / 2;
      if (!island.grid[row - 1]?.[column]) add(middleX, rect.top, 0, -1);
      if (!island.grid[row]?.[column + 1]) add(rect.right, middleY, 1, 0);
      if (!island.grid[row + 1]?.[column]) add(middleX, rect.bottom, 0, 1);
      if (!island.grid[row]?.[column - 1]) add(rect.left, middleY, -1, 0);
    }
  }
  return candidates;
}

function clearRoute(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  vesselRadius: number,
  islands: readonly IslandEntity[],
) {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const samples = Math.max(1, Math.ceil(distance / GAME_CONFIG.enemyNavigation.pathSampleDistance));
  for (let index = 1; index <= samples; index += 1) {
    const progress = index / samples;
    const x = fromX + (toX - fromX) * progress;
    const y = fromY + (toY - fromY) * progress;
    if (islands.some((island) => resolveVesselIslandCollision(x, y, vesselRadius, island))) return false;
  }
  return true;
}

export function isNavigableDirectRoute(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  vesselRadius: number,
  islands: readonly IslandEntity[],
) {
  return clearRoute(fromX, fromY, toX, toY, vesselRadius, islands);
}

/** Creates a safe loop around an island's actual land footprint for wall-following. */
export function getIslandPerimeterWaypoints(
  island: IslandEntity,
  vesselRadius: number,
  islands: readonly IslandEntity[],
) {
  const width = island.grid[0]?.length ?? 0;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < island.grid.length; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (!island.grid[row]?.[column]) continue;
      const rect = landCellRect(island, row, column);
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
  }
  if (!Number.isFinite(left)) return [];

  const { width: arenaWidth, height: arenaHeight } = GAME_CONFIG.arena;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  for (let expansion = 0; expansion <= 3; expansion += 1) {
    const padding = vesselRadius + GAME_CONFIG.enemyNavigation.waypointClearance + expansion * 24;
    const routeLeft = left - padding;
    const routeRight = right + padding;
    const routeTop = top - padding;
    const routeBottom = bottom + padding;
    const points = [
      { x: centerX, y: routeTop },
      { x: routeRight, y: routeTop },
      { x: routeRight, y: centerY },
      { x: routeRight, y: routeBottom },
      { x: centerX, y: routeBottom },
      { x: routeLeft, y: routeBottom },
      { x: routeLeft, y: centerY },
      { x: routeLeft, y: routeTop },
    ];
    if (points.some((point) => point.x < vesselRadius || point.x > arenaWidth - vesselRadius
      || point.y < vesselRadius || point.y > arenaHeight - vesselRadius)) continue;
    const allSegmentsClear = points.every((point, index) => {
      const next = points[(index + 1) % points.length];
      return clearRoute(point.x, point.y, next.x, next.y, vesselRadius, islands);
    });
    if (allSegmentsClear) return points;
  }
  // A rectangular loop may not fit beside islands near the arena boundary.
  // In that case, follow the exposed cell edges instead of abandoning the
  // circumnavigation mission.
  const clearance = vesselRadius + GAME_CONFIG.enemyNavigation.waypointClearance;
  return boundaryWaypoints(island, clearance)
    .filter((point) => point.x >= vesselRadius && point.x <= arenaWidth - vesselRadius
      && point.y >= vesselRadius && point.y <= arenaHeight - vesselRadius
      && islands.every((obstacle) => !resolveVesselIslandCollision(point.x, point.y, vesselRadius, obstacle)))
    .sort((first, second) => Math.atan2(first.y - centerY, first.x - centerX)
      - Math.atan2(second.y - centerY, second.x - centerX));
}

/** Routes around the exposed edges of occupied cells, without polygon outlines. */
export function findNavigableWaypoint(
  fromX: number,
  fromY: number,
  goalX: number,
  goalY: number,
  vesselRadius: number,
  islands: readonly IslandEntity[],
  preferredSide: -1 | 1 = 1,
) {
  if (clearRoute(fromX, fromY, goalX, goalY, vesselRadius, islands)) return { x: goalX, y: goalY };

  const { width, height } = GAME_CONFIG.arena;
  const clearance = vesselRadius + GAME_CONFIG.enemyNavigation.waypointClearance;
  let bestWaypoint: { x: number; y: number; cost: number } | undefined;
  let bestFallback: { x: number; y: number; cost: number } | undefined;

  for (const island of islands) {
    for (const candidate of boundaryWaypoints(island, clearance)) {
      if (candidate.x < vesselRadius || candidate.x > width - vesselRadius
        || candidate.y < vesselRadius || candidate.y > height - vesselRadius) continue;
      if (islands.some((obstacle) => resolveVesselIslandCollision(candidate.x, candidate.y, vesselRadius, obstacle))) continue;
      if (!clearRoute(fromX, fromY, candidate.x, candidate.y, vesselRadius, islands)) continue;
      const distanceToGoal = Math.hypot(goalX - candidate.x, goalY - candidate.y);
      const routeCross = (goalX - fromX) * (candidate.y - fromY) - (goalY - fromY) * (candidate.x - fromX);
      const candidateSide = Math.sign(routeCross);
      const sidePenalty = candidateSide !== 0 && candidateSide !== preferredSide ? clearance * 0.75 : 0;
      const cost = Math.hypot(candidate.x - fromX, candidate.y - fromY) + distanceToGoal + sidePenalty;
      if (!bestFallback || cost < bestFallback.cost) bestFallback = { ...candidate, cost };
      if (clearRoute(candidate.x, candidate.y, goalX, goalY, vesselRadius, islands)
        && (!bestWaypoint || cost < bestWaypoint.cost)) {
        bestWaypoint = { ...candidate, cost };
      }
    }
  }

  const waypoint = bestWaypoint ?? bestFallback;
  return waypoint ? { x: waypoint.x, y: waypoint.y } : undefined;
}

/** Finds the closest point whose full vessel clearance radius is in water. */
export function findSafeIslandPosition(
  preferredX: number,
  preferredY: number,
  vesselRadius: number,
  islands: readonly IslandEntity[],
) {
  const { width, height } = GAME_CONFIG.arena;
  const step = 24;
  const candidates: { x: number; y: number; distance: number }[] = [];
  for (let y = vesselRadius; y <= height - vesselRadius; y += step) {
    for (let x = vesselRadius; x <= width - vesselRadius; x += step) {
      candidates.push({ x, y, distance: (x - preferredX) ** 2 + (y - preferredY) ** 2 });
    }
  }
  candidates.sort((first, second) => first.distance - second.distance);
  const safe = candidates.find(({ x, y }) => islands.every((island) => (
    !resolveVesselIslandCollision(x, y, vesselRadius, island)
  )));
  return safe ? { x: safe.x, y: safe.y } : { x: preferredX, y: preferredY };
}

/** Finds a shortest safe waypoint, with optional screen-wrap links and a closest-reachable fallback. */
export function findShortestNavigableWaypoint(
  fromX: number,
  fromY: number,
  goalX: number,
  goalY: number,
  vesselRadius: number,
  islands: readonly IslandEntity[],
  spacing = 32,
  allowScreenWrap = false,
) {
  const { width, height } = GAME_CONFIG.arena;
  const margin = vesselRadius + 2;
  const normalDistance = Math.hypot(goalX - fromX, goalY - fromY);
  const wrappedDistance = Math.hypot(
    wrappedDelta(fromX, goalX, width),
    wrappedDelta(fromY, goalY, height),
  );
  if (clearRoute(fromX, fromY, goalX, goalY, vesselRadius, islands)
    && (!allowScreenWrap || wrappedDistance >= normalDistance - spacing)) {
    return { x: goalX, y: goalY };
  }

  const columns = Math.floor((width - margin * 2) / spacing) + 1;
  const rows = Math.floor((height - margin * 2) / spacing) + 1;
  const points = new Array<{ x: number; y: number }>(columns * rows);
  const valid = new Uint8Array(columns * rows);
  const position = (index: number) => points[index];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const point = { x: margin + column * spacing, y: margin + row * spacing };
      points[index] = point;
      valid[index] = islands.some((island) => resolveVesselIslandCollision(point.x, point.y, vesselRadius, island)) ? 0 : 1;
    }
  }

  const count = points.length;
  const costs = new Float64Array(count).fill(Number.POSITIVE_INFINITY);
  const parents = new Int32Array(count).fill(-2);
  const open: { index: number; cost: number; priority: number }[] = [];
  const push = (entry: { index: number; cost: number; priority: number }) => {
    open.push(entry);
    let child = open.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (open[parent].priority <= open[child].priority) break;
      [open[parent], open[child]] = [open[child], open[parent]];
      child = parent;
    }
  };
  const pop = () => {
    const first = open[0];
    const last = open.pop();
    if (open.length > 0 && last) {
      open[0] = last;
      let parent = 0;
      while (true) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < open.length && open[left].priority < open[smallest].priority) smallest = left;
        if (right < open.length && open[right].priority < open[smallest].priority) smallest = right;
        if (smallest === parent) break;
        [open[parent], open[smallest]] = [open[smallest], open[parent]];
        parent = smallest;
      }
    }
    return first;
  };
  const heuristic = (point: { x: number; y: number }) => {
    const dx = allowScreenWrap ? wrappedDelta(point.x, goalX, width) : goalX - point.x;
    const dy = allowScreenWrap ? wrappedDelta(point.y, goalY, height) : goalY - point.y;
    return Math.hypot(dx, dy);
  };

  for (let index = 0; index < count; index += 1) {
    if (!valid[index]) continue;
    const point = position(index);
    if (!clearRoute(fromX, fromY, point.x, point.y, vesselRadius, islands)) continue;
    const cost = Math.hypot(point.x - fromX, point.y - fromY);
    costs[index] = cost;
    parents[index] = -1;
    push({ index, cost, priority: cost + heuristic(point) });
  }

  let bestGoal = -1;
  let bestGoalCost = Number.POSITIVE_INFINITY;
  let bestApproach = -1;
  let bestApproachDistance = allowScreenWrap ? wrappedDistance : normalDistance;
  let bestApproachCost = Number.POSITIVE_INFINITY;
  while (open.length > 0) {
    const current = pop();
    if (!current) break;
    if (current.cost !== costs[current.index]) continue;
    if (current.priority >= bestGoalCost) break;
    const point = position(current.index);
    const distanceToGoal = heuristic(point);
    if (distanceToGoal < bestApproachDistance - 2
      || (bestApproach >= 0 && Math.abs(distanceToGoal - bestApproachDistance) <= 2 && current.cost < bestApproachCost)) {
      bestApproach = current.index;
      bestApproachDistance = distanceToGoal;
      bestApproachCost = current.cost;
    }
    if (clearRoute(point.x, point.y, goalX, goalY, vesselRadius, islands)) {
      const completeCost = current.cost + Math.hypot(goalX - point.x, goalY - point.y);
      if (completeCost < bestGoalCost) {
        bestGoal = current.index;
        bestGoalCost = completeCost;
      }
    }

    const row = Math.floor(current.index / columns);
    const column = current.index % columns;
    const neighbors: { column: number; row: number; wrapped: boolean; edgeCost: number }[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextColumn = column + dx;
        const nextRow = row + dy;
        if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
        neighbors.push({ column: nextColumn, row: nextRow, wrapped: false, edgeCost: Math.hypot(dx, dy) * spacing });
      }
    }
    if (allowScreenWrap) {
      if (column === 0) neighbors.push({ column: columns - 1, row, wrapped: true, edgeCost: margin * 2 });
      if (column === columns - 1) neighbors.push({ column: 0, row, wrapped: true, edgeCost: margin * 2 });
      if (row === 0) neighbors.push({ column, row: rows - 1, wrapped: true, edgeCost: margin * 2 });
      if (row === rows - 1) neighbors.push({ column, row: 0, wrapped: true, edgeCost: margin * 2 });
    }

    for (const neighbor of neighbors) {
      const nextIndex = neighbor.row * columns + neighbor.column;
      if (!valid[nextIndex]) continue;
      const next = position(nextIndex);
      if (neighbor.wrapped) {
        let exit: { x: number; y: number };
        if (row === neighbor.row && column === 0) exit = { x: -vesselRadius - 1, y: point.y };
        else if (row === neighbor.row && column === columns - 1) exit = { x: width + vesselRadius + 1, y: point.y };
        else if (row === 0) exit = { x: point.x, y: -vesselRadius - 1 };
        else exit = { x: point.x, y: height + vesselRadius + 1 };
        if (!clearRoute(point.x, point.y, exit.x, exit.y, vesselRadius, islands)) continue;
      } else if (!clearRoute(point.x, point.y, next.x, next.y, vesselRadius, islands)) {
        continue;
      }
      const nextCost = current.cost + neighbor.edgeCost;
      if (nextCost >= costs[nextIndex]) continue;
      costs[nextIndex] = nextCost;
      parents[nextIndex] = current.index;
      push({ index: nextIndex, cost: nextCost, priority: nextCost + heuristic(next) });
    }
  }

  const endpoint = bestGoal >= 0 ? bestGoal : bestApproach;
  if (endpoint < 0) return undefined;
  const path: number[] = [];
  for (let index = endpoint; index >= 0; index = parents[index]) path.push(index);
  path.reverse();
  let waypoint: { x: number; y: number } | undefined;
  for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
    const point = position(path[pathIndex]);
    if (pathIndex > 0) {
      const previousIndex = path[pathIndex - 1];
      const previousRow = Math.floor(previousIndex / columns);
      const previousColumn = previousIndex % columns;
      const currentRow = Math.floor(path[pathIndex] / columns);
      const currentColumn = path[pathIndex] % columns;
      const isWrappedEdge = Math.abs(previousColumn - currentColumn) > 1 || Math.abs(previousRow - currentRow) > 1;
      if (isWrappedEdge) {
        let passage: { x: number; y: number };
        if (previousRow === currentRow && previousColumn === 0) passage = { x: -vesselRadius - 1, y: position(previousIndex).y };
        else if (previousRow === currentRow) passage = { x: width + vesselRadius + 1, y: position(previousIndex).y };
        else if (previousRow === 0) passage = { x: position(previousIndex).x, y: -vesselRadius - 1 };
        else passage = { x: position(previousIndex).x, y: height + vesselRadius + 1 };
        if (clearRoute(fromX, fromY, passage.x, passage.y, vesselRadius, islands)) return passage;
        return waypoint ?? position(previousIndex);
      }
    }
    if (!clearRoute(fromX, fromY, point.x, point.y, vesselRadius, islands)) break;
    waypoint = point;
  }
  return waypoint;
}
