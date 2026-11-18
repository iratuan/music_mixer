import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// Renderer do Mixer (Electron): carregado por file://, por isso caminhos relativos e sem inline scripts.
export default defineConfig({
  root: resolve(root, 'apps/mixer/src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@baixaria/music-theory': resolve(root, 'packages/music-theory/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(root, 'dist/renderer'),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
