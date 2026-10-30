import { HttpErrorResponse } from '@angular/common/http';
import { describeWriteError } from './write-error';

describe('describeWriteError', () => {
  it('says the server is unreachable for status 0', () => {
    expect(describeWriteError({ status: 0 })).toBe("Couldn't reach the recipe server. Is it running?");
  });

  it('points at the write key for 403', () => {
    expect(describeWriteError({ status: 403 })).toBe(
      'The recipe server refused the write. Is RECIPES_WRITE_KEY set where you ran ng serve?',
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
    expect(describeWriteError({ status: 500 })).toBe('Saving failed. Nothing was changed.');
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
