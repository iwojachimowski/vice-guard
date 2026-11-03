import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/global-setup.ts',
  workers: 1,
  use: { trace: 'retain-on-failure' },
});
