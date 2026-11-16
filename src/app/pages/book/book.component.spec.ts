import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Recipes } from '../../core/mock/recipes.mock';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../../core/testing/fake-repositories';
import { BookComponent } from './book.component';

const seed = [
  { ...Recipes[0], slug: 'tacos', title: 'Tacos', tags: ['dinner'], cookbooks: ['bob'], component: false },
  { ...Recipes[0], slug: 'apple-pie', title: 'Apple Pie', tags: ['dessert'], cookbooks: ['sam'], component: false },
  { ...Recipes[0], slug: 'pancakes', title: 'Pancakes', tags: ['breakfast'], cookbooks: ['sam'], component: false },
];

async function render(order?: string) {
  TestBed.configureTestingModule({
    imports: [BookComponent],
    providers: [
      provideRouter([]),
      provideFakeRecipes(new FakeRecipeRepository(seed)),
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
  const fixture = TestBed.createComponent(BookComponent);
  if (order) fixture.componentRef.setInput('order', order);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('BookComponent', () => {
  it('opens on a cover that counts the recipes', async () => {
    const el = await render();
    expect(el.querySelector('.book-cover h1')?.textContent?.trim()).toBe('My Cookbooks');
    expect(el.querySelector('.book-cover')?.textContent).toContain('3 recipes');
  });

  it('lists the contents in print order, each entry pointing at its recipe', async () => {
    const el = await render();
    const entries = [...el.querySelectorAll<HTMLAnchorElement>('.book-contents a')];
    expect(entries.map((a) => a.querySelector('.entry-title')?.textContent?.trim())).toEqual([
      'Apple Pie',
      'Pancakes',
      'Tacos',
    ]);
    const anchors = [...el.querySelectorAll('.book-recipe')].map((r) => r.id);
    expect(anchors).toEqual(['r0', 'r1', 'r2']);
    expect(entries.map((a) => a.getAttribute('href')?.split('#')[1])).toEqual(anchors);
    // The script that makes the PDF writes page numbers into these.
    expect([...el.querySelectorAll('[data-book-page]')].map((s) => s.getAttribute('data-book-page'))).toEqual(
      anchors,
    );
    expect(el.querySelectorAll('.book-recipe app-recipe-detail').length).toBe(3);
  });

  it("leaves out how often each recipe was cooked, which is the app's record, not the recipe", async () => {
    const el = await render();
    const activity = el.querySelector('.book-recipe .rail-activity')!;
    expect(getComputedStyle(activity).display).toBe('none');
  });

  it('says when it is ready to print, for the PDF script', async () => {
    const el = await render();
    expect(el.querySelector('[data-book-ready]')).not.toBeNull();
  });

  it('heads each group, in the contents and with a page of its own, when grouped', async () => {
    const el = await render('cookbook');
    expect([...el.querySelectorAll('.book-contents h3')].map((h) => h.textContent?.trim())).toEqual([
      "Sam's Cookbook",
      "Bob's Cookbook",
    ]);
    expect([...el.querySelectorAll('.book-divider h2')].map((h) => h.textContent?.trim())).toEqual([
      "Sam's Cookbook",
      "Bob's Cookbook",
    ]);
  });

  it('offers each way to arrange the book, marking the current one', async () => {
    const el = await render('meal');
    const links = [...el.querySelectorAll<HTMLAnchorElement>('.book-orders a')];
    expect(links.map((a) => a.textContent?.trim())).toEqual(['A–Z', 'Cookbook', 'Meal', 'Cuisine']);
    expect(links.find((a) => a.getAttribute('aria-current') === 'page')?.textContent?.trim()).toBe('Meal');
  });
});
