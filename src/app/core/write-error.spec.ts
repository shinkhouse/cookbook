import { HttpErrorResponse } from '@angular/common/http';
import { describeWriteError } from './write-error';

describe('describeWriteError', () => {
  it('says the server is unreachable for status 0', () => {
    expect(describeWriteError({ status: 0 })).toBe("Couldn't reach the recipe server. Is it running?");
  });

  it('says the server is unreachable when the dev proxy answers for a dead API', () => {
    const sentence = "Couldn't reach the recipe server. Is it running?";
    for (const status of [502, 503, 504]) {
      expect(describeWriteError({ status })).toBe(sentence);
    }
    expect(describeWriteError({ status: 500 })).toBe(sentence);
    expect(describeWriteError({ status: 500, error: '<html>Bad Gateway</html>' })).toBe(sentence);
    expect(describeWriteError(new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }))).toBe(
      sentence,
    );
  });

  it('keeps the generic sentence for the API\'s own 500', () => {
    expect(describeWriteError({ status: 500, error: { message: 'db exploded' } })).toBe(
      'Saving failed. Nothing was changed.',
    );
  });

  it('points at the write key and the origin for 403', () => {
    expect(describeWriteError({ status: 403 })).toBe(
      "The recipe server refused the write. Check RECIPES_WRITE_KEY and that you're on localhost:4200.",
    );
  });

  it('names the name clash for 409', () => {
    expect(describeWriteError({ status: 409 })).toBe(
      'A recipe with that name already exists. Change the title and try again.',
    );
  });

  it('relays the server message for 400', () => {
    expect(describeWriteError({ status: 400, error: { message: 'steps must be an array.' } })).toBe(
      'The recipe server rejected it: steps must be an array.',
    );
  });

  it('falls back for anything else', () => {
    expect(describeWriteError({ status: 418 })).toBe('Saving failed. Nothing was changed.');
    expect(describeWriteError(new Error('boom'))).toBe('Saving failed. Nothing was changed.');
    expect(describeWriteError(null)).toBe('Saving failed. Nothing was changed.');
    expect(describeWriteError({ status: 400 })).toBe('Saving failed. Nothing was changed.');
  });

  it('reads a real HttpErrorResponse', () => {
    expect(describeWriteError(new HttpErrorResponse({ status: 409 }))).toBe(
      'A recipe with that name already exists. Change the title and try again.',
    );
    expect(
      describeWriteError(
        new HttpErrorResponse({ status: 400, error: { message: 'steps must be an array.' } }),
      ),
    ).toBe('The recipe server rejected it: steps must be an array.');
  });
});
