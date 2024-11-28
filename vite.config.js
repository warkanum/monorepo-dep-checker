import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [
        'fs',
        'path',
        'url',
        'chalk',
        'semver',
        'yargs',
        'yargs/helpers'
      ]
    },
    target: 'node14',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true
  }
});
