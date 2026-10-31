// Builds the relief contours drawn behind the radar (apps/web/public/terrain/lrcv-contours.json).
//
//   node scripts/terrain/build-contours.mjs [tile-cache-dir]
//
// Elevation: AWS Terrain Tiles (Terrarium PNG, public, no key; derived from SRTM and others).
// Run once; the JSON and the .bin raster are committed, so the app never needs the network for the map.
// No dependencies: PNG decoding (zlib), marching squares and simplification are below.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'apps', 'web', 'public', 'terrain');
const OUT = join(OUT_DIR, 'lrcv-contours.json');
const OUT_ELEVATION = join(OUT_DIR, 'lrcv-elevation.bin');
const CACHE = resolve(process.argv[2] ?? join(ROOT, '.cache', 'terrain-tiles'));

const LRCV = { lat: 44.3181, lon: 23.8886 };
/** About 60 NM around the airport, so panning out still shows relief. */
/** About 130 NM east-west and 95 NM north-south: what the radar shows fully zoomed out. */
const SPAN = { lat: 1.6, lon: 3.1 };
const ZOOM = 9;
const GRID_DEG = 0.006; // ~670 m north-south
/** Contour interval by height: dense in the plain, sparser in the mountains. */
const intervalAt = (elevM) => (elevM < 600 ? 50 : elevM < 1500 ? 100 : 200);
/** A stronger line every this many metres. */
const MAJOR_M = 500;
const SIMPLIFY_DEG = 0.002;
/** Elevation raster for the relief heatmap (Int16, metres, rows north to south). */
const RASTER_DEG = 0.01;
/** Spot heights: local maxima this high, at least this far apart, at most this many. */
const PEAK_MIN_M = 300;
const PEAK_WINDOW = 4; // cells each side
const PEAK_SEPARATION_DEG = 0.12;
const PEAK_MAX = 80;
const MIN_POINTS = 4;
const TILE_URL = (z, x, y) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

// --- Tiles -----------------------------------------------------------------------------------

const tileX = (lon) => ((lon + 180) / 360) * 2 ** ZOOM;
const tileY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM;
};

async function tile(x, y) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${ZOOM}-${x}-${y}.png`);
  if (!existsSync(file)) {
    const response = await fetch(TILE_URL(ZOOM, x, y));
    if (!response.ok) throw new Error(`tile ${x}/${y}: HTTP ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  return decodePng(readFileSync(file));
}

