/**
 * Turns a failed write into a sentence for the person who pressed Save. Reads
 * `status` and `error.message` off the error rather than checking for
 * HttpErrorResponse, so the plain objects tests throw behave the same.
 *
 * In development the dev-server proxy answers a dead API with a 500, 502, 503
 * or 504 and a non-JSON body, so those read as "unreachable" too. The API's own
 * 500 always carries `{ message }`, which is how the two are told apart. The
 * same goes for the import preview's own 502 and 504, whose message is relayed.
 */
export function describeWriteError(err: unknown): string {
  const { status, error } = (err ?? {}) as { status?: unknown; error?: { message?: unknown } };
  const message = typeof error?.message === 'string' && error.message ? error.message : '';
  if ((status === 413 || status === 415) && message) return message;
  if (status === 422) return message || 'No recipe found on that page.';
  if ((status === 502 || status === 504) && message) return message;
  const unreachable = status === 0 || status === 502 || status === 503 || status === 504;
  const proxyFailure = status === 500 && typeof error?.message !== 'string';
  if (unreachable || proxyFailure) return "Couldn't reach the recipe server. Is it running?";
  if (status === 403) {
    return "The recipe server refused the write. Check RECIPES_WRITE_KEY and that you're on localhost:4200.";
  }
  if (status === 409) return 'A recipe with that name already exists. Change the title and try again.';
  if (status === 400 && typeof error?.message === 'string' && error.message) {
    return `The recipe server rejected it: ${error.message}`;
  }
  return 'Saving failed. Nothing was changed.';
}

/**
 * `describeWriteError` for the photo import, where a 503 that carries a JSON
 * body is the API itself saying it has no ANTHROPIC_API_KEY. A 503 with no JSON
 * body is still the dev proxy's answer for a dead API, so that stays
 * "unreachable". Anywhere else a 503 keeps that reading.
 */
export function describePhotoError(err: unknown): string {
  const { status, error } = (err ?? {}) as { status?: unknown; error?: unknown };
  if (status === 503 && typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && message
      ? message
      : "Photo import needs ANTHROPIC_API_KEY in the local API's .env. Add it and restart the API.";
  }
  return describeWriteError(err);
}
