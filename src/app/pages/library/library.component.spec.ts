import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import {
  FakeCookbookRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../../core/testing/fake-repositories';
import { LibraryComponent } from './library.component';

async function render(cookbooks?: FakeCookbookRepository) {
  localStorage.clear();
  TestBed.configureTestingModule({
    imports: [LibraryComponent],
    providers: [provideFakeRecipes(), provideFakeCookbooks(cookbooks), provideRouter([])],
  });
  await TestBed.inject(RecipeStore).whenLoaded();
  await TestBed.inject(CookbookStore).whenLoaded();
  const fixture = TestBed.createComponent(LibraryComponent);
  fixture.detectChanges();
  return fixture;
}

const triggers = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>('[data-facet-trigger]')];

describe('LibraryComponent cookbook facet', () => {
  afterEach(() => localStorage.clear());

  it('hides the Cookbook facet with one cookbook', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    expect(triggers(el).some((t) => t.dataset['facetTrigger'] === 'cookbook')).toBe(false);
  });

  it('shows it first, named, with two', async () => {
    const fixture = await render(
      new FakeCookbookRepository([
        { id: 'sam', name: "Sam's Cookbook" },
        { id: 'bob', name: "Bob's Cookbook" },
      ]),
    );
    const el = fixture.nativeElement as HTMLElement;
    const first = triggers(el)[0];
    expect(first.dataset['facetTrigger']).toBe('cookbook');
    expect(first.textContent).toContain('Cookbook');
    first.click();
    fixture.detectChanges();
    const labels = [...el.querySelectorAll('#facet-cookbook .facet-option')].map((o) =>
      o.textContent?.trim(),
    );
    expect(labels).toEqual(["Sam's Cookbook", "Bob's Cookbook"]);
  });
});

describe('LibraryComponent surprise me', () => {
  afterEach(() => localStorage.clear());

  const button = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLButtonElement>('.controls button')].find((b) =>
      b.textContent?.includes('Surprise me'),
    )!;

  it('disables Surprise me with no results', async () => {
    const fixture = await render();
    TestBed.inject(RecipeStore).setQuery('zzz-no-such-thing');
    fixture.detectChanges();
    expect(button(fixture.nativeElement).disabled).toBe(true);
  });

  it('navigates to the picked recipe', async () => {
    const fixture = await render();
    const store = TestBed.inject(RecipeStore);
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(store, 'surprise').and.returnValue(store.recipes()[0]);
    const el = fixture.nativeElement as HTMLElement;
    expect(button(el).disabled).toBe(false);
    button(el).click();
    expect(navigate).toHaveBeenCalledWith(['/recipes', store.recipes()[0].slug]);
  });
});
