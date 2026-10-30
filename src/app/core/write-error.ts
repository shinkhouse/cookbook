/**
 * Turns a failed write into a sentence for the person who pressed Save. Reads
 * `status` and `error.message` off the error rather than checking for
 * HttpErrorResponse, so the plain objects tests throw behave the same.
 */
export function describeWriteError(err: unknown): string {
  const { status, error } = (err ?? {}) as { status?: unknown; error?: { message?: unknown } };
  if (status === 0) return "Couldn't reach the recipe server. Is it running?";
  if (status === 403) {
    return 'The recipe server refused the write. Is RECIPES_WRITE_KEY set where you ran ng serve?';
  }
  if (status === 409) return 'A recipe with that name already exists. Change the title and try again.';
  if (status === 400 && typeof error?.message === 'string' && error.message) {
    return `The recipe server rejected it: ${error.message}`;
  }
  return 'Saving failed. Nothing was changed.';
}
