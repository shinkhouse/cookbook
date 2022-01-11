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
