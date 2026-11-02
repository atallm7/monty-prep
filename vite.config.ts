import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  // the validator rewrites meta.generated.json constantly; don't hot-reload on it (restart dev server to pick up new metadata)
  server: { host: true, port: 5173, watch: { ignored: ['**/src/data/meta.generated.json'] } },
  build: { chunkSizeWarningLimit: 4000, outDir: 'dist' },
});
