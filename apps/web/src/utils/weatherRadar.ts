import { UNIVERSAL_BLUE_DBZ } from './rainviewerPalette';

/** Airborne weather-radar levels: reflectivity (dBZ) from which each colour starts. */
export interface WxLevels {
  faint: [number, number, number]; // drizzle, drawn half transparent
  light: [number, number, number];
  moderate: [number, number, number];
  heavy: [number, number, number];
  extreme: [number, number, number];
}

const FAINT_DBZ = 10;
const LIGHT_DBZ = 20;
const MODERATE_DBZ = 30;
const HEAVY_DBZ = 40;
const EXTREME_DBZ = 50;

const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const PALETTE = UNIVERSAL_BLUE_DBZ.map(([dbz, hex]) => ({ dbz, rgb: hexRgb(hex) }));
/** Packed RGB -> dBZ, filled lazily (exact palette colours, or the nearest one). */
const dbzByColour = new Map<number, number>();
for (const { dbz, rgb } of PALETTE) {
  const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  if (!dbzByColour.has(key)) dbzByColour.set(key, dbz);
}

function dbzOf(r: number, g: number, b: number): number {
  const key = (r << 16) | (g << 8) | b;
  const known = dbzByColour.get(key);
  if (known !== undefined) return known;
  let best = PALETTE[0];
  let bestDistance = Infinity;
  for (const p of PALETTE) {
    const d = (p.rgb[0] - r) ** 2 + (p.rgb[1] - g) ** 2 + (p.rgb[2] - b) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = p;
    }
  }
  dbzByColour.set(key, best.dbz);
  return best.dbz;
}

/**
 * Redraws a RainViewer tile (Universal Blue) in airborne weather-radar colours:
 * green 20-30 dBZ, yellow 30-40, red 40-50, magenta 50+, faint green for drizzle.
 * The tile must come from our own origin (the API proxy) so its pixels can be read.
 */
export function recolourTile(img: HTMLImageElement, levels: WxLevels): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const dbz = dbzOf(px[i], px[i + 1], px[i + 2]);
    let colour: [number, number, number] | null = null;
    let alpha = 255;
    if (dbz >= EXTREME_DBZ) colour = levels.extreme;
    else if (dbz >= HEAVY_DBZ) colour = levels.heavy;
    else if (dbz >= MODERATE_DBZ) colour = levels.moderate;
    else if (dbz >= LIGHT_DBZ) colour = levels.light;
    else if (dbz >= FAINT_DBZ) {
      colour = levels.faint;
      alpha = 120;
    }
    if (!colour) {
      px[i + 3] = 0;
      continue;
    }
    px[i] = colour[0];
    px[i + 1] = colour[1];
    px[i + 2] = colour[2];
    px[i + 3] = alpha;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function levelsFromTokens(t: {
  faint: string;
  light: string;
  moderate: string;
  heavy: string;
  extreme: string;
}): WxLevels {
  return {
    faint: hexRgb(t.faint),
    light: hexRgb(t.light),
    moderate: hexRgb(t.moderate),
    heavy: hexRgb(t.heavy),
    extreme: hexRgb(t.extreme),
  };
}
