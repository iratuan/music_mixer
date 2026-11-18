import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Academy (web). Saída estática em apps/academy/dist, servível de qualquer pasta (base relativa):
 * é o mesmo pacote que os shells desktop (E6) e Android (E7) vão embrulhar.
 */
export default defineConfig({
  root: here('.'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': here('../../packages/domain/src/index.ts'),
      '@baixaria/music-theory': here('../../packages/music-theory/src/index.ts'),
    },
  },
  build: {
    outDir: here('dist'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
