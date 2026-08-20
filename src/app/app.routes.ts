import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveFn, Routes } from '@angular/router';
import { RecipeStore } from './core/stores/recipe.store';

/**
 * Names the tab after the recipe. Without this the routes that carry no title
 * kept whatever the previous page set, so opening a recipe from the create flow
 * left the tab reading "Add a recipe".
 */
const recipeTitle =
  (suffix = ''): ResolveFn<string> =>
  (route: ActivatedRouteSnapshot) => {
    const slug = route.paramMap.get('slug') ?? '';
    const recipe = inject(RecipeStore).bySlug(slug);
    if (!recipe) return "Sam's Recipes";
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
