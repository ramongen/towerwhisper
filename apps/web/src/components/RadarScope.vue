<script setup lang="ts">
import type { Aircraft, AirspaceResponse, WeatherRadarResponse } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import { useAlertStore, type AlertLevel } from '../stores/useAlertStore';
import { useDemoStore } from '../stores/useDemoStore';
import { radarFeed, useTrafficStore } from '../stores/useTrafficStore';
import { api } from '../utils/api';
import { formatAge, heading, levelLine } from '../utils/format';
import { loadTerrain, parseStops, type Terrain } from '../utils/terrain';
import { readTokens } from '../utils/tokens';
import { levelsFromTokens, recolourTile } from '../utils/weatherRadar';

/** Craiova (LRCV): the centre of the scope. */
const LRCV = { lat: 44.31806, lon: 23.88861 };
const COS_LAT0 = Math.cos((LRCV.lat * Math.PI) / 180);
const RANGE_NM = 40;
const RING_NM = 10;
/** Margin (NM) around the outer ring at zoom 1, so the compass labels fit. */
const FIT_MARGIN_NM = 4;
/** Extended centreline drawn for an ILS runway (NM from the threshold). */
const CENTRELINE_NM = 15;
/** Fixes farther than this from the airport are labelled only when zoomed in. */
const FIX_LABEL_NM = 45;
const FIX_LABEL_ZOOM = 1.6;
/** The runway is drawn at least this long on screen, so it stays visible zoomed out. */
const RUNWAY_MIN_PX = 30;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;
const TRAIL_OPACITY = [0.7, 0.55, 0.4, 0.28, 0.16];
const PROBE_SHOW_MS = 20_000;
const ARROWS = { up: '↑', down: '↓', level: '=' };
const HIT_RADIUS_PX = 22;
/** Heading rose drawn around the selected aircraft (screen px, independent of zoom). */
const ROSE_RADIUS_PX = 78;
/** A middle-button press that moves less than this is not a pan. */
const DRAG_THRESHOLD_PX = 3;
/** The map data (relief, radar) covers this far from the airport; panning stays inside it. */
const COVERAGE_NM = { x: 200, y: 94 };
const RADAR_REFRESH_MS = 5 * 60 * 1000;
/** Spot heights shown at zoom 1 (peaks are sorted highest first; more appear zoomed in). */
const PEAKS_AT_ZOOM_1 = 40;
const MAP_MODE_KEY = 'towerwhisper.mapMode';

/**
 * Map background: contour lines; relief heatmap with spot heights; or contours with the
 * live precipitation radar on top, as on an airborne weather radar.
 */
type MapMode = 'contours' | 'terrain' | 'wx';
const MAP_MODES: { id: MapMode; label: string }[] = [
  { id: 'contours', label: 'CONTOURS' },
  { id: 'terrain', label: 'TERRAIN' },
  { id: 'wx', label: 'WX RADAR' },
];

function savedMode(): MapMode {
  try {
    const saved = localStorage.getItem(MAP_MODE_KEY);
    return MAP_MODES.some((m) => m.id === saved) ? (saved as MapMode) : 'contours';
  } catch {
    return 'contours';
  }
}

const traffic = useTrafficStore();
const { selectedCallsign } = storeToRefs(traffic);
const alerts = useAlertStore();
const demo = useDemoStore();

const wrapper = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const panning = ref(false);
const zoomLabel = ref('1.0×');
const mapMode = ref<MapMode>(savedMode());
const radarTime = ref<string | null>(null);

function setMapMode(id: MapMode): void {
  mapMode.value = id;
  try {
    localStorage.setItem(MAP_MODE_KEY, id);
  } catch {
    // Storage blocked: the choice simply is not remembered.
  }
}

// Reactive state copied into plain variables, so the 60 fps loop never touches Vue reactivity.
let selected: string | null = null;
let levels = new Map<string, AlertLevel>();
let limits = { cautionS: 900, warningS: 1800 };
let mode: MapMode = 'contours';
watchEffect(() => {
  mode = mapMode.value;
  selected = selectedCallsign.value;
  levels = new Map(alerts.levelByCallsign);
  if (demo.faults) limits = { ...demo.faults.commsLimits };
});

