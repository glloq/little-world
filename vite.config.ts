import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/little-world/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        game: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor/index.html'),
      },
    },
  },
});
