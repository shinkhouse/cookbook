import { Component, HostListener, OnInit } from '@angular/core';
import { Recipe } from 'src/app/core/model/recipes.model';
import { RecipesService } from 'src/app/core/services/recipes.service';

@Component({
    selector: 'app-recipes',
    templateUrl: './recipes.component.html',
    styleUrls: ['./recipes.component.scss'],
})
export class RecipesComponent implements OnInit {
    public gridColumnSize: number = 4;
    public recipes: Recipe[] = [];
    public selectedRecipe: Recipe | undefined;
    public searchQuery: string = '';
    public onlyFavoritesShown: boolean = false;
    constructor(private recipeService: RecipesService) {
        this.resizeGrid(window.innerWidth);
    }

    @HostListener('window:resize', ['$event'])
    onResize(event: any) {
        const pageWidth = event.target.innerWidth;
        this.resizeGrid(pageWidth);
    }

    resizeGrid(pageWidth: number) {
        if (pageWidth > 1600) {
            this.gridColumnSize = 4;
        } else if (pageWidth > 1200 && pageWidth <= 1600) {
            this.gridColumnSize = 3;
        } else if (pageWidth > 800 && pageWidth <= 1200) {
            this.gridColumnSize = 2;
        } else {
            this.gridColumnSize = 1;
        }
    }

    ngOnInit(): void {
        this.getRecipes();
    }

    toggleFavorites() {
        this.onlyFavoritesShown = !this.onlyFavoritesShown;
    }

    getRecipes() {
        this.recipes = this.recipeService.getRecipes();
    }

    getSearchResults(): Recipe[] {
        if (this.searchQuery.length > 0) {
            return this.recipes.filter((recipe) => {
                if(this.onlyFavoritesShown) {
                    return (
                        recipe.favorite &&
                        (recipe.title
                            .toLowerCase()
                            .trim()
                            .includes(this.searchQuery.toLowerCase().trim()) ||
                        recipe.tags?.find((tag) => {
                            return tag
                                .toLowerCase()
                                .trim()
                                .includes(
                                    this.searchQuery.toLowerCase().trim()
                                );
                        }))
                    );
                } else {
                    return (
                        recipe.title
                            .toLowerCase()
                            .trim()
                            .includes(this.searchQuery.toLowerCase().trim()) ||
                        recipe.tags?.find((tag) => {
                            return tag
                                .toLowerCase()
                                .trim()
                                .includes(
                                    this.searchQuery.toLowerCase().trim()
                                );
                        })
                    );
                }
                return (
                    recipe.title
                        .toLowerCase()
                        .trim()
                        .includes(this.searchQuery.toLowerCase().trim()) ||
                    recipe.tags?.find((tag) => {
                        return tag
                            .toLowerCase()
                            .trim()
                            .includes(this.searchQuery.toLowerCase().trim());
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
