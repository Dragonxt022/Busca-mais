require('dotenv').config();

const { ensurePlaywrightChromium } = require('../libs/playwright-utils');

try {
  ensurePlaywrightChromium();
  console.log('Playwright Chromium ready');
  process.exit(0);
} catch (error) {
  console.error('Failed to ensure Playwright Chromium:', error.message);
  process.exit(1);
}
