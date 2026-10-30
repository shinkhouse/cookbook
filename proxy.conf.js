/*
 * Dev-server proxy: forwards /api/* to the recipes API and adds the write key.
 *
 * The key lives here, in the dev server's environment, because of spec section 6:
 * "The write key never enters the browser". The browser only ever calls /api on
 * its own origin; this process attaches x-api-key on the way through, so the key
 * is in no source file, bundle or request the page can inspect.
 *
 * Set RECIPES_WRITE_KEY in the shell that runs `ng serve`. API_TARGET overrides
 * the API address (default http://localhost:3152).
 */
const key = process.env.RECIPES_WRITE_KEY;

if (!key) {
  console.warn(
    '[proxy] RECIPES_WRITE_KEY is not set: reads will work, but writes will be refused with 403.',
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
