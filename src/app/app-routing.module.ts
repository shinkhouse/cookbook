import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    {
        path: '',
        loadChildren: () =>
            import('./pages/recipes/recipes.module').then(
                (m) => m.RecipesModule
            ),
    },
    {
        path: 'search',
        loadChildren: () =>
            import('./pages/search/search.module').then(
                (m) => m.SearchModule
            ),
    },
    {
        path: 'create',
        loadChildren: () =>
            import('./pages/create-recipe/create-recipe.module').then(
                (m) => m.CreateRecipeModule
            ),
    },
    {
        path: 'recipe/:id',
        loadChildren: () =>
            import('./pages/recipe/recipe.module').then(
                (m) => m.RecipeModule
            ),
    },
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {}
