import { Clipboard } from '@angular/cdk/clipboard';
import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
    selector: 'app-create-recipe',
    templateUrl: './create-recipe.component.html',
    styleUrls: ['./create-recipe.component.scss'],
})
export class CreateRecipeComponent implements OnInit {
    public recipeForm: FormGroup = this.fb.group({
        title: ['', Validators.required],
        subtitle: [''],
        slug: [''],
        authors: this.fb.array([this.fb.control('')]),
        description: [''],
        servings: [1],
        calories: [0],
        cookTime: [''],
        tags: this.fb.array([this.fb.control('')]),
        coverImage: [''],
        ingredients: this.fb.array([this.fb.control('')]),
        steps: this.fb.array([this.fb.control('')]),
        notes: this.fb.array([this.fb.control('')]),
        urls: this.fb.array([this.fb.control('')]),
    });
    constructor(private fb: FormBuilder, private clipboard: Clipboard) {
        this.recipeForm.get('title')?.valueChanges.subscribe((res) => {
            console.log(res);
            this.recipeForm.get('slug')?.setValue(this.generateSlug(res));
        });
    }

    generateSlug(title: string) {
        return title.toLowerCase().split(' ').join('-');
    }

    ngOnInit(): void {}

    get getRecipeAuthors() {
        return this.recipeForm.get('authors') as FormArray;
    }

    addAuthor() {
        this.getRecipeAuthors.push(this.fb.control(''));
    }

    get getRecipeTags() {
        return this.recipeForm.get('tags') as FormArray;
    }

    addTag() {
        this.getRecipeTags.push(this.fb.control(''));
    }

    get getRecipeIngredients() {
        return this.recipeForm.get('ingredients') as FormArray;
    }

    addIngredient() {
        this.getRecipeIngredients.push(this.fb.control(''));
    }

    get getRecipeSteps() {
        return this.recipeForm.get('steps') as FormArray;
    }

    addStep() {
        this.getRecipeSteps.push(this.fb.control(''));
    }

    get getRecipeNotes() {
        return this.recipeForm.get('notes') as FormArray;
    }

    addNote() {
        this.getRecipeNotes.push(this.fb.control(''));
    }

    resetRecipeForm() {
        this.recipeForm = this.fb.group({
            title: ['', Validators.required],
            subtitle: [''],
            slug: [''],
            authors: this.fb.array([this.fb.control('')]),
            description: [''],
            servings: [1],
            calories: [0],
            cookTime: [''],
            tags: this.fb.array([this.fb.control('')]),
            coverImage: [''],
            ingredients: this.fb.array([this.fb.control('')]),
            steps: this.fb.array([this.fb.control('')]),
            notes: this.fb.array([this.fb.control('')]),
            urls: this.fb.array([this.fb.control('')]),
        });
    }

    copyRecipe() {
        // replace this object with your data
        const object = this.recipeForm.value;

        // Note the parameters
        this.clipboard.copy(JSON.stringify(object));
    }
}
