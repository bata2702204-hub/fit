const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    channel: 'msedge', // uses the Edge already installed on Windows; no browser download
    serviceWorkers: 'block',
    locale: 'he-IL',
  },
  webServer: { command: 'python -m http.server 4173', port: 4173, reuseExistingServer: true, stdout: 'ignore', stderr: 'ignore' },
});