/** Minimal PNG decoder: 8-bit RGB / RGBA, not interlaced (what Terrarium tiles are). */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colorType = data[9];
      if (depth !== 8 || data[12] !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported PNG (depth ${depth}, colour ${colorType})`);
      }
      channels = colorType === 2 ? 3 : 4;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    const src = row * (stride + 1) + 1;
    const dst = row * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? px[dst + i - channels] : 0;
      const b = row > 0 ? px[dst - stride + i] : 0;
      const c = row > 0 && i >= channels ? px[dst - stride + i - channels] : 0;
      let v = raw[src + i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[dst + i] = v & 0xff;
    }
  }
  // Terrarium: elevation (m) = R * 256 + G + B / 256 - 32768
  const elev = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    elev[i] = px[o] * 256 + px[o + 1] + px[o + 2] / 256 - 32768;
  }
  return { width, height, elev };
}

// --- Elevation grid in lat/lon -----------------------------------------------------------------

async function elevationGrid() {
  const latMin = LRCV.lat - SPAN.lat;
  const latMax = LRCV.lat + SPAN.lat;
  const lonMin = LRCV.lon - SPAN.lon;
  const lonMax = LRCV.lon + SPAN.lon;
  const x0 = Math.floor(tileX(lonMin));
  const x1 = Math.floor(tileX(lonMax));
  const y0 = Math.floor(tileY(latMax));
  const y1 = Math.floor(tileY(latMin));
  const tiles = new Map();
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) tiles.set(`${x}/${y}`, await tile(x, y));
  }
  console.log(`${tiles.size} tiles at zoom ${ZOOM}`);

  const sample = (lat, lon) => {
    const fx = tileX(lon);
    const fy = tileY(lat);
    const t = tiles.get(`${Math.floor(fx)}/${Math.floor(fy)}`);
    const px = Math.min(t.width - 1, Math.floor((fx % 1) * t.width));
    const py = Math.min(t.height - 1, Math.floor((fy % 1) * t.height));
    return t.elev[py * t.width + px];
  };

  const rows = Math.round((latMax - latMin) / GRID_DEG) + 1;
  const cols = Math.round((lonMax - lonMin) / GRID_DEG) + 1;
  const z = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++)
      z[r * cols + c] = sample(latMin + r * GRID_DEG, lonMin + c * GRID_DEG);
  }
  return { rows, cols, z, latMin, lonMin };
}

// --- Contours ----------------------------------------------------------------------------------

/** Marching squares for one level: returns polylines in [lon, lat] points. */
function contour(grid, level) {
  const { rows, cols, z, latMin, lonMin } = grid;
  const at = (r, c) => z[r * cols + c];
  const point = (r0, c0, r1, c1) => {
    const a = at(r0, c0);
    const b = at(r1, c1);
    const t = (level - a) / (b - a);
    return [lonMin + (c0 + (c1 - c0) * t) * GRID_DEG, latMin + (r0 + (r1 - r0) * t) * GRID_DEG];
  };
  const segments = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = at(r + 1, c) >= level ? 8 : 0;
      const tr = at(r + 1, c + 1) >= level ? 4 : 0;
      const br = at(r, c + 1) >= level ? 2 : 0;
      const bl = at(r, c) >= level ? 1 : 0;
      const code = tl | tr | br | bl;
      if (code === 0 || code === 15) continue;
      const top = () => point(r + 1, c, r + 1, c + 1);
      const right = () => point(r, c + 1, r + 1, c + 1);
      const bottom = () => point(r, c, r, c + 1);
      const left = () => point(r, c, r + 1, c);
      const edges = {
        1: [[left, bottom]],
        2: [[bottom, right]],
        3: [[left, right]],
        4: [[top, right]],
        5: [
          [left, top],
          [bottom, right],
        ],
        6: [[bottom, top]],
        7: [[left, top]],
        8: [[left, top]],
        9: [[bottom, top]],
        10: [
          [left, bottom],
          [top, right],
        ],
        11: [[top, right]],
        12: [[left, right]],
        13: [[bottom, right]],
        14: [[left, bottom]],
      }[code];
      for (const [p, q] of edges) segments.push([p(), q()]);
    }
  }
  return joinSegments(segments);
}

/** Joins segments that share end points into polylines. */
function joinSegments(segments) {
  const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const byEnd = new Map();
  segments.forEach((s, i) => {
    for (const p of s) {
      const k = key(p);
      if (!byEnd.has(k)) byEnd.set(k, []);
      byEnd.get(k).push(i);
    }
  });
  const used = new Uint8Array(segments.length);
  const lines = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [...segments[i]];
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? line[line.length - 1] : line[0];
        const next = (byEnd.get(key(end)) ?? []).find((j) => !used[j]);
        if (next === undefined) break;
        used[next] = 1;
        const [a, b] = segments[next];
        const other = key(a) === key(end) ? b : a;
        if (forward) line.push(other);
        else line.unshift(other);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Ramer-Douglas-Peucker simplification. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1e-12;
  let maxD = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

// --- Main --------------------------------------------------------------------------------------

const grid = await elevationGrid();
let min = Infinity;
let max = -Infinity;
for (const v of grid.z) {
  if (v < min) min = v;
  if (v > max) max = v;
}
console.log(
  `elevation ${Math.round(min)}-${Math.round(max)} m over a ${grid.rows}x${grid.cols} grid`,
);

// Contours, with an interval that grows with height.
const levels = [];
let points = 0;
for (let elev = Math.ceil(min / 50) * 50; elev <= max; elev += 50) {
  if (elev % intervalAt(elev) !== 0) continue;
  const lines = contour(grid, elev)
    .map((line) => simplify(line, SIMPLIFY_DEG))
    .filter((line) => line.length >= MIN_POINTS)
    .map((line) => line.flatMap(([lon, lat]) => [+lon.toFixed(4), +lat.toFixed(4)]));
  if (!lines.length) continue;
  points += lines.reduce((n, l) => n + l.length / 2, 0);
  levels.push({ elevM: elev, major: elev % MAJOR_M === 0, lines });
}

// Elevation raster for the heatmap: resample the grid at RASTER_DEG, rows north to south.
const step = Math.round((RASTER_DEG / GRID_DEG) * 1000) / 1000;
const latMax = grid.latMin + (grid.rows - 1) * GRID_DEG;
const rows = Math.floor(((grid.rows - 1) * GRID_DEG) / RASTER_DEG) + 1;
const cols = Math.floor(((grid.cols - 1) * GRID_DEG) / RASTER_DEG) + 1;
const raster = new Int16Array(rows * cols);
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const gr = Math.min(
      grid.rows - 1,
      Math.round((latMax - r * RASTER_DEG - grid.latMin) / GRID_DEG),
    );
    const gc = Math.min(grid.cols - 1, Math.round((c * RASTER_DEG) / GRID_DEG));
    raster[r * cols + c] = Math.max(-100, Math.round(grid.z[gr * grid.cols + gc]));
  }
}

// Spot heights: highest local maxima, spread out.
const candidates = [];
for (let r = PEAK_WINDOW; r < rows - PEAK_WINDOW; r++) {
  for (let c = PEAK_WINDOW; c < cols - PEAK_WINDOW; c++) {
    const v = raster[r * cols + c];
    if (v < PEAK_MIN_M) continue;
    let top = true;
    for (let dr = -PEAK_WINDOW; dr <= PEAK_WINDOW && top; dr++) {
      for (let dc = -PEAK_WINDOW; dc <= PEAK_WINDOW; dc++) {
        if ((dr || dc) && raster[(r + dr) * cols + c + dc] > v) {
          top = false;
          break;
        }
      }
    }
    if (top)
      candidates.push({
        lat: latMax - r * RASTER_DEG,
        lon: grid.lonMin + c * RASTER_DEG,
        elevM: v,
      });
  }
}
candidates.sort((a, b) => b.elevM - a.elevM);
const peaks = [];
for (const p of candidates) {
  if (peaks.length >= PEAK_MAX) break;
  if (peaks.some((q) => Math.hypot(q.lat - p.lat, (q.lon - p.lon) * 0.72) < PEAK_SEPARATION_DEG))
    continue;
  peaks.push(p);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_ELEVATION, Buffer.from(raster.buffer));
writeFileSync(
  OUT,
  JSON.stringify({
    source: 'AWS Terrain Tiles (Terrarium), derived from SRTM and other public DEMs',
    levels,
    peaks: peaks.map((p) => [+p.lat.toFixed(4), +p.lon.toFixed(4), p.elevM]),
    elevation: {
      file: 'lrcv-elevation.bin',
      format: 'int16le, metres, rows north to south',
      latMax: +latMax.toFixed(4),
      lonMin: +grid.lonMin.toFixed(4),
      stepDeg: RASTER_DEG,
      rows,
      cols,
      minM: Math.round(min),
      maxM: Math.round(max),
    },
  }),
);
console.log(
  `${levels.length} levels, ${points} points, ${peaks.length} peaks, raster ${rows}x${cols} (step ${step}) -> ${OUT_DIR}`,
);
