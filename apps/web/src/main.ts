import { createPinia } from 'pinia';
import { createApp } from 'vue';
import DesktopOnly from './components/DesktopOnly.vue';
import './styles/tokens.css';
import './styles/base.css';
import { isPhonePage, isSmallScreen, SMALL_SCREEN_QUERY } from './utils/screen';

/**
 * A phone (or any screen too small for the console) gets only the "desktop only" screen: the
 * app, its router and its socket are never loaded. It reloads into the app if the window
 * grows large enough. The demo panel is the exception: it is made for phones.
 */
if (isSmallScreen() && !isPhonePage(window.location.pathname)) {
  createApp(DesktopOnly).mount('#app');
  window.matchMedia(SMALL_SCREEN_QUERY).addEventListener('change', (event) => {
    if (!event.matches) window.location.reload();
  });
} else {
  void Promise.all([import('./App.vue'), import('./router')]).then(
    ([{ default: App }, { router }]) => {
      createApp(App).use(createPinia()).use(router).mount('#app');
    },
  );
}
