import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// Renderer do Electron: carregado por file://, por isso caminhos relativos e sem inline scripts.
export default defineConfig({
  root: resolve(root, 'apps/desktop/src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': resolve(root, 'packages/domain/src/index.ts'),
      '@ui': resolve(root, 'packages/ui/src'),
    },
  },
  build: {
    outDir: resolve(root, 'dist/renderer'),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
