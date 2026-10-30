import { onBeforeUnmount, onMounted, ref } from 'vue';
import { SHORTCUTS } from '../components/demoFaults';
import { useDemoStore } from '../stores/useDemoStore';

/**
 * Big-screen shortcuts (spec section 11): D opens the demo drawer, 1-9 arm a fault in
 * "once" mode, R resets the scenario, S shows / hides the results. Space stays PTT.
 */
export function useDemoShortcuts() {
  const demo = useDemoStore();
  const drawerOpen = ref(false);

  function onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;

    const key = event.key.toLowerCase();
    if (key === 'd') {
      drawerOpen.value = !drawerOpen.value;
    } else if (key === 'r') {
      void demo.resetScenario().catch(() => undefined);
    } else if (key === 's') {
      void demo.trigger('stats-overlay', { visible: !demo.overlayVisible }).catch(() => undefined);
    } else if (/^[1-9]$/.test(key)) {
      const shortcut = SHORTCUTS[Number(key) - 1];
      if (!shortcut) return;
      const patch =
        shortcut.type === 'readback'
          ? { readback: { kind: shortcut.kind, once: true } }
          : { execution: { kind: shortcut.kind, once: true } };
      void demo.update(patch).catch(() => undefined);
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

  return { drawerOpen };
}
