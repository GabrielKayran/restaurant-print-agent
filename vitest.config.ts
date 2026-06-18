import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/test-setup.ts'],
    include: ['tests/**/*.spec.ts'],
  },
});
