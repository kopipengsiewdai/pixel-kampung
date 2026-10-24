import { defineConfig } from 'vitest/config';

/** The headless browser check of the watch page (`npm run test:page`); needs Playwright's Chromium. */
export default defineConfig({
  test: {
    include: ['test/page/**/*.page.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
