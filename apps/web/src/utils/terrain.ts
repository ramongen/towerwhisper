/**
 * Relief around the airport, pre-computed from public elevation data by
 * scripts/terrain/build-contours.mjs into public/terrain/: contour lines, spot heights and
 * an elevation raster for the heatmap.
 */
interface TerrainFile {
  levels: { elevM: number; major: boolean; lines: number[][] }[]; // line: [lon, lat, lon, lat, ...]
  peaks: [lat: number, lon: number, elevM: number][];
  elevation: {
    file: string;
    latMax: number;
    lonMin: number;
    stepDeg: number;
    rows: number;
    cols: number;
    minM: number;
    maxM: number;
  };
}

export interface TerrainLevel {
  elevM: number;
  major: boolean;
  /** Path in NM from the airport (x east, y north), ready to stroke with a transform. */
  path: Path2D;
}

export interface Terrain {
  levels: TerrainLevel[];
  peaks: { lat: number; lon: number; elevFt: number }[];
  /** Coloured, hill-shaded relief image, and the lat/lon box it covers. */
  heat: {
    image: HTMLCanvasElement;
    latMax: number;
    latMin: number;
    lonMin: number;
    lonMax: number;
  } | null;
}

const BASE = '/terrain/';
const FT_PER_M = 3.28084;
/** Sun from the north-west, 45 degrees up: the usual hill-shading light. */
const LIGHT = { azimuthDeg: 315, altitudeDeg: 45 };
/** Vertical exaggeration of the shading (relief reads better on a dark scope). */
const SHADE_EXAGGERATION = 3;

/** Loads everything once; an empty terrain (no relief) when the files are missing. */
export async function loadTerrain(
  origin: { lat: number; lon: number },
  cosLat0: number,
  heatStops: [number, [number, number, number]][],
): Promise<Terrain> {
  try {
    const response = await fetch(`${BASE}relief-contours.json`);
    if (!response.ok) return { levels: [], peaks: [], heat: null };
    const file = (await response.json()) as TerrainFile;
    const levels = file.levels.map((level) => {
      const path = new Path2D();
      for (const line of level.lines) {
        for (let i = 0; i < line.length; i += 2) {
          const x = (line[i] - origin.lon) * 60 * cosLat0;
          const y = (line[i + 1] - origin.lat) * 60;
          if (i === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        }
      }
      return { elevM: level.elevM, major: level.major, path };
    });
    const peaks = file.peaks.map(([lat, lon, elevM]) => ({
      lat,
      lon,
      elevFt: Math.round((elevM * FT_PER_M) / 10) * 10,
    }));
    return { levels, peaks, heat: await loadHeat(file.elevation, heatStops) };
  } catch {
    return { levels: [], peaks: [], heat: null };
  }
}

async function loadHeat(
  meta: TerrainFile['elevation'],
  stops: [number, [number, number, number]][],
): Promise<Terrain['heat']> {
  const response = await fetch(BASE + meta.file);
  if (!response.ok || stops.length < 2) return null;
  const z = new Int16Array(await response.arrayBuffer());
  const { rows, cols } = meta;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(cols, rows);

  const cellY = meta.stepDeg * 111_320; // metres per row
  const cellX = cellY * Math.cos(((meta.latMax - (rows * meta.stepDeg) / 2) * Math.PI) / 180);
  const az = (LIGHT.azimuthDeg * Math.PI) / 180;
  const alt = (LIGHT.altitudeDeg * Math.PI) / 180;
  const at = (r: number, c: number) =>
    z[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = at(r, c);
      // Hill-shading from the local slope (rows go north to south).
      const dzdx = ((at(r, c + 1) - at(r, c - 1)) / (2 * cellX)) * SHADE_EXAGGERATION;
      const dzdy = ((at(r - 1, c) - at(r + 1, c)) / (2 * cellY)) * SHADE_EXAGGERATION;
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdx, dzdy);
      const shade =
        Math.sin(alt) * Math.cos(slope) + Math.cos(alt) * Math.sin(slope) * Math.cos(az - aspect);
      const light = 0.45 + 0.75 * Math.max(0, shade);
      const [red, green, blue] = colourAt(h, stops);
      const o = (r * cols + c) * 4;
      img.data[o] = Math.min(255, red * light);
      img.data[o + 1] = Math.min(255, green * light);
      img.data[o + 2] = Math.min(255, blue * light);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    image: canvas,
    latMax: meta.latMax,
    latMin: meta.latMax - (rows - 1) * meta.stepDeg,
    lonMin: meta.lonMin,
    lonMax: meta.lonMin + (cols - 1) * meta.stepDeg,
  };
}

/** Linear interpolation along the colour ramp (elevation in metres). */
function colourAt(
  h: number,
  stops: [number, [number, number, number]][],
): [number, number, number] {
  if (h <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [e1, c1] = stops[i];
    if (h <= e1) {
      const [e0, c0] = stops[i - 1];
      const t = (h - e0) / (e1 - e0);
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/** '0 #0d2a2a, 300 #2f5b34, ...' (a design token) -> [[0, [13, 42, 42]], [300, ...]] */
export function parseStops(token: string): [number, [number, number, number]][] {
  return token
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .filter(([e, hex]) => e && /^#[0-9a-f]{6}$/i.test(hex ?? ''))
    .map(([e, hex]) => [
      Number(e),
      [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)],
    ]);
}
