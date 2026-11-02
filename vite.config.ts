import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  // the validator rewrites meta.generated.json constantly; don't hot-reload on it (restart dev server to pick up new metadata)
  server: { host: true, port: 5173, watch: { ignored: ['**/src/data/meta.generated.json'] } },
  build: {
    chunkSizeWarningLimit: 8000, outDir: 'dist',
    rollupOptions: { output: {
      // group the ~1000 question files and 90 sims into a few dozen chunks (keeps deployable file count low)
      manualChunks(id) {
        const q = id.match(/content\/questions\/q(\d{4})\.md/); if (q) return 'q' + String(Math.floor(+q[1] / 50)).padStart(2, '0');
        const s = id.match(/src\/sims\/(impl|models)\/([a-z])/); if (s) return 'sims-' + (s[2] < 'g' ? 'a' : s[2] < 'p' ? 'b' : 'c');
        if (id.includes('node_modules/mermaid') || id.includes('node_modules/cytoscape') || id.includes('node_modules/d3')) return undefined;
      },
    } },
  },
});
