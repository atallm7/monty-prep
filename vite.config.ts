import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: './',
    plugins: [react()],
    // the validator rewrites meta.generated.json constantly; don't hot-reload on it (restart dev server to pick up new metadata)
    server: { host: true, port: 5173, watch: { ignored: ['**/src/data/meta.generated.json'] } },
    resolve: artifact ? {
      alias: [
        // claude.ai artifact frame: only inline scripts run, so content is fetched as JSON and mermaid comes from the CDN
        { find: /^(.*)\/contentSource$/, replacement: path.resolve(__dirname, 'src/lib/contentSource.artifact.ts') },
        { find: /^(.*)\/mermaidLoader$/, replacement: path.resolve(__dirname, 'src/lib/mermaidLoader.artifact.ts') },
      ],
    } : undefined,
    build: artifact ? {
      outDir: 'dist-artifact', assetsInlineLimit: 100_000_000, cssCodeSplit: false, modulePreload: false, chunkSizeWarningLimit: 20000,
      rollupOptions: { output: { inlineDynamicImports: true } },
    } : {
      chunkSizeWarningLimit: 8000, outDir: 'dist',
      rollupOptions: { output: {
        // Chunking: shared libraries in one vendor chunk; questions and sims stay as small per-file lazy chunks.
        manualChunks(id) {
          // Libraries (React, router, KaTeX…) get their own chunk; leaving them in the entry chunk created an
          // entry ↔ sims chunk cycle where jsx-runtime was still undefined when the sim chunks evaluated.
          if (id.includes('node_modules')) return /mermaid|cytoscape|dagre|d3-|elkjs|khroma|lodash-es|dompurify/.test(id) ? undefined : 'vendor';
          // Question pages: no manual grouping, so each question is its own small lazy chunk (~20–40 KB) instead of a 50-question bundle.
          // Sims: also left to Rollup, so a page that embeds one sim loads only that sim (+ shared kit).
          return undefined;
        },
      } },
    },
  };
});
