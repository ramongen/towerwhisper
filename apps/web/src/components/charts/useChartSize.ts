import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/** Width of a chart's box, followed with a ResizeObserver (charts are drawn in pixels). */
export function useChartSize(el: Ref<HTMLElement | null>, fallback = 600) {
  const width = ref(fallback);
  let observer: ResizeObserver | null = null;

  onMounted(() => {
    if (!el.value) return;
    width.value = el.value.clientWidth || fallback;
    observer = new ResizeObserver(([entry]) => {
      width.value = Math.max(200, Math.round(entry.contentRect.width));
    });
    observer.observe(el.value);
  });
  onBeforeUnmount(() => observer?.disconnect());

  return width;
}

/** Round axis maximum and its ticks: 0, step, 2·step... (at most ~4 gridlines). */
export function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  return { top, ticks };
}
