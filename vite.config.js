import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    reportCompressedSize: false,
    // The three.js core chunk is ~505 kB minified and can't be split further;
    // app chunks sit well under the default 500 kB.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // three.js core changes far less often than app code: keep it in its own
        // chunk so a redeploy doesn't invalidate the cached vendor bytes. Addons
        // (examples/jsm) stay with their importers so lazy ones like
        // ColladaLoader remain on-demand chunks.
        manualChunks(id) {
          if (id.replace(/\\/g, '/').includes('node_modules/three/build/')) return 'three';
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    // mp4-muxer is only reached through the lazily imported export pipeline.
    // Pre-bundle it so the first export in dev doesn't trigger Vite's
    // "optimized dependencies changed" full reload (losing the loaded track).
    include: ['mp4-muxer'],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
