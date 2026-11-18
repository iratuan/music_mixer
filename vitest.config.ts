import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

// Configuração própria: o vite.config.ts aponta a raiz para o renderer do Mixer (build do app).
export default defineConfig({
  root,
  resolve: {
    alias: {
      // Domínio pedagógico do Academy (o Mixer não o importa).
      '@domain': fileURLToPath(new URL('./apps/academy/src/domain/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'apps/mixer/tests/**/*.test.ts', 'apps/academy/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});
