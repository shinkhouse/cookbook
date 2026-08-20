import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Every piece of state in this app is a signal, so there is nothing left
    // for zone.js to observe.
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      // Route params arrive as component inputs, so :slug binds straight to the
      // detail and cook components without either touching ActivatedRoute.
      withComponentInputBinding(),
      // Navigating to a recipe should start at the top of it; coming back to
      // the library should not.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideAnimationsAsync(),
  ],
};
