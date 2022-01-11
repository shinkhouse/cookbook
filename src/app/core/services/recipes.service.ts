import { Injectable } from '@angular/core';
import { Recipes } from '../mock/recipes.mock';
import { Recipe } from '../model/recipes.model';

@Injectable({
  providedIn: 'root',
})
export class RecipesService {
  private recipes: Recipe[] = Recipes;
  constructor() {}

  getRecipes() {
    return this.recipes;
  }

  findRecipes(recipeSlug: string) {
    return this.recipes.find((recipe) => {
      return recipe.slug === recipeSlug;
    });
  }
}
