import { HttpErrorResponse } from '@angular/common/http';
import { describePhotoError, describeWriteError } from './write-error';

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

  it('relays the import messages for 422, 502 and 504', () => {
    expect(describeWriteError({ status: 422, error: { message: 'No recipe found on that page.' } })).toBe(
      'No recipe found on that page.',
    );
    expect(describeWriteError({ status: 422 })).toBe('No recipe found on that page.');
    expect(
      describeWriteError({
        status: 502,
        error: { message: "The site didn't return the page. Paste the page source instead." },
      }),
    ).toBe("The site didn't return the page. Paste the page source instead.");
    expect(
      describeWriteError({ status: 504, error: { message: 'The site took too long to respond.' } }),
    ).toBe('The site took too long to respond.');
  });

  it('still reads a bare 502 or 504 as the dev proxy answering for a dead API', () => {
    const sentence = "Couldn't reach the recipe server. Is it running?";
    expect(describeWriteError({ status: 502, error: '<html>Bad Gateway</html>' })).toBe(sentence);
    expect(describeWriteError({ status: 504, error: { message: '' } })).toBe(sentence);
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

  it('relays the photo messages for 413 and 415', () => {
    expect(describeWriteError({ status: 413, error: { message: 'That photo is over 10 MB.' } })).toBe(
      'That photo is over 10 MB.',
    );
    expect(
      describeWriteError({ status: 415, error: { message: "That photo couldn't be read. Try a JPEG or PNG." } }),
    ).toBe("That photo couldn't be read. Try a JPEG or PNG.");
  });

  describe('describePhotoError', () => {
    const NO_KEY = "Photo import needs ANTHROPIC_API_KEY in the local API's .env. Add it and restart the API.";

    it('relays the 503 message the API sent', () => {
      expect(describePhotoError({ status: 503, error: { message: 'No key.' } })).toBe('No key.');
    });

    it('names the missing key when the API answered 503 without a message', () => {
      expect(describePhotoError({ status: 503, error: {} })).toBe(NO_KEY);
    });

    it('keeps "unreachable" for a proxy 503 with no JSON body', () => {
      const unreachable = "Couldn't reach the recipe server. Is it running?";
      expect(describePhotoError({ status: 503, error: '<html>Bad gateway</html>' })).toBe(unreachable);
      expect(describePhotoError({ status: 503, error: null })).toBe(unreachable);
    });

    it('defers to describeWriteError for other statuses', () => {
      expect(describePhotoError({ status: 415, error: { message: 'Unreadable.' } })).toBe('Unreadable.');
    });
  });
});
