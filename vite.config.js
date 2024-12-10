import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      // eslint-disable-next-line no-undef
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    ssr:true,
    rollupOptions: {
      external: [
        'fs',
        'path',
        'url',
        'chalk',
        'semver',
        'yargs',
        'yargs/helpers'
      ],
    },
    target: 'node14',
    
    outDir: 'dist',
    
    emptyOutDir: true,
    sourcemap: true
  }
});
