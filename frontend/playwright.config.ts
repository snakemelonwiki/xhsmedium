import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  workers: 1,
  expect: { timeout: 10_000 },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3002/login',
    timeout: 180_000,
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://127.0.0.1:3002',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
});
