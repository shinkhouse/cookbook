import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Recipe } from 'src/app/core/model/recipes.model';
import { RecipesService } from 'src/app/core/services/recipes.service';

@Component({
    selector: 'app-recipe',
    templateUrl: './recipe.component.html',
    styleUrls: ['./recipe.component.scss'],
})
export class RecipeComponent implements OnInit {
    public recipe: Recipe | undefined = undefined;
    public recipeId: string = '';
    constructor(private route: ActivatedRoute, private router: Router, public recipes: RecipesService) {}

    ngOnInit(): void {
        this.recipeId = this.route.snapshot.paramMap.get('id') || '';
        console.log(this.recipeId);
        this.getRecipeFromCookBook();
    }

    getRecipeFromCookBook() {
        this.recipe = this.recipes.findRecipes(this.recipeId);
    }
}
