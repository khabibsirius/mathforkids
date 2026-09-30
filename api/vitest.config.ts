import { defineConfig } from 'vitest/config';

/**
 * Tests target src/domain — the pure business logic.
 *
 * Nothing here needs a database, a DI container or a running server, which is
 * the payoff for keeping the generator, the adaptive rule, the scoring and the
 * safety gate free of Prisma and Nest imports. Whole-system behaviour is
 * covered separately by scripts/smoke.mjs against a live API.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    reporters: ['verbose'],
    coverage: {
      include: ['src/domain/**/*.ts'],
      reporter: ['text'],
    },
  },
});