let colors = {} as ReturnType<typeof loadColors>;
function loadColors() {
  return readTokens({
    bg: '--color-radar-bg',
    ring: '--radar-ring',
    compass: '--radar-compass',
    compassMajor: '--radar-compass-major',
    roseBg: '--radar-rose-bg',
    terrain: '--radar-terrain',
    terrainMajor: '--radar-terrain-major',
    heatStops: '--terrain-heat-stops',
    heatOpacity: '--terrain-heat-opacity',
    peak: '--radar-peak',
    wxOpacity: '--wx-radar-opacity',
    wxFaint: '--wx-faint',
    wxLight: '--wx-light',
    wxModerate: '--wx-moderate',
    wxHeavy: '--wx-heavy',
    wxExtreme: '--wx-extreme',
    centreline: '--radar-centreline',
    runway: '--radar-runway',
    label: '--radar-label',
    labelStrong: '--color-text-secondary',
    muted: '--color-text-muted',
    faint: '--color-text-faint',
    aircraft: '--radar-aircraft',
    selected: '--color-atc',
    caution: '--color-caution',
    warning: '--color-warning',
    font: '--font-data',
  });
}

/** View: zoom (1 = the 40 NM ring fits) and the point of the map at the screen centre (NM from LRCV). */
const view = { zoom: 1, centerX: 0, centerY: 0 };
let width = 0;
let height = 0;
let pxPerNm = 10;
let frame = 0;
let resizeObserver: ResizeObserver | null = null;
let airspace: AirspaceResponse | null = null;
let terrain: Terrain = { levels: [], peaks: [], heat: null };
/** Live precipitation radar tiles of the latest frame, by 'x/y'. */
/** Recoloured in airborne weather-radar colours once loaded. */
let wx: { info: WeatherRadarResponse; tiles: Map<string, HTMLCanvasElement> } | null = null;
let radarTimer: ReturnType<typeof setInterval> | undefined;
/** Screen positions of the last frame, for click hit-testing. */
let hitTargets: { callsign: string; x: number; y: number; box: DOMRect }[] = [];
/** Mouse position over the scope, for the heading-to-cursor line of the selected aircraft. */
let cursor: { x: number; y: number } | null = null;

function basePxPerNm(): number {
  return Math.min(width, height) / 2 / (RANGE_NM + FIT_MARGIN_NM);
}

function nmToScreen(xNm: number, yNm: number): { x: number; y: number } {
  return {
    x: width / 2 + (xNm - view.centerX) * pxPerNm,
    y: height / 2 - (yNm - view.centerY) * pxPerNm,
  };
}

function toScreen(lat: number, lon: number): { x: number; y: number } {
  return nmToScreen((lon - LRCV.lon) * 60 * COS_LAT0, (lat - LRCV.lat) * 60);
}

function screenToNm(x: number, y: number): { x: number; y: number } {
  return {
    x: view.centerX + (x - width / 2) / pxPerNm,
    y: view.centerY - (y - height / 2) / pxPerNm,
  };
}

/**
 * The widest zoom that still shows only mapped area on this screen (wide monitors need a
 * closer minimum), never below ZOOM_MIN.
 */
function minZoom(): number {
  const base = basePxPerNm();
  if (!base) return ZOOM_MIN;
  return Math.max(
    ZOOM_MIN,
    width / 2 / (COVERAGE_NM.x * base),
    height / 2 / (COVERAGE_NM.y * base),
  );
}

function updateScale(): void {
  view.zoom = Math.max(view.zoom, minZoom());
  pxPerNm = basePxPerNm() * view.zoom;
  zoomLabel.value = `${view.zoom.toFixed(1)}×`;
}

function resize(): void {
  const el = canvas.value;
  const box = wrapper.value;
  if (!el || !box) return;
  const dpr = window.devicePixelRatio || 1;
  width = box.clientWidth;
  height = box.clientHeight;
  el.width = Math.round(width * dpr);
  el.height = Math.round(height * dpr);
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateScale();
  clampView();
}

