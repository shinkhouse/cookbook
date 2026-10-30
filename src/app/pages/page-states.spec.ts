import { InputSignal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { RecipeStore } from '../core/stores/recipe.store';
import { Recipe } from '../core/model/recipes.model';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../core/testing/fake-repositories';
import { CookModeComponent } from './cook-mode/cook-mode.component';
import { LibraryComponent } from './library/library.component';
import { RecipeDetailComponent } from './recipe-detail/recipe-detail.component';

/** A fake whose `list()` stays pending until the test settles it. */
class HeldRecipeRepository extends FakeRecipeRepository {
  private calls: { resolve: () => void; reject: () => void }[] = [];
  listCalls = 0;

  override list(): Promise<Recipe[]> {
    this.listCalls++;
    return new Promise<Recipe[]>((resolve, reject) => {
      this.calls.push({
        resolve: () => void super.list().then(resolve, reject),
        reject: () => reject(new Error('down')),
      });
    });
  }

  resolve(): void {
    this.calls.shift()?.resolve();
  }

  reject(): void {
    this.calls.shift()?.reject();
  }
}

function setup(): HeldRecipeRepository {
  const repo = new HeldRecipeRepository();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      ...provideFakeRecipes(repo),
      ...provideFakeCookbooks(new FakeCookbookRepository([])),
    ],
  });
  return repo;
}

async function settled(): Promise<void> {
  await TestBed.inject(RecipeStore).whenLoaded();
  await new Promise((r) => setTimeout(r));
}

describe('library states', () => {
  it('shows skeleton cards while loading, not the empty copy', () => {
    setup();
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-state="loading"]')).not.toBeNull();
    expect(el.querySelectorAll('.card.skeleton').length).toBe(6);
    expect(el.textContent).not.toContain('Nothing matches');
    expect(el.textContent).not.toContain('No recipes match');
  });

  it('shows an error with Try again, and retrying loads the cards', async () => {
    const repo = setup();
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    repo.reject();
    await settled();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-state="error"]')).not.toBeNull();
    const retry = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Try again',
    ) as HTMLButtonElement;
    expect(retry).toBeDefined();

    retry.click();
    expect(repo.listCalls).toBe(2);
    repo.resolve();
    await settled();
    fixture.detectChanges();
    expect(el.querySelector('[data-state="error"]')).toBeNull();
    expect(el.querySelectorAll('.card:not(.skeleton)').length).toBeGreaterThan(0);
  });
});

for (const [name, component] of [
  ['recipe detail', RecipeDetailComponent],
  ['cook mode', CookModeComponent],
] as [string, Type<{ slug: InputSignal<string> }>][]) {
  describe(`${name} states`, () => {
    it('shows loading, not "not found", until the collection arrives', async () => {
      const repo = setup();
      const fixture = TestBed.createComponent(component);
      fixture.componentRef.setInput('slug', 'grandmas-spaghetti');
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[data-state="loading"]')).not.toBeNull();
      expect(el.textContent).not.toContain('No recipe by that name');

      repo.resolve();
      await settled();
      fixture.detectChanges();
      expect(el.querySelector('[data-state="loading"]')).toBeNull();
      expect(el.textContent).toContain("Grandma's Spaghetti");
    });

    it('says the server is down, not that the recipe is missing, and retries', async () => {
      const repo = setup();
      const fixture = TestBed.createComponent(component);
      fixture.componentRef.setInput('slug', 'grandmas-spaghetti');
      fixture.detectChanges();
      repo.reject();
      await settled();
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[data-state="error"]')).not.toBeNull();
      expect(el.textContent).not.toContain('No recipe by that name');

      const retry = Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Try again',
      ) as HTMLButtonElement;
      retry.click();
      expect(repo.listCalls).toBe(2);
      repo.resolve();
      await settled();
      fixture.detectChanges();
      expect(el.querySelector('[data-state="error"]')).toBeNull();
      expect(el.textContent).toContain("Grandma's Spaghetti");
    });

    it('shows not-found for an unknown slug once loaded', async () => {
      const repo = setup();
      const fixture = TestBed.createComponent(component);
      fixture.componentRef.setInput('slug', 'no-such-recipe');
      fixture.detectChanges();
      repo.resolve();
      await settled();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No recipe by that name');
    });
  });
}

describe('recipeTitle resolver', () => {
  it('waits for the load and titles the tab with the recipe', async () => {
    const repo = setup();
    // The store starts its fetch on construction; the resolver would otherwise
    // be the first to inject it, after this test had already tried to settle it.
    TestBed.inject(RecipeStore);
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/recipes/grandmas-spaghetti');
    repo.resolve();
    await nav;
    expect(TestBed.inject(Title).getTitle()).not.toBe("Sam's Recipes");
    expect(TestBed.inject(Title).getTitle()).toContain('Spaghetti');
  });
});
