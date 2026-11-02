import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveFn, Router, Routes } from '@angular/router';
import { RecipeStore } from './core/stores/recipe.store';

/**
 * Names the tab after the recipe. Without this the routes that carry no title
 * kept whatever the previous page set, so opening a recipe from the create flow
 * left the tab reading "Add a recipe". It waits for the collection so a
 * reload on a recipe URL gets the recipe's name rather than the fallback.
 */
const recipeTitle =
  (suffix = ''): ResolveFn<string> =>
  async (route: ActivatedRouteSnapshot) => {
    // Captured before the await: inject() only works while the resolver is
    // still running synchronously.
    const store = inject(RecipeStore);
    const slug = route.paramMap.get('slug') ?? '';
    // A direct hit on a recipe URL resolves before the collection has arrived.
    await store.whenLoaded();
    const recipe = store.bySlug(slug);
    if (!recipe) return "My Cookbooks";
    return suffix ? `${recipe.title} — ${suffix}` : recipe.title;
  };

/**
 * Routing per design spec §2.3.
 *
 * Cook mode is a child of the recipe rather than a top-level destination: you
 * enter it from a recipe and leave it back to the same recipe.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/library/library.component').then((m) => m.LibraryComponent),
    title: "My Cookbooks",
  },
  {
    // Must precede ':slug', or "new" is read as a slug.
    path: 'recipes/new',
    // Authoring is a development-only feature; elsewhere the URL goes home.
    canMatch: [() => inject(RecipeStore).writable || inject(Router).createUrlTree(['/'])],
    loadComponent: () =>
      import('./pages/create-recipe/create-recipe.component').then((m) => m.CreateRecipeComponent),
    title: 'Add a recipe',
  },
  {
    path: 'cookbooks/new',
    canMatch: [() => inject(RecipeStore).writable || inject(Router).createUrlTree(['/'])],
    loadComponent: () =>
      import('./pages/create-cookbook/create-cookbook.component').then((m) => m.CreateCookbookComponent),
    title: 'Add a cookbook',
  },
  {
    path: 'recipes/:slug/edit',
    canMatch: [() => inject(RecipeStore).writable || inject(Router).createUrlTree(['/'])],
    loadComponent: () =>
      import('./pages/create-recipe/create-recipe.component').then((m) => m.CreateRecipeComponent),
    title: recipeTitle('edit'),
  },
  {
    path: 'recipes/:slug/cook',
    loadComponent: () => import('./pages/cook-mode/cook-mode.component').then((m) => m.CookModeComponent),
    title: recipeTitle('cooking'),
  },
  {
    path: 'recipes/:slug',
    loadComponent: () =>
      import('./pages/recipe-detail/recipe-detail.component').then((m) => m.RecipeDetailComponent),
    title: recipeTitle(),
  },
  {
    path: 'list',
    loadComponent: () =>
      import('./pages/shopping-list/shopping-list.component').then((m) => m.ShoppingListComponent),
    title: 'Shopping list',
  },
  // The old detail URL, kept working so existing links and bookmarks survive.
  { path: 'recipe/:slug', redirectTo: 'recipes/:slug', pathMatch: 'full' },
  // /search is gone; search is inline in the library now (§2.3).
  { path: 'search', redirectTo: '', pathMatch: 'full' },
  { path: 'create', redirectTo: 'recipes/new', pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];