function draw(now: number): void {
  const ctx = canvas.value?.getContext('2d');
  if (ctx && width > 0) {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    if (mode === 'terrain') {
      drawHeat(ctx);
      drawContours(ctx, true);
    } else {
      drawContours(ctx, false);
      if (mode === 'wx') drawWeatherRadar(ctx);
    }
    drawRings(ctx);
    drawCompass(ctx);
    drawAirport(ctx);
    drawFixes(ctx);
    if (mode === 'terrain') drawPeaks(ctx);
    drawRoute(ctx, now);
    drawProbe(ctx, now);
    drawTraffic(ctx, now);
  }
  frame = requestAnimationFrame(draw);
}

/** Relief contours, built once in NM and drawn with one transform per frame. */
function drawContours(ctx: CanvasRenderingContext2D, majorOnly: boolean): void {
  if (!terrain.levels.length) return;
  const origin = nmToScreen(0, 0);
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.scale(pxPerNm, -pxPerNm);
  for (const level of terrain.levels) {
    if (majorOnly && !level.major) continue;
    ctx.strokeStyle = level.major ? colors.terrainMajor : colors.terrain;
    ctx.lineWidth = (level.major ? 1.2 : 0.8) / pxPerNm;
    ctx.stroke(level.path);
  }
  ctx.restore();
}

