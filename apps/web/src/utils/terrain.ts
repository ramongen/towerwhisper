/**
 * Relief contours around the airport, pre-computed from public elevation data by
 * scripts/terrain/build-contours.mjs into public/terrain/lrcv-contours.json.
 */
interface ContourFile {
  /** Contour interval in metres; every `majorEvery`-th level is drawn stronger. */
  intervalM: number;
  majorEvery: number;
  levels: { elevM: number; lines: number[][] }[]; // each line: [lon, lat, lon, lat, ...]
}

export interface TerrainLevel {
  elevM: number;
  major: boolean;
  /** Path in NM from the airport (x east, y north), ready to stroke with a transform. */
  path: Path2D;
}

const TERRAIN_URL = '/terrain/lrcv-contours.json';

/** Loads the contours once; an empty list (no relief) when the file is missing. */
export async function loadTerrain(
  origin: { lat: number; lon: number },
  cosLat0: number,
): Promise<TerrainLevel[]> {
  try {
    const response = await fetch(TERRAIN_URL);
    if (!response.ok) return [];
    const file = (await response.json()) as ContourFile;
    return file.levels.map((level) => {
      const path = new Path2D();
      for (const line of level.lines) {
        for (let i = 0; i < line.length; i += 2) {
          const x = (line[i] - origin.lon) * 60 * cosLat0;
          const y = (line[i + 1] - origin.lat) * 60;
          if (i === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        }
      }
      const major = Math.round(level.elevM / file.intervalM) % file.majorEvery === 0;
      return { elevM: level.elevM, major, path };
    });
  } catch {
    return [];
  }
}
