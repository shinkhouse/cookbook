import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FakeRecipeRepository, provideFakeRecipes } from '../../core/testing/fake-repositories';
import { Recipe } from '../../core/model/recipes.model';
import { RecipeStore } from '../../core/stores/recipe.store';
import { CreateRecipeComponent } from './create-recipe.component';

const CONFLICT = 'A recipe with that name already exists. Change the title and try again.';

/** A fake whose first `list()` never answers until the test says so. */
class SlowListFake extends FakeRecipeRepository {
  release!: () => void;
  private readonly gate = new Promise<void>((resolve) => (this.release = resolve));
  override async list(): Promise<Recipe[]> {
    await this.gate;
    return super.list();
  }
}

/** A fake whose `list()` rejects until the test lets it through. */
class FlakyListFake extends FakeRecipeRepository {
  listCalls = 0;
  down = true;
  private release!: () => void;
  private gate: Promise<void> | null = null;
  override async list(): Promise<Recipe[]> {
    this.listCalls++;
    if (this.down) throw new Error('down');
    if (this.gate) await this.gate;
    return super.list();
  }
  /** The next list() stays pending until `release()`. */
  hold(): void {
    this.down = false;
    this.gate = new Promise<void>((resolve) => (this.release = resolve));
  }
  letThrough(): void {
    this.release();
  }
}

// The draft signals are protected; the spec reaches them the way the template does.
type Internals = {
  title: { set(v: string): void; (): string };
  ingredients: { set(v: unknown[]): void; (): unknown[] };
  notice(): string;
  saving(): boolean;
  save(): Promise<void>;
  onFiles(files: FileList | null): Promise<void>;
};

function filesOf(...named: [string, string][]): FileList {
  const dt = new DataTransfer();
  for (const [name, text] of named) dt.items.add(new File([text], name));
  return dt.files;
}

describe('CreateRecipeComponent', () => {
  let fake: FakeRecipeRepository;
  let fixture: ComponentFixture<CreateRecipeComponent>;
  let page: Internals;
  let navigate: jasmine.Spy;

  async function setup(repo: FakeRecipeRepository = new FakeRecipeRepository([])): Promise<void> {
    fake = repo;
    TestBed.configureTestingModule({
      imports: [CreateRecipeComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake)],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(CreateRecipeComponent);
    page = fixture.componentInstance as unknown as Internals;
    page.title.set('Soup');
    page.ingredients.set([{ qty: 1, unit: '', name: 'leek', aisle: 'produce' }]);
    fixture.detectChanges();
  }

  const button = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.btn-primary') as HTMLButtonElement;

  it('disables Save and says "Saving…" while the write is pending', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    let finish!: () => void;
    const gate = new Promise<void>((r) => (finish = r));
    const create = fake.create.bind(fake);
    spyOn(fake, 'create').and.callFake(async (r) => {
      await gate;
      return create(r);
    });
    fixture.detectChanges();
    expect(button().disabled).toBeFalse();

    const done = page.save();
    fixture.detectChanges();
    expect(button().disabled).toBeTrue();
    expect(button().textContent).toContain('Saving…');

    finish();
    await done;
  });

  it('keeps Save disabled until the store has loaded', async () => {
    const slow = new SlowListFake([]);
    await setup(slow);
    expect(button().disabled).toBeTrue();
    slow.release();
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture.detectChanges();
    expect(button().disabled).toBeFalse();
  });

  it('sends one create for two synchronous saves', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    const create = spyOn(fake, 'create').and.callThrough();
    await Promise.all([page.save(), page.save()]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('stays on the route with the draft intact when the write fails', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    fake.failNext(Object.assign(new Error('conflict'), { status: 409 }));
    await page.save();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(page.title()).toBe('Soup');
    expect(page.ingredients().length).toBe(1);
    expect(page.notice()).toBe(CONFLICT);
    expect(page.saving()).toBeFalse();
    expect(button().disabled).toBeFalse();
  });

  it('navigates to the saved recipe on success', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    await page.save();
    expect(navigate).toHaveBeenCalledOnceWith(['/recipes', 'soup']);
  });

  it('keeps importing after a failed file and reports the count', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    const recipe = (n: string): [string, string] => [
      `${n}.md`,
      `# ${n}\n\n## Ingredients\n\n- 1 cup flour\n\n## Method\n\n1. Mix.\n`,
    ];
    // The first file only fills the draft; the next two are saved straight
    // through, and the first of those fails.
    const create = fake.create.bind(fake);
    let calls = 0;
    spyOn(fake, 'create').and.callFake((r) => {
      if (calls++ === 0) return Promise.reject({ status: 403 });
      return create(r);
    });
    await page.onFiles(filesOf(recipe('Alpha'), recipe('Beta'), recipe('Gamma')));

    expect(fake.create).toHaveBeenCalledTimes(2);
    expect(page.notice()).toBe(
      "Saved 1 of 2. The rest failed: The recipe server refused the write. Check RECIPES_WRITE_KEY and that you're on localhost:4200.",
    );
  });

  describe('while the collection is not ready', () => {
    const text = (): string => fixture.nativeElement.textContent as string;
    const tryAgain = (): HTMLButtonElement | undefined =>
      Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
        (b) => b.textContent?.trim() === 'Try again',
      );

    it('says the collection is loading, with Save disabled', async () => {
      await setup(new SlowListFake([]));
      const status = fixture.nativeElement.querySelector('[role="status"][data-state="loading"]');
      expect(status?.textContent).toContain('Loading the collection…');
      expect(button().disabled).toBeTrue();
    });

    it('says saving is paused after a failed load, and Try again reloads', async () => {
      const flaky = new FlakyListFake([]);
      await setup(flaky);
      await TestBed.inject(RecipeStore).whenLoaded();
      fixture.detectChanges();
      const alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain("Couldn't load the recipe collection, so saving is paused.");
      expect(button().disabled).toBeTrue();
      expect(tryAgain()).toBeDefined();

      flaky.hold();
      tryAgain()!.click();
      expect(flaky.listCalls).toBe(2);
      flaky.letThrough();
      await TestBed.inject(RecipeStore).whenLoaded();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
      expect(text()).not.toContain('saving is paused');
      expect(button().disabled).toBeFalse();
    });

    it('imports nothing from a folder drop when the collection fails to load', async () => {
      await setup(new FlakyListFake([]));
      const recipe = (n: string): [string, string] => [
        `${n}.md`,
        `# ${n}\n\n## Ingredients\n\n- 1 cup flour\n\n## Method\n\n1. Mix.\n`,
      ];
      const create = spyOn(fake, 'create').and.callThrough();
      await page.onFiles(filesOf(recipe('Alpha'), recipe('Beta')));
      expect(create).not.toHaveBeenCalled();
      expect(page.notice()).toBe("Couldn't load the recipe collection, so nothing was imported.");
    });
  });
});
