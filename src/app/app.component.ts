import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { ListStore } from './core/stores/list.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatMenuModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly list = inject(ListStore);
  private readonly router = inject(Router);

  /**
   * Cook mode is a full-screen dark view (§6.3), so the site header and footer
   * step out of the way. It has its own exit control, so nothing is stranded.
   */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly isCookMode = computed(() => /\/cook(\?|#|$)/.test(this.url()));

  /**
   * The nav offers only these two destinations (§2.3). A recipe is reached by
   * tapping a card, and cook mode only from a recipe.
   */
  readonly listCount = computed(() => this.list.recipeCount());

  /**
   * Below 760px the nav collapses to a drawer — the one real JS breakpoint in
   * the design (§3.4). mat-menu supplies the focus trap and Esc handling that
   * §7 asks for, which is why it is worth using here rather than hand-rolling.
   */
  private readonly narrow = signal(matchesNarrow());

  readonly isNarrow = computed(() => this.narrow());

  constructor() {
    if (typeof globalThis.matchMedia === 'function') {
      const query = globalThis.matchMedia('(max-width: 760px)');
      query.addEventListener('change', (e) => this.narrow.set(e.matches));
    }
  }
}

function matchesNarrow(): boolean {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(max-width: 760px)').matches
    : false;
}
