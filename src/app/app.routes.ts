import { Routes } from '@angular/router';

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
    title: "Sam's Recipes",
  },
  {
    // Must precede ':slug', or "new" is read as a slug.
    path: 'recipes/new',
    loadComponent: () =>
      import('./pages/create-recipe/create-recipe.component').then((m) => m.CreateRecipeComponent),
    title: 'Add a recipe',
  },
  {
    path: 'recipes/:slug/cook',
    loadComponent: () => import('./pages/cook-mode/cook-mode.component').then((m) => m.CookModeComponent),
  },
  {
    path: 'recipes/:slug',
    loadComponent: () =>
      import('./pages/recipe-detail/recipe-detail.component').then((m) => m.RecipeDetailComponent),
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
