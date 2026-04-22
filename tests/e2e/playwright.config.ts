import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './src',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, 
  timeout: 120000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'cd ../../apps/chat-demo && NEXT_PUBLIC_AGENT_URL=http://127.0.0.1:8002 npx next dev -H 127.0.0.1 -p 3000',
      url: 'http://127.0.0.1:3000',
      timeout: 180000,
      reuseExistingServer: false,
    },
    {
      command: 'cd ../acceptance && PORT=8002 uv run python3 server.py',
      url: 'http://127.0.0.1:8002',
      timeout: 180000,
      reuseExistingServer: false,
    }
  ],
});
