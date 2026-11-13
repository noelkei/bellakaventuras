import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', assetsDir: 'build', chunkSizeWarningLimit: 2500, assetsInlineLimit: 0 },
});
