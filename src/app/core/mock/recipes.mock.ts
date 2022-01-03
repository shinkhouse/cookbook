import { Recipe } from '../model/recipes.model';

export const Recipes: Recipe[] = [
    {
        title: "Grandma's Spaghetti",
        subtitle: 'In memory of Bernadine Canady',
        authors: ['Bernadine Canady'],
        cookTime: '20 to 30 minutes',
        tags: ['pasta', 'italian'],
        coverImage:
            'https://www.artandthekitchen.com/wp-content/uploads/2012/03/Spaghetti-and-Meat-Sauce-.jpg',
        ingredients: [
            '1/2 hamburger',
            '2 tablespoons dried onion',
            '1 small can tomato paste',
            'can of tomato juice',
            '1 tablespoon garlic powder',
            ' 1 tablespoon chili powder',
            '1 teaspoon sugar',
        ],
        steps: [
            'Brown hamburger with dried onions till brown, add tomato paste and stir',
            'Add jar of spaghetti sauce, then add in tomato juice to thin sauce',
            'Add in garlic powder, chili powder, and sugar.',
            'Simmer on low heat for about 20 minutes',
        ],
        notes: ['Soda sized can of tomato juice works great'],
        urls: [],
    },
    {
        title: "Grandma's Chili",
        subtitle: '',
        authors: ['Bernadine Canady'],
        cookTime: '',
        tags: [''],
        coverImage: '',
        ingredients: ['1 pound hamburger', '1 can kidney beans', '2 can chili beans', '1 can vegetable juice', 'Chili powder to taste', '1 teaspoon sugar', 'Salt to taste', 'Can of diced tomatoes (optional)'],
        steps: [''],
        notes: [''],
        urls: [''],
    },
];

export const RecipeTemplate: Recipe = {
    title: '',
    subtitle: '',
    authors: [''],
    cookTime: '',
    tags: [''],
    coverImage: '',
    ingredients: [''],
    steps: [''],
    notes: [''],
    urls: [''],
};
