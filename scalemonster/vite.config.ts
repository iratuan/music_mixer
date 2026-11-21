import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * ScaleMonster (web). Saída estática em dist, servível de qualquer pasta (base relativa).
 * É o mesmo build que os shells desktop e Android embrulham.
 */
export default defineConfig({
  root: here('.'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': here('src/domain/index.ts'),
      '@baixaria/ui-core/tokens.css': here('../packages/ui-core/src/tokens.css'),
      '@baixaria/music-theory': here('../packages/music-theory/src/index.ts'),
      '@baixaria/audio-synth': here('../packages/audio-synth/src/index.ts'),
      '@baixaria/ui-core': here('../packages/ui-core/src/index.ts'),
      '@baixaria/exchange-contract': here('../packages/exchange-contract/src/index.ts'),
      // Uma única cópia de React e do Vitest: vêm do próprio produto, não da pasta compartilhada.
      react: here('node_modules/react'),
      'react-dom': here('node_modules/react-dom'),
      vitest: here('node_modules/vitest'),
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
