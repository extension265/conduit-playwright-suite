// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { UI_URL } = require('./utils/env');

const isCI = !!process.env.CI;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true, // every test creates its own users and data, so any order or worker is safe
  forbidOnly: isCI, // a stray test.only must not silently shrink the CI run
  retries: isCI ? 1 : 0, // one retry in CI only, so we get a trace; locally a failure is a failure
  workers: isCI ? 2 : 4, // the target is a shared public instance, so keep the load polite
  timeout: 60_000, // the public instance answers in 250-800 ms per call; a UI journey makes ~10 calls
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: UI_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      // Pure HTTP tests: no browser is launched for this project.
      name: 'api',
      testDir: './tests/api',
    },
    {
      // Browser tests. PW_CHANNEL=chrome uses the locally installed Google Chrome instead of
      // Playwright's downloaded Chromium (needed on machines where Windows Smart App Control
      // blocks the downloaded binary). CI leaves it unset and uses the bundled Chromium.
      name: 'chromium',
      testMatch: ['e2e/**/*.spec.js', 'permissions/**/*.spec.js'],
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
      },
    },
  ],
});
