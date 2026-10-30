import { createRouter, createWebHistory } from 'vue-router';
import ControllerView from './views/ControllerView.vue';
import DemoView from './views/DemoView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'controller', component: ControllerView },
    { path: '/demo', name: 'demo', component: DemoView },
  ],
});
