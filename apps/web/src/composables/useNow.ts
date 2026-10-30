import { onBeforeUnmount, ref } from 'vue';

/** A ticking Date.now() for clocks and "3 s ago" labels. */
export function useNow(intervalMs = 1000) {
  const now = ref(Date.now());
  const timer = setInterval(() => (now.value = Date.now()), intervalMs);
  onBeforeUnmount(() => clearInterval(timer));
  return now;
}
