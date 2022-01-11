export interface Recipe {
    title: string;
    subtitle?: string;
    slug: string;
    authors?: string[];
    description?: string;
    servings?: number;
    calories?: number;
    cookTime: string; 
    tags?: string[]
    coverImage?: string;
    ingredients: string[] | null;
    steps: string[] | null;
    notes: string[] | null;
    urls: string[] | null,
    equipment?: string[] | null;
    favorite?: boolean;
}