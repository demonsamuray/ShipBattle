import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';

// Build a lossless, deterministic PixiJS spritesheet from the numbered source
// tiles. The JSON frame table is the authoritative ID-to-atlas mapping.
const root = resolve(import.meta.dirname, '..');
const columns = 8;
const rows = 12;
const tileSize = 64;
const atlasWidth = columns * tileSize;
const atlasHeight = rows * tileSize;
const atlasPixels = Buffer.alloc(atlasWidth * atlasHeight * 4);
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}
function decodeRgbaPng(buffer, file) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error(`${file} is not a PNG.`);
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (width !== tileSize || height !== tileSize || buffer[24] !== 8 || buffer[25] !== 6) {
    throw new Error(`${file} must be 64x64 8-bit RGBA (got ${width}x${height}, color type ${buffer[25]}).`);
  }
  const idat = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset); const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const packed = inflateSync(Buffer.concat(idat));
  const stride = width * 4, pixels = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[inputOffset++]; const rowStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[inputOffset++], left = x >= 4 ? pixels[rowStart + x - 4] : 0;
      const up = y ? pixels[rowStart - stride + x] : 0;
      const upperLeft = y && x >= 4 ? pixels[rowStart - stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      } else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter} in ${file}.`);
      pixels[rowStart + x] = (raw + predictor) & 0xff;
    }
  }
  return pixels;
}

const frames = {};
for (let id = 1; id <= 96; id += 1) {
  const file = `assets/png/default/tiles/tile_${id}.png`;
  const source = decodeRgbaPng(await readFile(resolve(root, file)), file);
  const column = (id - 1) % columns, row = Math.floor((id - 1) / columns);
  for (let y = 0; y < tileSize; y += 1) {
    source.copy(atlasPixels, ((row * tileSize + y) * atlasWidth + column * tileSize) * 4, y * tileSize * 4, (y + 1) * tileSize * 4);
  }
  frames[`tile_${id}.png`] = {
    frame: { x: column * tileSize, y: row * tileSize, w: tileSize, h: tileSize },
    rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: tileSize, h: tileSize },
    sourceSize: { w: tileSize, h: tileSize },
  };
}
const header = Buffer.alloc(13);
header.writeUInt32BE(atlasWidth, 0); header.writeUInt32BE(atlasHeight, 4);
header[8] = 8; header[9] = 6;
const scanlines = Buffer.alloc((atlasWidth * 4 + 1) * atlasHeight);
for (let y = 0; y < atlasHeight; y += 1) {
  const target = y * (atlasWidth * 4 + 1);
  scanlines[target] = 0;
  atlasPixels.copy(scanlines, target + 1, y * atlasWidth * 4, (y + 1) * atlasWidth * 4);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', header),
  pngChunk('IDAT', deflateSync(scanlines)),
  pngChunk('IEND', Buffer.alloc(0)),
]);
const atlasPath = resolve(root, 'public/island-atlas.png');
const jsonPath = resolve(root, 'public/island-atlas.json');
await mkdir(dirname(atlasPath), { recursive: true });
await writeFile(atlasPath, png);
await writeFile(jsonPath, `${JSON.stringify({ frames, meta: { image: 'island-atlas.png', format: 'RGBA8888', size: { w: atlasWidth, h: atlasHeight }, scale: '1' } }, null, 2)}\n`);
console.log(`Generated ${atlasWidth}x${atlasHeight} atlas with ${Object.keys(frames).length} lossless tile frames.`);
