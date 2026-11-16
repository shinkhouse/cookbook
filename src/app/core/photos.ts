import { environment } from '../../environments/environment';

/** The widths the API's GET /photos serves (routes/photos.js); it refuses others. */
export type PhotoWidth = 400 | 800 | 1200;

/**
 * Recipe photos are hotlinked from the sites they came from, at whatever size
 * those sites serve: up to 2800 px wide and 770 KB for a card shown at 400.
 * The API fetches one, resizes it and answers WebP the browser can cache for a
 * month, and keeps the hosts' third-party cookies off the page. It only serves
 * photos a recipe uses, so callers fall back to the original URL on an error.
 */
export function photoUrl(src: string, width: PhotoWidth): string {
  return `${environment.apiBase}/photos?src=${encodeURIComponent(src)}&w=${width}`;
}

export function photoSrcset(src: string, widths: readonly PhotoWidth[]): string {
  return widths.map((w) => `${photoUrl(src, w)} ${w}w`).join(', ');
}

/** Only a photo on the web can be fetched by the API; a data or blob URL is already local. */
export function resizable(src: string | undefined): src is string {
  return !!src && /^https?:\/\//i.test(src);
}
