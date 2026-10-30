<script setup lang="ts">
import type { Aircraft } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import { useAlertStore, type AlertLevel } from '../stores/useAlertStore';
import { useDemoStore } from '../stores/useDemoStore';
import { radarFeed, useTrafficStore } from '../stores/useTrafficStore';
import { formatAge, levelLine } from '../utils/format';
import { readTokens } from '../utils/tokens';

/** Craiova (LRCV): the centre of the scope. */
const LRCV = { lat: 44.3181, lon: 23.8886 };
const COS_LAT0 = Math.cos((LRCV.lat * Math.PI) / 180);
const RANGE_NM = 40;
const RING_NM = 10;
/** The scope height shows 72 NM, so the 40 NM ring just exceeds it (as in the design). */
const VIEW_HEIGHT_NM = 72;
const RUNWAY_HALF_NM = 1.5;
const CENTRELINE_NM = 20;
/** Display-only reporting points. */
const FIXES = [
  { name: 'KOVAD', x: -26.3, y: 0 },
  { name: 'RENOT', x: 12, y: 18.5 },
  { name: 'PASIX', x: 22, y: -22.3 },
  { name: 'TUBIL', x: -16.3, y: -27.3 },
];
const TRAIL_OPACITY = [0.7, 0.55, 0.4, 0.28, 0.16];
const PROBE_SHOW_MS = 20_000;
const ARROWS = { up: '↑', down: '↓', level: '=' };
const HIT_RADIUS_PX = 22;

const traffic = useTrafficStore();
const { selectedCallsign } = storeToRefs(traffic);
const alerts = useAlertStore();
const demo = useDemoStore();

const wrapper = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

// Reactive state copied into plain variables, so the 60 fps loop never touches Vue reactivity.
let selected: string | null = null;
let levels = new Map<string, AlertLevel>();
let limits = { cautionS: 900, warningS: 1800 };
watchEffect(() => {
  selected = selectedCallsign.value;
  levels = new Map(alerts.levelByCallsign);
  if (demo.faults) limits = { ...demo.faults.commsLimits };
});

let colors = {} as ReturnType<typeof loadColors>;
function loadColors() {
  return readTokens({
    bg: '--color-radar-bg',
    ring: '--radar-ring',
    centreline: '--radar-centreline',
    runway: '--radar-runway',
    label: '--radar-label',
    labelStrong: '--color-text-secondary',
    muted: '--color-text-muted',
    aircraft: '--radar-aircraft',
    selected: '--color-atc',
    caution: '--color-caution',
    warning: '--color-warning',
    font: '--font-data',
  });
}

let width = 0;
let height = 0;
let pxPerNm = 12;
let frame = 0;
let resizeObserver: ResizeObserver | null = null;
/** Screen positions of the last frame, for click hit-testing. */
let hitTargets: { callsign: string; x: number; y: number; box: DOMRect }[] = [];

function toScreen(lat: number, lon: number): { x: number; y: number } {
  const xNm = (lon - LRCV.lon) * 60 * COS_LAT0;
  const yNm = (lat - LRCV.lat) * 60;
  return { x: width / 2 + xNm * pxPerNm, y: height / 2 - yNm * pxPerNm };
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
  pxPerNm = height / VIEW_HEIGHT_NM;
}

function draw(now: number): void {
  const ctx = canvas.value?.getContext('2d');
  if (ctx && width > 0) {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    drawMap(ctx);
    drawProbe(ctx, now);
    drawTraffic(ctx, now);
    drawLegend(ctx);
  }
  frame = requestAnimationFrame(draw);
}

