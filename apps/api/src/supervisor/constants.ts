import type { AnalyticsRange } from '@towerwhisper/shared';

export const ANALYTICS_RANGE_S: Record<AnalyticsRange, number> = {
  '1h': 3600,
  '24h': 24 * 3600,
  '7d': 7 * 24 * 3600,
  '30d': 30 * 24 * 3600,
};

/** Timeline buckets: about 24-30 bars whatever the range. */
export const ANALYTICS_BUCKET_S: Record<AnalyticsRange, number> = {
  '1h': 120,
  '24h': 3600,
  '7d': 6 * 3600,
  '30d': 24 * 3600,
};

/** How long the controller took to resolve an alert. */
export const RESOLVE_BUCKETS: { label: string; fromS: number; toS: number | null }[] = [
  { label: '< 10 s', fromS: 0, toS: 10 },
  { label: '10–30 s', fromS: 10, toS: 30 },
  { label: '30–60 s', fromS: 30, toS: 60 },
  { label: '1–2 min', fromS: 60, toS: 120 },
  { label: '2–5 min', fromS: 120, toS: 300 },
  { label: '> 5 min', fromS: 300, toS: null },
];

export const RECENT_ALERTS = 25;
export const REPLAY_SESSIONS_LIMIT = 60;
/** A replay never sends more radar frames than this (longer sessions are thinned out). */
export const MAX_REPLAY_FRAMES = 6000;
