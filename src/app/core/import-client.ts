import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** What the API reads off a recipe page. Every string arrives tag-stripped and trimmed. */
export interface ImportPreview {
  sourceUrl: string;
  title: string;
  description: string;
  servings?: number;
  time?: string;
  image?: string;
  tags?: string[];
  /** An unnamed group holds the recipe's own ingredients; a named one is a sub-recipe. */
  ingredientGroups: { name: string | null; lines: string[] }[];
  steps: string[];
}

/** What the photo import accepts; HEIC is what an iPhone camera produces. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** The API refuses a larger body, and a big one may arrive as a network reset, so check first. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Why a photo can't be sent, or '' when it can. Some browsers leave a HEIC's `type` empty. */
export function photoProblem(file: File): string {
  if (file.size > MAX_PHOTO_BYTES) return 'That photo is over 10 MB.';
  const heicByName = !file.type && /\.(heic|heif)$/i.test(file.name);
  if (!PHOTO_TYPES.includes(file.type.toLowerCase()) && !heicByName) {
    return 'Use a JPEG, PNG, WebP or HEIC photo.';
  }
  return '';
}

/**
 * Asks the API to fetch and read a recipe page. The browser cannot fetch other
 * sites itself, and the API refuses anything but a localhost caller, so this
 * only works in development.
 *
 * Rejects with the HttpErrorResponse as it came; `describeWriteError` turns it
 * into a sentence.
 */
@Injectable({ providedIn: 'root' })
export class ImportClient {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBase}/import/preview`;

  previewRecipe(url: string): Promise<ImportPreview> {
    return firstValueFrom(this.http.post<ImportPreview>(this.url, { url }));
  }

  /** Sends a recipe photo as the only multipart field, `photo`; the API reads it with Claude. */
  previewPhoto(file: File): Promise<ImportPreview> {
    const body = new FormData();
    body.append('photo', file);
    return firstValueFrom(this.http.post<ImportPreview>(`${environment.apiBase}/import/photo`, body));
  }
}
