export interface Recipe {
    title: string;
    subtitle?: string;
    authors?: string[];
    cookTime: string; 
    tags?: string[]
    coverImage?: string;
    ingredients: string[] | null;
    steps: string[] | null;
    notes: string[] | null;
    urls: string[] | null
}