/** Screen rectangle of a lat/lon box (the map projection is linear in lat and lon). */
function boxToScreen(latMax: number, latMin: number, lonMin: number, lonMax: number) {
  const tl = toScreen(latMax, lonMin);
  const br = toScreen(latMin, lonMax);
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

/** Relief heatmap: hypsometric colours with hill-shading, pre-rendered once. */
function drawHeat(ctx: CanvasRenderingContext2D): void {
  const heat = terrain.heat;
  if (!heat) return;
  const r = boxToScreen(heat.latMax, heat.latMin, heat.lonMin, heat.lonMax);
  ctx.save();
  ctx.globalAlpha = Number(colors.heatOpacity) || 0.85;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(heat.image, r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** Spot heights in feet, as on an ATC terrain map; zoomed out only the highest ones. */
function drawPeaks(ctx: CanvasRenderingContext2D): void {
  ctx.font = `600 11px ${colors.font}`;
  ctx.fillStyle = colors.peak;
  const count = Math.round(PEAKS_AT_ZOOM_1 * view.zoom * view.zoom);
  for (const p of terrain.peaks.slice(0, count)) {
    const { x, y } = toScreen(p.lat, p.lon);
    if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 4, y + 3);
    ctx.lineTo(x - 4, y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillText(p.elevFt.toLocaleString('en-US'), x + 6, y + 4);
  }
}

/** Latitude of the top edge of Web Mercator tile row y at zoom z. */
function tileLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Live precipitation radar tiles, drawn over the contour map. */
function drawWeatherRadar(ctx: CanvasRenderingContext2D): void {
  if (!wx) return;
  const { zoom } = wx.info;
  ctx.save();
  ctx.globalAlpha = Number(colors.wxOpacity) || 0.8;
  ctx.imageSmoothingEnabled = false; // radar pixels, not a blur
  for (const [key, img] of wx.tiles) {
    const [x, y] = key.split('/').map(Number);
    const lonMin = (x / 2 ** zoom) * 360 - 180;
    const lonMax = ((x + 1) / 2 ** zoom) * 360 - 180;
    const r = boxToScreen(tileLat(y, zoom), tileLat(y + 1, zoom), lonMin, lonMax);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

/** Keeps the view over the area the map data covers. */
function clampView(): void {
  const halfW = width / 2 / pxPerNm;
  const halfH = height / 2 / pxPerNm;
  const limitX = Math.max(0, COVERAGE_NM.x - halfW);
  const limitY = Math.max(0, COVERAGE_NM.y - halfH);
  view.centerX = Math.min(limitX, Math.max(-limitX, view.centerX));
  view.centerY = Math.min(limitY, Math.max(-limitY, view.centerY));
}

async function loadWeatherRadar(): Promise<void> {
  try {
    const info = await api<WeatherRadarResponse>('GET', '/weather/radar');
    if (!info.available) return;
    if (info.time === wx?.info.time) return;
    const tiles = new Map<string, HTMLCanvasElement>();
    const palette = levelsFromTokens({
      faint: colors.wxFaint,
      light: colors.wxLight,
      moderate: colors.wxModerate,
      heavy: colors.wxHeavy,
      extreme: colors.wxExtreme,
    });
    for (let x = info.xMin; x <= info.xMax; x++) {
      for (let y = info.yMin; y <= info.yMax; y++) {
        const img = new Image();
        img.src =
          info.tileUrl.replace('{x}', String(x)).replace('{y}', String(y)) + `?t=${info.time}`;
        img.onload = () => {
          const recoloured = recolourTile(img, palette);
          if (recoloured) tiles.set(`${x}/${y}`, recoloured);
        };
      }
    }
    wx = { info, tiles };
    radarTime.value = info.time;
  } catch {
    // No radar right now; the next refresh tries again.
  }
}

function drawRings(ctx: CanvasRenderingContext2D): void {
  const c = nmToScreen(0, 0);
  ctx.strokeStyle = colors.ring;
  ctx.lineWidth = 1;
  for (let r = RING_NM; r <= RANGE_NM; r += RING_NM) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * pxPerNm, 0, Math.PI * 2);
    ctx.stroke();
  }
  const outer = RANGE_NM * pxPerNm;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - outer);
  ctx.lineTo(c.x, c.y + outer);
  ctx.moveTo(c.x - outer, c.y);
  ctx.lineTo(c.x + outer, c.y);
  ctx.stroke();

  ctx.font = `12px ${colors.font}`;
  ctx.fillStyle = colors.label;
  for (let r = RING_NM; r < RANGE_NM; r += RING_NM) {
    ctx.fillText(String(r), c.x + r * pxPerNm + 6, c.y - 4);
  }
}

/** Compass rose on the outer ring: ticks every 5°, headings every 10°, stronger every 30°. */
function drawCompass(ctx: CanvasRenderingContext2D): void {
  const c = nmToScreen(0, 0);
  const r = RANGE_NM * pxPerNm;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const major = deg % 30 === 0;
    const len = major ? 12 : deg % 10 === 0 ? 8 : 4;
    ctx.strokeStyle = major ? colors.compassMajor : colors.compass;
    ctx.lineWidth = major ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(c.x + sin * r, c.y - cos * r);
    ctx.lineTo(c.x + sin * (r - len), c.y - cos * (r - len));
    ctx.stroke();
    if (deg % 10 === 0) {
      const lr = r - len - 12;
      ctx.font = `${major ? '700 ' : ''}11px ${colors.font}`;
      ctx.fillStyle = major ? colors.compassMajor : colors.compass;
      ctx.fillText(heading(deg === 0 ? 360 : deg), c.x + sin * lr, c.y - cos * lr);
    }
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/** Runway 08/26 between its real thresholds, the ILS 26 extended centreline, the CRV VOR. */
function drawAirport(ctx: CanvasRenderingContext2D): void {
  if (!airspace) return;
  const [a, b] = airspace.runways.map((r) => toScreen(r.threshold.lat, r.threshold.lon));
  if (!a || !b) return;

  // ILS: dashed extended centreline from the threshold, out along the approach.
  for (const rwy of airspace.runways) {
    if (!rwy.ils) continue;
    const t = toScreen(rwy.threshold.lat, rwy.threshold.lon);
    const back = ((rwy.headingDeg + 180) * Math.PI) / 180; // towards where aircraft come from
    const out = (nm: number) => ({
      x: t.x + Math.sin(back) * nm * pxPerNm,
      y: t.y - Math.cos(back) * nm * pxPerNm,
    });
    const end = out(CENTRELINE_NM);
    ctx.strokeStyle = colors.centreline;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `12px ${colors.font}`;
    ctx.fillStyle = colors.muted;
    // Under the centreline, half way out, clear of the approach fix labels.
    const label = out(CENTRELINE_NM / 2);
    ctx.fillText(
      `ILS ${rwy.id} · ${rwy.ils.ident} ${rwy.ils.frequencyMhz}`,
      label.x - 50,
      label.y + 18,
    );
  }

  // The runway itself, stretched around its middle so it stays visible zoomed out.
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const scale = Math.max(1, RUNWAY_MIN_PX / len);
  const p = { x: mx + (a.x - mx) * scale, y: my + (a.y - my) * scale };
  const q = { x: mx + (b.x - mx) * scale, y: my + (b.y - my) * scale };
  ctx.strokeStyle = colors.runway;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.font = `12px ${colors.font}`;
  ctx.fillStyle = colors.muted;
  const [first, second] = airspace.runways;
  ctx.fillText(first.id, p.x - 22, p.y - 10); // the threshold of runway 08 is its west end
  ctx.fillText(second.id, q.x + 6, q.y - 10);
  ctx.fillStyle = colors.labelStrong;
  ctx.font = `700 12px ${colors.font}`;
  ctx.fillText(airspace.airport.icao, mx - 16, my + 24);

  // VOR/DME: a hexagon with its ident and frequency.
  for (const nav of airspace.navaids) {
    const v = toScreen(nav.lat, nav.lon);
    ctx.strokeStyle = colors.label;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i;
      const px = v.x + Math.cos(ang) * 6;
      const py = v.y + Math.sin(ang) * 6;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.font = `11px ${colors.font}`;
    ctx.fillStyle = colors.label;
    ctx.fillText(`${nav.ident} ${nav.frequencyMhz.replace(/0+$/, '')}`, v.x + 9, v.y + 16);
  }
}

/** Published points: approach fixes (IAF / IF) stand out; far ones are labelled when zoomed in. */
function drawFixes(ctx: CanvasRenderingContext2D): void {
  if (!airspace) return;
  const origin = { lat: airspace.airport.lat, lon: airspace.airport.lon };
  for (const fix of airspace.fixes) {
    const { x, y } = toScreen(fix.lat, fix.lon);
    if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
    const distanceNm = Math.hypot(
      (fix.lon - origin.lon) * 60 * COS_LAT0,
      (fix.lat - origin.lat) * 60,
    );
    const approach = !!fix.role;
    const size = approach ? 7 : 5;
    ctx.strokeStyle = approach ? colors.labelStrong : colors.label;
    ctx.lineWidth = approach ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y + size * 0.8);
    ctx.lineTo(x - size, y + size * 0.8);
    ctx.closePath();
    ctx.stroke();
    if (approach || distanceNm <= FIX_LABEL_NM || view.zoom >= FIX_LABEL_ZOOM) {
      ctx.font = `${approach ? '700 ' : ''}11px ${colors.font}`;
      ctx.fillStyle = approach ? colors.labelStrong : colors.label;
      ctx.fillText(approach ? `${fix.name} ${fix.role}` : fix.name, x + 9, y + 15);
    }
  }
}

/** The selected aircraft's flight plan: filed route faint, what is left of it in cyan. */
function drawRoute(ctx: CanvasRenderingContext2D, now: number): void {
  const route = radarFeed.route;
  const a = route && radarFeed.current.get(route.callsign);
  if (!route || !a || route.callsign !== selected) return;

  if (route.filed.length > 1) {
    ctx.strokeStyle = colors.faint;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    route.filed.forEach((w, i) => {
      const p = toScreen(w.lat, w.lon);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  const start = interpolated(a, now);
  const points = [start, ...route.remaining, LRCV].map((p) => toScreen(p.lat, p.lon));
  ctx.strokeStyle = colors.selected;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = colors.selected;
  ctx.font = `700 12px ${colors.font}`;
  route.remaining.forEach((w) => {
    const p = toScreen(w.lat, w.lon);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawProbe(ctx: CanvasRenderingContext2D, now: number): void {
  const probe = radarFeed.probe;
  if (!probe || now - probe.at > PROBE_SHOW_MS || probe.result.path.length < 2) return;
  ctx.strokeStyle = probe.result.conflicts.length ? colors.warning : colors.selected;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  probe.result.path.forEach((p, i) => {
    const s = toScreen(p.lat, p.lon);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Position between the last two server snapshots (4 Hz -> 60 fps). */
function interpolated(a: Aircraft, now: number): { lat: number; lon: number } {
  const prev = radarFeed.previous.get(a.callsign);
  const span = radarFeed.currentAt - radarFeed.previousAt;
  if (!prev || span <= 0) return a;
  const t = Math.min(1, Math.max(0, (now - radarFeed.currentAt) / span));
  return { lat: prev.lat + (a.lat - prev.lat) * t, lon: prev.lon + (a.lon - prev.lon) * t };
}

function commsColor(ageS: number): string {
  if (ageS >= limits.warningS) return colors.warning;
  if (ageS >= limits.cautionS) return colors.caution;
  return colors.muted;
}

/**
 * Heading rose around the selected aircraft: ticks every 10°, headings every 30°, the
 * actual heading (filled cyan), the assigned one while still turning (hollow), and a line
 * to the mouse with the exact heading and distance to give.
 */
function drawHeadingRose(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  a: Aircraft,
): void {
  const r = ROSE_RADIUS_PX;
  ctx.fillStyle = colors.roseBg;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r + 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.compass;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.stroke();

  const point = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: pos.x + Math.sin(rad) * radius, y: pos.y - Math.cos(rad) * radius };
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let deg = 0; deg < 360; deg += 10) {
    const major = deg % 30 === 0;
    const outer = point(deg, r);
    const inner = point(deg, r - (major ? 9 : 5));
    ctx.strokeStyle = major ? colors.compassMajor : colors.compass;
    ctx.lineWidth = major ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(outer.x, outer.y);
    ctx.lineTo(inner.x, inner.y);
    ctx.stroke();
    if (major) {
      const label = point(deg, r + 9);
      ctx.font = `700 11px ${colors.font}`;
      ctx.fillStyle = colors.compassMajor;
      ctx.fillText(heading(deg === 0 ? 360 : deg), label.x, label.y);
    }
  }

  // Assigned heading (hollow) while the aircraft still turns to it, actual heading (filled).
  const marker = (deg: number, filled: boolean) => {
    const tip = point(deg, r - 2);
    const left = point(deg - 5, r + 10);
    const right = point(deg + 5, r + 10);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.strokeStyle = colors.selected;
    ctx.fillStyle = colors.selected;
    ctx.lineWidth = 1.5;
    if (filled) ctx.fill();
    else ctx.stroke();
  };
  const assigned = a.target.headingDeg;
  if (assigned !== undefined && heading(assigned) !== heading(a.headingDeg))
    marker(assigned, false);
  marker(a.headingDeg, true);

  // Heading and distance from the aircraft to the mouse.
  if (cursor) {
    const dx = cursor.x - pos.x;
    const dy = cursor.y - pos.y;
    const px = Math.hypot(dx, dy);
    if (px > 20) {
      const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      ctx.strokeStyle = colors.selected;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const text = `HDG ${heading(Math.round(deg))} · ${(px / pxPerNm).toFixed(1)} NM`;
      ctx.font = `700 13px ${colors.font}`;
      const w = ctx.measureText(text).width + 12;
      ctx.fillStyle = colors.roseBg;
      ctx.fillRect(cursor.x + 10, cursor.y - 22, w, 20);
      ctx.fillStyle = colors.selected;
      ctx.textAlign = 'start';
      ctx.fillText(text, cursor.x + 16, cursor.y - 12);
    }
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function drawTraffic(ctx: CanvasRenderingContext2D, now: number): void {
  const pulse = 0.35 + 0.35 * Math.sin(now / 250);
  const targets: typeof hitTargets = [];

  for (const a of radarFeed.current.values()) {
    const smooth = interpolated(a, now);
    const pos = toScreen(smooth.lat, smooth.lon);
    const level = levels.get(a.callsign);
    const isSelected = a.callsign === selected;
    const color =
      level === 'warning'
        ? colors.warning
        : level === 'caution'
          ? colors.caution
          : isSelected
            ? colors.selected
            : colors.aircraft;

    // Alert halo, selection ring
    if (level) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (isSelected) {
      ctx.strokeStyle = colors.selected;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      drawHeadingRose(ctx, pos, a);
    }

    // History dots
    ctx.fillStyle = color;
    (radarFeed.trails.get(a.callsign) ?? []).forEach((p, i) => {
      const s = toScreen(p.lat, p.lon);
      ctx.globalAlpha = TRAIL_OPACITY[i] ?? 0.1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // One-minute leader line and the symbol
    const leaderPx = (a.speedKt / 60) * pxPerNm;
    const rad = (a.headingDeg * Math.PI) / 180;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + Math.sin(rad) * leaderPx, pos.y - Math.cos(rad) * leaderPx);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeRect(pos.x - 4.5, pos.y - 4.5, 9, 9);

    // Data block: callsign / level trend target / heading speed type / LC mm:ss
    // The selected aircraft's label moves outside its heading rose.
    const bx = pos.x + (isSelected ? ROSE_RADIUS_PX + 10 : 18);
    const by = pos.y - 38;
    ctx.fillStyle = color;
    ctx.font = `700 14px ${colors.font}`;
    ctx.fillText(a.callsign, bx, by);
    ctx.font = `14px ${colors.font}`;
    ctx.fillText(levelLine(a, ARROWS), bx, by + 17);
    ctx.fillText(`${heading(a.headingDeg)}° ${a.speedKt} ${a.type}`, bx, by + 34);
    ctx.font = `600 13px ${colors.font}`;
    ctx.fillStyle = commsColor(a.commsAgeS);
    ctx.fillText(`LC ${formatAge(a.commsAgeS)}`, bx, by + 51);

    targets.push({
      callsign: a.callsign,
      x: pos.x,
      y: pos.y,
      box: new DOMRect(bx, by - 14, 120, 70),
    });
  }
  hitTargets = targets;
}

// --- Interaction: click to select, middle-drag to pan, wheel / buttons to zoom ---------------

let drag: { x: number; y: number; centerX: number; centerY: number; moved: boolean } | null = null;

function localPoint(event: MouseEvent): { x: number; y: number } {
  const rect = canvas.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onClick(event: MouseEvent): void {
  if (event.button !== 0) return;
  const { x, y } = localPoint(event);
  let best: string | null = null;
  let bestDistance = HIT_RADIUS_PX;
  for (const t of hitTargets) {
    const d = Math.hypot(t.x - x, t.y - y);
    const inBlock = x >= t.box.left && x <= t.box.right && y >= t.box.top && y <= t.box.bottom;
    if (inBlock && !best) best = t.callsign;
    if (d < bestDistance) {
      bestDistance = d;
      best = t.callsign;
    }
  }
  traffic.select(best === selected ? null : best);
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 1) return;
  event.preventDefault(); // no autoscroll cursor
  canvas.value?.setPointerCapture(event.pointerId);
  drag = {
    x: event.clientX,
    y: event.clientY,
    centerX: view.centerX,
    centerY: view.centerY,
    moved: false,
  };
  panning.value = true;
}

function onPointerMove(event: PointerEvent): void {
  cursor = localPoint(event);
  if (!drag) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
  drag.moved = true;
  view.centerX = drag.centerX - dx / pxPerNm;
  view.centerY = drag.centerY + dy / pxPerNm;
  clampView();
}

function onPointerUp(event: PointerEvent): void {
  if (!drag) return;
  canvas.value?.releasePointerCapture(event.pointerId);
  drag = null;
  panning.value = false;
}

/** Zoom keeping the map point under (x, y) where it is. */
function zoomAt(factor: number, x = width / 2, y = height / 2): void {
  const before = screenToNm(x, y);
  view.zoom = Math.min(ZOOM_MAX, Math.max(minZoom(), view.zoom * factor));
  updateScale();
  const after = screenToNm(x, y);
  view.centerX += before.x - after.x;
  view.centerY += before.y - after.y;
  clampView();
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  const { x, y } = localPoint(event);
  zoomAt(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, x, y);
}

function resetView(): void {
  view.zoom = 1;
  view.centerX = 0;
  view.centerY = 0;
  updateScale();
}

async function loadMap(): Promise<void> {
  try {
    airspace = await api<AirspaceResponse>('GET', '/airspace');
  } catch {
    // The scope works without fixes; they come back on the next load.
  }
  terrain = await loadTerrain(LRCV, COS_LAT0, parseStops(colors.heatStops));
}

onMounted(() => {
  colors = loadColors();
  resize();
  resizeObserver = new ResizeObserver(resize);
  if (wrapper.value) resizeObserver.observe(wrapper.value);
  // Fonts arrive after the first frames; re-read tokens once they are ready.
  void document.fonts?.ready.then(() => (colors = loadColors()));
  void loadMap();
  void loadWeatherRadar();
  radarTimer = setInterval(() => void loadWeatherRadar(), RADAR_REFRESH_MS);
  frame = requestAnimationFrame(draw);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  clearInterval(radarTimer);
});
</script>

<template>
  <div ref="wrapper" class="radar-scope">
    <canvas
      ref="canvas"
      :class="{ panning }"
      role="img"
      aria-label="Radar scope around Craiova airport; click an aircraft to select it, middle-drag to pan, wheel to zoom"
      @click="onClick"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="cursor = null"
      @auxclick.prevent
      @wheel="onWheel"
    />
    <div class="map-modes mono" role="group" aria-label="Map background">
      <button
        v-for="m in MAP_MODES"
        :key="m.id"
        type="button"
        :class="{ on: mapMode === m.id }"
        :aria-pressed="mapMode === m.id"
        @click="setMapMode(m.id)"
      >
        {{ m.label }}
      </button>
    </div>
    <div v-if="mapMode === 'terrain'" class="map-legend mono" aria-label="Terrain legend">
      <span class="scale terrain-scale" aria-hidden="true" />
      <span class="ticks"
        ><span>0</span><span>2,000</span><span>5,000</span><span>8,000 ft</span></span
      >
      <span class="note">SPOT HEIGHTS IN FT · SRTM</span>
    </div>
    <div v-else-if="mapMode === 'wx'" class="map-legend mono" aria-label="Weather radar legend">
      <span class="wx-keys">
        <span><i class="key light" />LGT</span>
        <span><i class="key moderate" />MOD</span>
        <span><i class="key heavy" />HVY</span>
        <span><i class="key extreme" />EXTR</span>
      </span>
      <span class="note">
        {{
          radarTime ? `PRECIP RADAR ${radarTime.slice(11, 16)}Z · RAINVIEWER` : 'RADAR UNAVAILABLE'
        }}
      </span>
    </div>
    <div class="map-controls" role="group" aria-label="Map view">
      <button type="button" aria-label="Zoom in" title="Zoom in" @click="zoomAt(ZOOM_STEP)">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <span class="mono zoom">{{ zoomLabel }}</span>
      <button type="button" aria-label="Zoom out" title="Zoom out" @click="zoomAt(1 / ZOOM_STEP)">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Back to the initial view"
        title="Back to the initial view"
        @click="resetView"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.radar-scope {
  position: absolute;
  inset: 0;
  background: var(--color-radar-bg);
}

canvas {
  display: block;
  cursor: crosshair;
  touch-action: none;
}

canvas.panning {
  cursor: grabbing;
}

/* Map background switcher, top centre of the scope. */
.map-modes {
  position: absolute;
  top: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--color-panel-overlay);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-card);
}

.map-modes button {
  min-height: 32px;
  padding: 0 var(--space-3);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  background: transparent;
  border: var(--border-width) solid transparent;
  border-radius: var(--radius);
}

.map-modes button.on {
  color: var(--color-atc);
  background: var(--color-atc-selected-bg);
  border-color: var(--color-atc);
}

/* Under the map switcher, small, so it never hides traffic for long. */
.map-legend {
  position: absolute;
  bottom: 120px;
  left: var(--space-4);
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-panel-overlay);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius);
}

.scale {
  width: 220px;
  height: 8px;
  border-radius: 4px;
}

.terrain-scale {
  background: var(--terrain-heat-gradient);
}

.ticks {
  width: 220px;
  display: flex;
  justify-content: space-between;
}

.wx-keys {
  display: flex;
  gap: var(--space-3);
}

.wx-keys span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.key {
  width: 12px;
  height: 8px;
  border-radius: 2px;
}

.key.light {
  background: var(--wx-light);
}

.key.moderate {
  background: var(--wx-moderate);
}

.key.heavy {
  background: var(--wx-heavy);
}

.key.extreme {
  background: var(--wx-extreme);
}

.note {
  letter-spacing: 0.06em;
  color: var(--color-text-faint);
}

.map-controls {
  position: absolute;
  right: var(--space-4);
  bottom: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px;
  background: var(--color-panel-overlay);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-card);
}

.map-controls button {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.map-controls button:hover {
  color: var(--color-atc);
  border-color: var(--color-atc);
}

.zoom {
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
