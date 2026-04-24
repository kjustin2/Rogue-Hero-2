// Playwright config for the in-browser smoke suite.
// Driven by window._dev (see src/DevConsole.js) for deterministic control.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8765',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Headless Chromium otherwise spams AudioContext warnings.
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'python -m http.server 8765',
    cwd: '..',
    url: 'http://localhost:8765/index.html',
    reuseExistingServer: true,
    timeout: 20_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
