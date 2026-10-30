import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const API = 'http://localhost:3000';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // Compile the shared contracts from source, so `pnpm --filter web dev` never needs a rebuild.
    alias: {
      '@towerwhisper/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
