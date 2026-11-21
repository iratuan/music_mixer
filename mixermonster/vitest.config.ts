import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
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
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.ts', '../packages/*/tests/**/*.test.ts'],
    environment: 'node',
  },
});
