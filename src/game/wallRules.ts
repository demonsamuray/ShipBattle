type WallDetail = { column: number; row: number; tile: number };
export type GeneratedWallKind = 'horizontal' | 'vertical' | 'corner';
export type WallShape = 'horizontal' | 'horizontalStart' | 'horizontalEnd' | 'vertical' | 'verticalStart' | 'verticalEnd' | 'corner' | 'solo' | 'decoration';

const WALL_SHAPES: Readonly<Record<number, WallShape>> = {
  13:'solo',14:'solo',15:'vertical',16:'horizontal',29:'verticalStart',30:'horizontalStart',
  31:'vertical',32:'vertical',45:'verticalStart',46:'horizontalStart',47:'horizontal',48:'horizontal',
  60:'vertical',61:'verticalEnd',62:'horizontalEnd',63:'solo',64:'corner',77:'horizontalStart',78:'horizontalEnd',
  76:'horizontal',79:'verticalEnd',80:'horizontalEnd',89:'vertical',90:'horizontal',91:'vertical',92:'horizontal',
  93:'verticalStart',94:'verticalStart',95:'vertical',96:'horizontal',
};
const WALL_OVERLAY_TILES = new Set([13,14,15,16,29,30,31,32,45,46,47,48,60,61,62,63,64,66,70,71,72,76,77,78,79,80,87,88,89,90,91,92,93,94,95,96,49,50,51]);
function wallShape(tile: number): WallShape { return WALL_SHAPES[tile] ?? 'decoration'; }

export function classifyWallSprite(tile: number): WallShape {
  return wallShape(tile);
}

export function createWallLayout(kind: GeneratedWallKind, column = 0, row = 0, seed = 0): WallDetail[] {
  const hash = Math.imul((seed ^ 0x45d9f3b) >>> 0, 0x45d9f3b) >>> 0;
  const horizontalMiddle = [16, 47, 48, 76][hash % 4];
  const verticalMiddle = [15, 31, 32][(hash >>> 4) % 3];
  if (kind === 'horizontal') return [
    { column, row, tile: 46 },
    { column: column + 1, row, tile: horizontalMiddle },
    { column: column + 2, row, tile: 62 },
  ];
  if (kind === 'vertical') return [
    { column, row, tile: 45 },
    { column, row: row + 1, tile: verticalMiddle },
    { column, row: row + 2, tile: 61 },
  ];
  return [
    { column, row, tile: 46 },
    { column: column + 1, row, tile: horizontalMiddle },
    { column: column + 2, row, tile: 64 },
    { column: column + 2, row: row + 1, tile: 15 },
    { column: column + 2, row: row + 2, tile: 79 },
  ];
}

/** Two stacked horizontal courses: top 77-16-78, bottom 93-16-94. */
export function createFortLayout(column = 0, row = 0): WallDetail[] {
  return [
    { column, row, tile: 77 }, { column: column + 1, row, tile: 16 }, { column: column + 2, row, tile: 78 },
    { column, row: row + 1, tile: 93 }, { column: column + 1, row: row + 1, tile: 16 }, { column: column + 2, row: row + 1, tile: 94 },
  ];
}

export function validateFortLayout(details: readonly WallDetail[], templateName: string) {
  const expected = createFortLayout(details[0]?.column ?? 0, details[0]?.row ?? 0);
  if (details.length !== expected.length || details.some((detail, index) => (
    detail.column !== expected[index]?.column || detail.row !== expected[index]?.row || detail.tile !== expected[index]?.tile
  ))) throw new Error(`Invalid 77-16-78 / 93-16-94 fort layout in ${templateName}.`);
  for (const detail of details) {
    if (!WALL_OVERLAY_TILES.has(detail.tile)) throw new Error(`Unmapped overlay tile ${detail.tile} in ${templateName}.`);
  }
}

export function validateWallLayout(details: readonly WallDetail[], templateName: string) {
  const placed = new Map<string, WallDetail>();
  for (const detail of details) {
    const key = `${detail.column},${detail.row}`;
    if (placed.has(key)) throw new Error(`Duplicate overlay in ${templateName} at ${key}.`);
    if (!WALL_OVERLAY_TILES.has(detail.tile)) throw new Error(`Unmapped overlay tile ${detail.tile} in ${templateName}.`);
    placed.set(key, detail);
  }
  const at = (column: number,row: number) => placed.get(`${column},${row}`);
  const isWall = (detail: WallDetail | undefined) => detail !== undefined
    && wallShape(detail.tile) !== 'decoration'
    && wallShape(detail.tile) !== 'solo';
  for (const detail of details) {
    const shape = wallShape(detail.tile);
    if (shape === 'decoration') continue;
    const neighbors = { left:at(detail.column-1,detail.row),right:at(detail.column+1,detail.row),top:at(detail.column,detail.row-1),bottom:at(detail.column,detail.row+1) };
    const linked = { horizontal:isWall(neighbors.left)&&isWall(neighbors.right),vertical:isWall(neighbors.top)&&isWall(neighbors.bottom) };
    let valid: boolean;
    if (shape === 'solo') valid = !Object.values(neighbors).some(isWall);
    else if (shape === 'horizontal') valid = linked.horizontal;
    else if (shape === 'horizontalStart') valid = isWall(neighbors.right) && !isWall(neighbors.left) && !isWall(neighbors.top) && !isWall(neighbors.bottom);
    else if (shape === 'horizontalEnd') valid = isWall(neighbors.left) && !isWall(neighbors.right) && !isWall(neighbors.top) && !isWall(neighbors.bottom);
    else if (shape === 'vertical') valid = linked.vertical;
    else if (shape === 'verticalStart') valid = isWall(neighbors.bottom) && !isWall(neighbors.top) && !isWall(neighbors.left) && !isWall(neighbors.right);
    else if (shape === 'verticalEnd') valid = isWall(neighbors.top) && !isWall(neighbors.bottom) && !isWall(neighbors.left) && !isWall(neighbors.right);
    else {
      const dirs = Object.entries(neighbors).filter(([,neighbor])=>isWall(neighbor)).map(([direction])=>direction);
      valid = dirs.length===2 && dirs.some(direction=>direction==='left'||direction==='right') && dirs.some(direction=>direction==='top'||direction==='bottom');
    }
    if (!valid) throw new Error(`Invalid wall connection in ${templateName}: tile ${detail.tile} at ${detail.column},${detail.row}.`);
  }
}

export function validateGeneratedWallPresets() {
  for (const kind of ['horizontal', 'vertical', 'corner'] as const) {
    validateWallLayout(createWallLayout(kind), `generated-${kind}-preset`);
  }
  validateWallLayout([
    { column: 0, row: 0, tile: 46 },
    { column: 1, row: 0, tile: 76 },
    { column: 2, row: 0, tile: 62 },
  ], 'horizontal-wooden-gate-variant');
  validateWallLayout(createWallLayout('vertical'), 'vertical-61-15-45-bottom-to-top');
  validateFortLayout(createFortLayout(), 'two-course-fort');
}
