import { computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useAlertStore } from '../stores/useAlertStore';
import { useSectorStore } from '../stores/useSectorStore';
import { useSupervisorStore } from '../stores/useSupervisorStore';

const APP = 'TowerWhisper';
const FAVICON = '/favicon.svg';
const FAVICON_ALERT = '/favicon-alert.svg';

/**
 * The browser tab says where you are ('Craiova Approach · ATC', 'Overview · Supervisor'...),
 * with the number of active alerts in front and a red favicon while there are any, so a
 * background tab still shows that something needs attention.
 */
export function usePageTitle(): void {
  const route = useRoute();
  const sector = useSectorStore();
  const alerts = useAlertStore();
  const supervisor = useSupervisorStore();

  const page = computed(() => {
    const name = sector.current?.name;
    switch (route.name) {
      case 'login':
        return 'Sign in';
      case 'controller':
        return name ? `${name} · ATC` : 'ATC';
      case 'supervisor':
        return 'Overview · Supervisor';
      case 'supervisor-live':
        return name ? `${name} · Live view` : 'Live view';
      case 'supervisor-replay':
        return name ? `Replay · ${name}` : 'Replay';
      case 'supervisor-alerts':
        return 'Alert history · Supervisor';
      case 'supervisor-users':
        return 'Accounts · Supervisor';
      case 'demo':
        return name ? `Demo control · ${name}` : 'Demo control';
      default:
        return null;
    }
  });

  /** Live alerts that matter on this page (none in a replay: those are history). */
  const activeAlerts = computed(() => {
    switch (route.name) {
      case 'controller':
      case 'supervisor-live':
      case 'demo':
        return alerts.active.length;
      case 'supervisor':
      case 'supervisor-alerts':
      case 'supervisor-users':
        return supervisor.activeAlerts.length;
      default:
        return 0;
    }
  });

  watchEffect(() => {
    const count = activeAlerts.value;
    const title = page.value ? `${page.value} · ${APP}` : APP;
    document.title = count > 0 ? `(${count}) ${title}` : title;
    const icon = document.getElementById('favicon') as HTMLLinkElement | null;
    if (icon) icon.href = count > 0 ? FAVICON_ALERT : FAVICON;
  });
}
