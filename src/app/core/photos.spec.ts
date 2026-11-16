import { environment } from '../../environments/environment';
import { photoSrcset, photoUrl, resizable } from './photos';

const SRC = 'https://example.com/a photo.jpg?size=full&v=2';

describe('photoUrl', () => {
  it('asks the API for the photo at a width, with the source URL encoded', () => {
    expect(photoUrl(SRC, 800)).toBe(
      `${environment.apiBase}/photos?src=${encodeURIComponent(SRC)}&w=800`,
    );
  });
});

describe('photoSrcset', () => {
  it('offers each width as a candidate', () => {
    expect(photoSrcset(SRC, [400, 800])).toBe(
      `${photoUrl(SRC, 400)} 400w, ${photoUrl(SRC, 800)} 800w`,
    );
  });
});

describe('resizable', () => {
  it('is true only for a photo on the web, which the API can fetch', () => {
    expect(resizable('https://example.com/a.jpg')).toBe(true);
    expect(resizable('http://example.com/a.jpg')).toBe(true);
    expect(resizable('data:image/png;base64,AAAA')).toBe(false);
    expect(resizable('blob:https://example.com/123')).toBe(false);
    expect(resizable('assets/photo.jpg')).toBe(false);
    expect(resizable(undefined)).toBe(false);
  });
});
