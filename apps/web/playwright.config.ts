import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  testIgnore: '**/*.unit.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'off',
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  },
  reporter: [['list']],
});
