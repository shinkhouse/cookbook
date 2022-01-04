import { Component, OnInit } from '@angular/core';
import { Recipe } from 'src/app/core/model/recipes.model';
import { RecipesService } from 'src/app/core/services/recipes.service';

@Component({
  selector: 'app-recipes',
  templateUrl: './recipes.component.html',
  styleUrls: ['./recipes.component.scss'],
})
export class RecipesComponent implements OnInit {
  public recipes: Recipe[] = [];
  public selectedRecipe: Recipe | undefined;
  constructor(private recipeService: RecipesService) {}

  ngOnInit(): void {
    this.getRecipes();
  }

  getRecipes() {
    this.recipes = this.recipeService.getRecipes();
  }

  getRecipeAuthors(recipe: Recipe) {
    return recipe.authors?.join(', ');
  }

  displayRecipe(recipe: Recipe) {
    this.selectedRecipe = recipe;
  }
}
