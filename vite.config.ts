import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Profile: 'mixer' (padrão) ou 'academy'
 * Lido de process.env.PROFILE durante build.
 *
 * Uso:
 *   PROFILE=mixer npm run build:renderer
 *   PROFILE=academy npm run build:renderer
 */
const profile = (process.env.PROFILE || 'mixer') as 'mixer' | 'academy';

// Renderer do Electron: carregado por file://, por isso caminhos relativos e sem inline scripts.
export default defineConfig({
  define: {
    'process.env.PROFILE': JSON.stringify(profile),
  },
  root: resolve(root, 'apps/desktop/src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': resolve(root, 'packages/domain/src/index.ts'),
      '@ui': resolve(root, 'packages/ui/src'),
      '@config': resolve(root, 'src/config'),
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
