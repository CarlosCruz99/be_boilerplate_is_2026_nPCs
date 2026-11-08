import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Las suites comparten PostgreSQL; las carreras se prueban dentro de cada caso.
    fileParallelism: false,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
