import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Recipes } from '../../core/mock/recipes.mock';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { NO_COOKBOOK, RecipeStore } from '../../core/stores/recipe.store';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../../core/testing/fake-repositories';
import { ManageCookbooksComponent } from './manage-cookbooks.component';

async function render() {
  localStorage.clear();
  TestBed.configureTestingModule({
    imports: [ManageCookbooksComponent],
    providers: [
      provideRouter([]),
      provideFakeRecipes(
        new FakeRecipeRepository([
          { ...Recipes[0], slug: 'stew', title: 'Stew', cookbooks: ['sam', 'bob'] },
          { ...Recipes[0], slug: 'chili', title: 'Chili', cookbooks: ['bob'] },
          { ...Recipes[0], slug: 'pie', title: 'Pie', cookbooks: ['sam'] },
        ]),
      ),
      provideFakeCookbooks(
        new FakeCookbookRepository([
          { id: 'sam', name: "Sam's Cookbook" },
          { id: 'bob', name: "Bob's Cookbook" },
        ]),
      ),
    ],
  });
  await TestBed.inject(RecipeStore).whenLoaded();
  await TestBed.inject(CookbookStore).whenLoaded();
  const fixture = TestBed.createComponent(ManageCookbooksComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.cookbook-row')];
const row = (el: HTMLElement, i: number) => rows(el)[i];
const nameInput = (r: HTMLElement) => r.querySelector<HTMLInputElement>('input[type="text"]')!;
const button = (r: HTMLElement, label: string) =>
  [...r.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)!;

describe('ManageCookbooksComponent', () => {
  afterEach(() => localStorage.clear());

  it('lists each cookbook with its name to edit and how many recipes it holds', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    expect(rows(el).map((r) => nameInput(r).value)).toEqual(["Sam's Cookbook", "Bob's Cookbook"]);
    expect(rows(el).map((r) => r.querySelector('.count')?.textContent?.trim())).toEqual(['2 recipes', '2 recipes']);
  });

  it('renames a cookbook, offering Save only once the name has changed', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const first = row(el, 0);
    expect(button(first, 'Save').disabled).toBe(true);

    const input = nameInput(first);
    input.value = "Sam's Family Cookbook";
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(button(first, 'Save').disabled).toBe(false);

    button(first, 'Save').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(CookbookStore).byId('sam')?.name).toBe("Sam's Family Cookbook");
    expect(button(row(el, 0), 'Save').disabled).toBe(true);
  });

  it('will not give a cookbook another one’s name', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const input = nameInput(row(el, 0));
    input.value = "bob's cookbook";
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(button(row(el, 0), 'Save').disabled).toBe(true);
    expect(row(el, 0).textContent).toContain('Another cookbook has that name.');
  });

  it('asks before deleting, and Cancel keeps the cookbook', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    button(row(el, 1), 'Delete').click();
    fixture.detectChanges();
    expect(el.querySelector('.delete-confirm')?.textContent?.replace(/\s+/g, ' ')).toContain(
      "Delete “Bob's Cookbook”? Its 2 recipes stay in the app.",
    );
    button(el.querySelector<HTMLElement>('.delete-confirm')!, 'Cancel').click();
    fixture.detectChanges();
    expect(el.querySelector('.delete-confirm')).toBeNull();
    expect(rows(el).length).toBe(2);
  });

  it('deletes a cookbook but keeps its recipes, which show as unfiled if it was their only one', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    button(row(el, 1), 'Delete').click();
    fixture.detectChanges();
    button(el.querySelector<HTMLElement>('.delete-confirm')!, 'Delete cookbook').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(rows(el).map((r) => nameInput(r).value)).toEqual(["Sam's Cookbook"]);
    const recipes = TestBed.inject(RecipeStore);
    expect(recipes.recipes().map((r) => r.slug)).toEqual(['stew', 'chili', 'pie']);
    recipes.selectedCookbooks.set(new Set([NO_COOKBOOK]));
    expect(recipes.results().map((r) => r.slug)).toEqual(['chili']);
  });
});
