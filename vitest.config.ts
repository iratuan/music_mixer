import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Configuração própria: o vite.config.ts aponta a raiz para o renderer (build do app).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'apps/desktop/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});
