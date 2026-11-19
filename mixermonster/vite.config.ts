import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = (p: string) => resolve(fileURLToPath(new URL('.', import.meta.url)), p);

// Renderer do MixerMonster (Electron): carregado por file://, por isso caminhos relativos e sem inline scripts.
export default defineConfig({
  root: here('src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@baixaria/ui-core/tokens.css': here('packages/ui-core/src/tokens.css'),
      '@baixaria/music-theory': here('packages/music-theory/src/index.ts'),
      '@baixaria/audio-synth': here('packages/audio-synth/src/index.ts'),
      '@baixaria/ui-core': here('packages/ui-core/src/index.ts'),
      '@baixaria/exchange-contract': here('packages/exchange-contract/src/index.ts'),
    },
  },
  build: {
    outDir: here('dist/renderer'),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
