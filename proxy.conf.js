/*
 * Dev-server proxy: forwards /api/* to the recipes API and adds the write key.
 *
 * The key lives here, in the dev server's environment, because of spec section 6:
 * "The write key never enters the browser". The browser only ever calls /api on
 * its own origin; this process attaches x-api-key on the way through, so the key
 * is in no source file, bundle or request the page can inspect.
 *
 * RECIPES_WRITE_KEY is looked up in this order:
 *   1. the RECIPES_WRITE_KEY environment variable of the shell running `ng serve`;
 *   2. a RECIPES_WRITE_KEY=... line in a `.env` file next to this file.
 * The environment wins; an empty or whitespace-only value counts as unset.
 * `.env` is git-ignored, so the key stays out of the repository. Only this one
 * variable is read from it, and nothing is written into process.env.
 *
 * API_TARGET overrides the API address (default http://localhost:3152).
 */
const fs = require('fs');
const path = require('path');

function readKeyFromEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() !== 'RECIPES_WRITE_KEY') continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    return value.trim();
  }
  return '';
}

const key =
  (process.env.RECIPES_WRITE_KEY || '').trim() ||
  readKeyFromEnvFile(path.join(__dirname, '.env'));

if (!key) {
  console.warn(
    '[proxy] RECIPES_WRITE_KEY is set neither in the environment nor in .env: reads will work, but writes will be refused with 403.',
  );
}

module.exports = {
  '/api': {
    target: process.env.API_TARGET || 'http://localhost:3152',
    changeOrigin: false,
    pathRewrite: { '^/api': '' },
    ...(key ? { headers: { 'x-api-key': key } } : {}),
  },
};