function drawMap(ctx: CanvasRenderingContext2D): void {
  const cx = width / 2;
  const cy = height / 2;
  ctx.strokeStyle = colors.ring;
  ctx.lineWidth = 1;
  for (let r = RING_NM; r <= RANGE_NM; r += RING_NM) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * pxPerNm, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, height);
  ctx.moveTo(0, cy);
  ctx.lineTo(width, cy);
  ctx.stroke();

  ctx.font = `12px ${colors.font}`;
  ctx.fillStyle = colors.label;
  for (let r = RING_NM; r <= RANGE_NM; r += RING_NM) {
    ctx.fillText(r === RANGE_NM ? `${r} NM` : String(r), cx + r * pxPerNm + 6, cy - 4);
  }

  // ILS 09 extended centreline (arrivals from the west) and the runway.
  const west = cx - RUNWAY_HALF_NM * pxPerNm;
  ctx.strokeStyle = colors.centreline;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(west, cy);
  ctx.lineTo(west - CENTRELINE_NM * pxPerNm, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = colors.runway;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(west, cy);
  ctx.lineTo(cx + RUNWAY_HALF_NM * pxPerNm, cy);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.fillStyle = colors.muted;
  ctx.fillText('09', west - 20, cy - 12);
  ctx.fillText('27', cx + RUNWAY_HALF_NM * pxPerNm + 4, cy - 12);
  ctx.fillText('ILS 09', west - (CENTRELINE_NM - 2) * pxPerNm, cy - 8);
  ctx.fillStyle = colors.labelStrong;
  ctx.font = `700 12px ${colors.font}`;
  ctx.fillText('LRCV', cx - 16, cy + 24);

  ctx.font = `12px ${colors.font}`;
  ctx.strokeStyle = colors.label;
  ctx.fillStyle = colors.label;
  ctx.lineWidth = 1.25;
  for (const fix of FIXES) {
    const x = cx + fix.x * pxPerNm;
    const y = cy - fix.y * pxPerNm;
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 7, y + 6);
    ctx.lineTo(x - 7, y + 6);
    ctx.closePath();
    ctx.stroke();
    ctx.fillText(fix.name, x + 10, y + 18);
  }
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

    // Data block: callsign / level trend target / speed type / LC mm:ss
    const bx = pos.x + 18;
    const by = pos.y - 38;
    ctx.fillStyle = color;
    ctx.font = `700 14px ${colors.font}`;
    ctx.fillText(a.callsign, bx, by);
    ctx.font = `14px ${colors.font}`;
    ctx.fillText(levelLine(a, ARROWS), bx, by + 17);
    ctx.fillText(`${a.speedKt} ${a.type}`, bx, by + 34);
    ctx.font = `600 13px ${colors.font}`;
    ctx.fillStyle = commsColor(a.commsAgeS);
    ctx.fillText(`LC ${formatAge(a.commsAgeS)}`, bx, by + 51);

    targets.push({
      callsign: a.callsign,
      x: pos.x,
      y: pos.y,
      box: new DOMRect(bx, by - 14, 96, 70),
    });
  }
  hitTargets = targets;
}

function drawLegend(ctx: CanvasRenderingContext2D): void {
  const unit = limits.cautionS < 120 ? 'S' : 'MIN';
  const value = (s: number) => (unit === 'S' ? s : Math.round(s / 60));
  ctx.font = `12px ${colors.font}`;
  ctx.fillStyle = colors.label;
  // Top-left: the bottom of the scope belongs to the PTT bar.
  ctx.fillText(
    `LC = TIME SINCE LAST CONTACT · AMBER ≥ ${value(limits.cautionS)} ${unit} · RED ≥ ${value(limits.warningS)} ${unit}`,
    20,
    28,
  );
  ctx.fillText(`RANGE ${RANGE_NM} NM · RINGS ${RING_NM} NM · SIMULATED TRAFFIC`, 20, 48);
}

function onClick(event: MouseEvent): void {
  const rect = canvas.value!.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
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

onMounted(() => {
  colors = loadColors();
  resize();
  resizeObserver = new ResizeObserver(resize);
  if (wrapper.value) resizeObserver.observe(wrapper.value);
  // Fonts arrive after the first frames; re-read tokens once they are ready.
  void document.fonts?.ready.then(() => (colors = loadColors()));
  frame = requestAnimationFrame(draw);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
});
</script>

<template>
  <div ref="wrapper" class="radar-scope">
    <canvas
      ref="canvas"
      role="img"
      aria-label="Radar scope around Craiova airport; click an aircraft to select it"
      @click="onClick"
    />
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
}
</style>
