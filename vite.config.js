import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    reportCompressedSize: false,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
