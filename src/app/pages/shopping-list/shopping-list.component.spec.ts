import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ListStore } from '../../core/stores/list.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import { FakeRecipeRepository, provideFakeRecipes } from '../../core/testing/fake-repositories';
import { DEFAULT_COOKBOOK_ID } from '../../core/model/cookbooks.model';
import { Recipe } from '../../core/model/recipes.model';
import { ShoppingListComponent } from './shopping-list.component';

describe('ShoppingListComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListComponent],
      providers: [provideFakeRecipes(), provideRouter([])],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('shows the list, not the empty state, when it holds only manual items', () => {
    TestBed.inject(ListStore).addExtra('Paper towels');
    const fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.empty-line')).toBeNull();
    expect(el.textContent).toContain('Paper towels');
    expect(el.querySelector('button[aria-label="Remove Paper towels"]')).not.toBeNull();
  });

  it('adds an item on Enter and clears the field', () => {
    const fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('#add-item')!;
    input.value = 'Paper towels';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(TestBed.inject(ListStore).extras().map((e) => e.name)).toEqual(['Paper towels']);
    expect(input.value).toBe('');
    expect(el.textContent).toContain('Paper towels');
  });

  it('keeps each source title whole and offers a recipe count for narrow screens', async () => {
    const make = (slug: string, title: string): Recipe => ({
      slug,
      title,
      tags: ['dinner'],
      time: '20 min',
      servings: 2,
      cooked: 0,
      blurb: '',
      desc: '',
      ingredients: [{ qty: 1, unit: '', name: 'onion', aisle: 'produce' }],
      steps: ['Chop.'],
      notes: [],
      cookbooks: [DEFAULT_COOKBOOK_ID],
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ShoppingListComponent],
      providers: [
        provideFakeRecipes(new FakeRecipeRepository([make('soup', 'Soup'), make('stew', 'Stew')])),
        provideRouter([]),
      ],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const list = TestBed.inject(ListStore);
    list.addRecipe('soup');
    list.addRecipe('stew');
    const fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const titles = [...el.querySelectorAll('.row-source .source-title')];
    expect(titles.map((t) => t.textContent)).toEqual(['Soup', 'Stew']);
    expect(getComputedStyle(titles[0]).whiteSpace).toBe('nowrap');
    expect(el.querySelector('.row-source .source-count')?.textContent?.trim()).toBe('2 recipes');
  });
});
