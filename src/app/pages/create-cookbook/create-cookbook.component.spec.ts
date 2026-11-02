import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../../core/testing/fake-repositories';
import { CreateCookbookComponent } from './create-cookbook.component';

describe('CreateCookbookComponent', () => {
  let fixture: ComponentFixture<CreateCookbookComponent>;
  let cookbooks: FakeCookbookRepository;
  let navigate: jasmine.Spy;

  async function setup(): Promise<void> {
    cookbooks = new FakeCookbookRepository([{ id: 'sams-cookbook', name: "Sam's Cookbook" }]);
    TestBed.configureTestingModule({
      imports: [CreateCookbookComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(), ...provideFakeCookbooks(cookbooks)],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    await TestBed.inject(CookbookStore).whenLoaded();
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(CreateCookbookComponent);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const save = (): HTMLButtonElement => el().querySelector('button.btn-primary')!;
  const problem = (): string => el().querySelector('[role="alert"]')?.textContent?.trim() ?? '';

  function type(selector: string, value: string): void {
    const field = el().querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function press(): Promise<void> {
    save().click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the id the name will get', async () => {
    await setup();
    type('input[name="name"]', "Grandma's Holiday Book");
    expect(el().textContent).toContain('grandmas-holiday-book');
  });

  it('keeps Save disabled while the name is empty', async () => {
    await setup();
    expect(save().disabled).toBeTrue();
    type('input[name="name"]', '   ');
    expect(save().disabled).toBeTrue();
    type('input[name="name"]', 'Bob');
    expect(save().disabled).toBeFalse();
  });

  it('refuses an id that is already taken', async () => {
    await setup();
    const add = spyOn(TestBed.inject(CookbookStore), 'add').and.resolveTo('x');
    type('input[name="name"]', "Sam's Cookbook");
    expect(el().textContent).toContain("There's already a cookbook called that.");
    expect(save().disabled).toBeTrue();
    expect(add).not.toHaveBeenCalled();
  });

  it('adds the cookbook and goes to the library', async () => {
    await setup();
    const add = spyOn(TestBed.inject(CookbookStore), 'add').and.callThrough();
    type('input[name="name"]', 'Bob');
    type('textarea[name="description"]', 'Things Bob makes');
    await press();
    expect(add).toHaveBeenCalledOnceWith({ id: 'bob', name: 'Bob', description: 'Things Bob makes' });
    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(TestBed.inject(CookbookStore).byId('bob')).toBeDefined();
  });

  it('selects the new cookbook in the library facet', async () => {
    await setup();
    type('input[name="name"]', 'Bob');
    await press();
    const recipes = TestBed.inject(RecipeStore);
    expect(recipes.selectedCount()).toBe(1);
  });

  it('omits an empty description', async () => {
    await setup();
    const add = spyOn(TestBed.inject(CookbookStore), 'add').and.resolveTo('bob');
    type('input[name="name"]', 'Bob');
    type('textarea[name="description"]', '  ');
    await press();
    expect(add).toHaveBeenCalledOnceWith({ id: 'bob', name: 'Bob' });
  });

  it('reads Saving… and disables the button while the write is out', async () => {
    await setup();
    let release!: (id: string) => void;
    spyOn(TestBed.inject(CookbookStore), 'add').and.returnValue(new Promise((r) => (release = r)));
    type('input[name="name"]', 'Bob');
    save().click();
    fixture.detectChanges();
    expect(save().textContent).toContain('Saving…');
    expect(save().disabled).toBeTrue();
    release('bob');
    await fixture.whenStable();
  });

  it('shows a write error and stays on the page', async () => {
    await setup();
    cookbooks.failNext({ status: 0 });
    type('input[name="name"]', 'Bob');
    await press();
    expect(problem()).toContain("Couldn't reach the recipe server");
    expect(navigate).not.toHaveBeenCalled();
    expect(save().disabled).toBeFalse();
  });
});

describe('the /cookbooks/new route', () => {
  function configure(writable: boolean): void {
    const recipes = new FakeRecipeRepository([]);
    recipes.writable = writable;
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        ...provideFakeRecipes(recipes),
        ...provideFakeCookbooks(new FakeCookbookRepository([])),
      ],
    });
  }

  it('is not matchable when read-only', async () => {
    configure(false);
    await RouterTestingHarness.create('/cookbooks/new');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('is kept when writable', async () => {
    configure(true);
    await RouterTestingHarness.create('/cookbooks/new');
    expect(TestBed.inject(Router).url).toBe('/cookbooks/new');
  });
});
