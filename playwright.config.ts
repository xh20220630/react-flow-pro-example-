import { defineConfig } from '@playwright/test'

const externalUrl = process.env.COLLABORATION_BASE_URL
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 30000,
  expect: { timeout: 8000 },
  use: {
    baseURL: externalUrl ?? 'http://127.0.0.1:3100',
    headless: true,
    actionTimeout: 5000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  ...(externalUrl
    ? {}
    : {
        webServer: {
          command: 'node src/server/index.ts --hostname 127.0.0.1 --port 3100',
          url: 'http://127.0.0.1:3100/api/health',
          reuseExistingServer: false,
          timeout: 30000,
        },
      }),
})
