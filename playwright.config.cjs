const path = require('path');
const { URL } = require('url');
const { defineConfig, devices } = require('@playwright/test');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const baseURL = String(process.env.E2E_BASE_URL || 'http://127.0.0.1:8000').trim();
const parsedBaseUrl = new URL(baseURL);
const isHeadless = !/^(0|false|no)$/i.test(String(process.env.E2E_HEADLESS || '1'));
const traceMode = String(process.env.E2E_TRACE_MODE || 'retain-on-failure').trim() || 'retain-on-failure';
const videoMode = String(process.env.E2E_VIDEO || 'off').trim() || 'off';
const screenshotMode = String(process.env.E2E_SCREENSHOT || 'only-on-failure').trim() || 'only-on-failure';
const reuseExistingServer = !/^(0|false|no)$/i.test(String(process.env.E2E_REUSE_SERVER || '1'));
const serverPort = Number(parsedBaseUrl.port || (parsedBaseUrl.protocol === 'https:' ? 443 : 80));
const serverHost = parsedBaseUrl.hostname || '127.0.0.1';

module.exports = defineConfig({
  testDir: path.join(__dirname, 'e2e'),
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'playwright-report'), open: 'never' }],
  ],
  outputDir: path.join(__dirname, 'test-results'),
  use: {
    baseURL,
    headless: isHeadless,
    trace: traceMode,
    video: videoMode,
    screenshot: screenshotMode,
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: `python3 -m http.server ${serverPort} --bind ${serverHost}`,
    url: baseURL,
    cwd: __dirname,
    reuseExistingServer,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'setup-student',
      testMatch: /auth\.student\.setup\.spec\.js$/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'setup-teacher',
      testMatch: /auth\.teacher\.setup\.spec\.js$/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'student',
      testMatch: /student\/.*\.spec\.js$/,
      dependencies: ['setup-student'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, '.auth', 'student.json'),
      },
    },
    {
      name: 'teacher',
      testMatch: /teacher\/.*\.spec\.js$/,
      dependencies: ['setup-teacher'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, '.auth', 'teacher.json'),
      },
    },
  ],
});
