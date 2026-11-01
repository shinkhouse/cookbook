import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Recipe } from '../../core/model/recipes.model';
import { RecipeStore } from '../../core/stores/recipe.store';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../../core/testing/fake-repositories';
import { CookModeComponent } from './cook-mode.component';

const RECIPE: Recipe = {
  slug: 'timer-stew',
  title: 'Timer Stew',
  tags: [],
  time: '35 min',
  servings: 2,
  cooked: 0,
  blurb: '',
  desc: '',
  ingredients: [],
  steps: ['Simmer for 20 minutes.', 'Bake for 5 minutes.', 'Rest for 10 minutes.'],
  notes: [],
  cookbooks: [],
};

async function setup(): Promise<ComponentFixture<CookModeComponent>> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      ...provideFakeRecipes(new FakeRecipeRepository([RECIPE])),
      ...provideFakeCookbooks(new FakeCookbookRepository([])),
    ],
  });
  await TestBed.inject(RecipeStore).whenLoaded();
  // After loading, so the mock clock never holds the fake repository's timers.
  jasmine.clock().install();
  const fixture = TestBed.createComponent(CookModeComponent);
  fixture.componentRef.setInput('slug', RECIPE.slug);
  fixture.detectChanges();
  return fixture;
}

describe('cook mode timers', () => {
  let fixture: ComponentFixture<CookModeComponent>;
  let el: HTMLElement;

  const refresh = () => fixture.detectChanges();
  const tick = (seconds: number) => {
    for (let i = 0; i < seconds; i++) jasmine.clock().tick(1000);
    refresh();
  };
  const click = (node: Element | null | undefined) => {
    (node as HTMLElement).click();
    refresh();
  };
  const startButton = () => el.querySelector<HTMLButtonElement>('.timer-start');
  const nextStep = () =>
    click(Array.from(el.querySelectorAll('.stage-nav button')).find((b) => /Next step/.test(b.textContent ?? '')));
  const backStep = () =>
    click(Array.from(el.querySelectorAll('.stage-nav button')).find((b) => /Back/.test(b.textContent ?? '')));
  const chips = () => el.querySelectorAll('.timer');
  const text = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = () => Array.from(document.querySelectorAll('.timer-row'));

  beforeEach(async () => {
    fixture = await setup();
    el = fixture.nativeElement;
  });

  afterEach(() => {
    fixture.destroy();
    jasmine.clock().uninstall();
  });

  it('renders the exit link with an accessible name', () => {
    expect(el.querySelector('.exit')?.getAttribute('aria-label')).toBe('Leave cook mode');
  });

  it('creates exactly one timer when Start is clicked twice', () => {
    const button = startButton()!;
    button.click();
    button.click();
    refresh();
    expect(chips().length).toBe(1);
    expect(el.querySelector('.timer-badge')).toBeNull();
  });

  it('shows a disabled live countdown on the running step', () => {
    expect(text(startButton())).toContain('Start 20 min timer');
    click(startButton());
    const button = startButton()!;
    expect(button.disabled).toBeTrue();
    expect(text(button)).toContain('20:00 left');
    expect(button.getAttribute('aria-label')).toBe('20 min timer running, 20:00 left');
    tick(3);
    expect(text(startButton())).toContain('19:57 left');
  });

  it('keeps the countdown when leaving the step and coming back', () => {
    click(startButton());
    tick(5);
    nextStep();
    expect(text(startButton())).toContain('Start 5 min timer');
    backStep();
    expect(startButton()!.disabled).toBeTrue();
    expect(text(startButton())).toContain('19:55 left');
  });

  it('reads "Timer done" when finished, and clicking it dismisses the timer', () => {
    nextStep();
    click(startButton());
    tick(300);
    const button = startButton()!;
    expect(text(button)).toContain('Timer done');
    expect(button.disabled).toBeFalse();
    expect(button.classList).toContain('is-done');
    click(button);
    expect(text(startButton())).toContain('Start 5 min timer');
    expect(chips().length).toBe(0);
  });

  describe('with timers on three steps', () => {
    beforeEach(() => {
      click(startButton()); // step 1, 20 min
      nextStep();
      click(startButton()); // step 2, 5 min
      nextStep();
      click(startButton()); // step 3, 10 min
    });

    it('shows one chip with the shortest time and +2', () => {
      expect(chips().length).toBe(1);
      expect(text(el.querySelector('.timer'))).toContain('5:00');
      expect(text(el.querySelector('.timer-badge'))).toBe('+2');
    });

    it('lists every timer in urgency order in the menu', () => {
      click(el.querySelector('.timer'));
      expect(rows().map((r) => text(r.querySelector('.timer-row-label')))).toEqual([
        'Step 2 · 5:00',
        'Step 3 · 10:00',
        'Step 1 · 20:00',
      ]);
    });

    it('removes a timer when its row is dismissed', () => {
      click(el.querySelector('.timer'));
      const dismiss = document.querySelector<HTMLElement>('[aria-label="Dismiss step 3 timer"]');
      expect(dismiss).not.toBeNull();
      click(dismiss);
      expect(el.querySelector('.timer-badge') && text(el.querySelector('.timer-badge'))).toBe('+1');
      click(el.querySelector('.timer'));
      expect(rows().map((r) => text(r.querySelector('.timer-row-label')))).toEqual([
        'Step 2 · 5:00',
        'Step 1 · 20:00',
      ]);
    });

    it('moves a finished timer to the top and shows Done', () => {
      tick(300);
      const chip = el.querySelector('.timer')!;
      expect(text(chip)).toContain('Done');
      expect(chip.classList).toContain('is-done');
      click(chip);
      expect(rows().map((r) => text(r.querySelector('.timer-row-label')))).toEqual([
        'Step 2 · Done',
        'Step 3 · 5:00',
        'Step 1 · 15:00',
      ]);
    });
  });
});
