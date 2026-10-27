import { defineConfig, devices } from '@playwright/test'

// E2E：用正式打包（含 Service Worker）+ 模擬雲端伺服器
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'node scripts/mock-cloud.mjs', url: 'http://localhost:8787/health', reuseExistingServer: true },
    {
      command: 'npm run build:e2e && npx vite preview --outDir dist-e2e --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_MOCK_SYNC_URL: 'http://localhost:8787', VITE_E2E: '1' },
    },
  ],
})
