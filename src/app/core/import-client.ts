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
}
