const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
];

function buildChromiumLaunchOptions(overrides = {}) {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    : undefined;

  return {
    headless: true,
    executablePath,
    args: DEFAULT_ARGS,
    ...overrides,
  };
}

function hasPlayableChromium() {
  try {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
    return Boolean(executablePath) && fs.existsSync(executablePath);
  } catch (error) {
    return false;
  }
}

function ensurePlaywrightChromium() {
  if (hasPlayableChromium()) {
    return;
  }

  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    shell: true,
  });
}

module.exports = {
  buildChromiumLaunchOptions,
  ensurePlaywrightChromium,
};
