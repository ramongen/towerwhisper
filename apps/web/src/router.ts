import type { UserRole } from '@towerwhisper/shared';
import { createRouter, createWebHistory, type RouteLocationRaw } from 'vue-router';
import { useAuthStore } from './stores/useAuthStore';

declare module 'vue-router' {
  interface RouteMeta {
    /** No login needed. */
    public?: boolean;
    /** Only this role (others go to their own home). */
    role?: UserRole;
  }
}

/** Where an account lands after login: an ATC on its sector, a supervisor on the dashboard. */
export function homeFor(role: UserRole | undefined): RouteLocationRaw {
  return role === 'supervisor' ? { name: 'supervisor' } : { name: 'controller' };
}

// Every view is loaded on demand: a phone that only gets the "desktop only" screen, or the
// demo panel, never downloads the radar and the dashboard.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { public: true },
    },
    { path: '/', name: 'home', redirect: () => homeFor(useAuthStore().user?.role) },
    {
      path: '/atc',
      name: 'controller',
      component: () => import('./views/ControllerView.vue'),
      meta: { role: 'atc' },
    },
    {
      path: '/supervisor',
      component: () => import('./views/supervisor/SupervisorLayout.vue'),
      meta: { role: 'supervisor' },
      children: [
        {
          path: '',
          name: 'supervisor',
          component: () => import('./views/supervisor/OverviewView.vue'),
        },
        {
          path: 'live/:sectorId',
          name: 'supervisor-live',
          component: () => import('./views/supervisor/LiveSectorView.vue'),
        },
        {
          path: 'alerts',
          name: 'supervisor-alerts',
          component: () => import('./views/supervisor/AlertsView.vue'),
        },
        {
          path: 'replay',
          name: 'supervisor-replay',
          component: () => import('./views/supervisor/ReplayView.vue'),
        },
        {
          path: 'users',
          name: 'supervisor-users',
          component: () => import('./views/supervisor/UsersView.vue'),
        },
      ],
    },
    {
      path: '/demo',
      name: 'demo',
      component: () => import('./views/DemoView.vue'),
      meta: { public: true },
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    return to.name === 'login' && auth.loggedIn ? homeFor(auth.user?.role) : true;
  }
  if (!auth.loggedIn)
    return { name: 'login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} };
  const role = to.matched.find((r) => r.meta.role)?.meta.role;
  if (role && role !== auth.user?.role) return homeFor(auth.user?.role);
  return true;
});
