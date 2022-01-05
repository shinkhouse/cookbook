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
    public searchQuery: string = '';
    constructor(private recipeService: RecipesService) {}

    ngOnInit(): void {
        this.getRecipes();
    }

    getRecipes() {
        this.recipes = this.recipeService.getRecipes();
    }

    getSearchResults(): Recipe[] {
        if (this.searchQuery.length > 0) {
            return this.recipes.filter((recipe) => {
                return (
                    recipe.title.toLowerCase().trim().includes(this.searchQuery.toLowerCase().trim()) ||
                    recipe.tags?.find((tag) => {
                        return tag.toLowerCase().trim().includes(this.searchQuery.toLowerCase().trim());
                    })
                );
            });
        } else {
            return this.recipes;
        }
    }

    getRecipeAuthors(recipe: Recipe) {
        return recipe.authors?.join(', ');
    }

    displayRecipe(recipe: Recipe) {
        this.selectedRecipe = recipe;
    }
}
