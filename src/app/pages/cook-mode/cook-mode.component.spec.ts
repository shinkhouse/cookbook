import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Recipe } from '../../core/model/recipes.model';
import { PrefsStore } from '../../core/stores/prefs.store';
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
  ingredients: [
    { qty: 2, unit: 'cup', name: 'stock', aisle: 'pantry' },
    { qty: 1, unit: '', name: 'onion', aisle: 'produce' },
  ],
  steps: ['Simmer the stock for 20 minutes.', 'Bake for 5 minutes.', 'Rest for 10 minutes.'],
  notes: [],
  cookbooks: [],
};

const OTHER: Recipe = { ...RECIPE, slug: 'other-stew', title: 'A Very Long Recipe Title That Cannot Fit', steps: ['Boil for 3 minutes.', 'Chill.'] };

async function setup(): Promise<ComponentFixture<CookModeComponent>> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      ...provideFakeRecipes(new FakeRecipeRepository([RECIPE, OTHER])),
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
      const dismiss = document.querySelector<HTMLElement>('[aria-label^="Dismiss step 3 timer"]');
      expect(dismiss).not.toBeNull();
      click(dismiss);
      expect(el.querySelector('.timer-badge') && text(el.querySelector('.timer-badge'))).toBe('+1');
      click(el.querySelector('.timer'));
      expect(rows().map((r) => text(r.querySelector('.timer-row-label')))).toEqual([
        'Step 2 · 5:00',
        'Step 1 · 20:00',
      ]);
    });

    it('moves arrow-key focus onto the rows and Enter dismisses the focused one', () => {
      click(el.querySelector('.timer'));
      const menu = document.querySelector('.mat-mdc-menu-panel')!;
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
      refresh();
      const first = document.querySelector<HTMLElement>('.timer-row')!;
      expect(document.activeElement).toBe(first);
      expect(first.getAttribute('aria-label')).toBe('Dismiss step 2 timer, 5:00 left');
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      first.click(); // a real Enter on a button fires click
      refresh();
      expect(text(el.querySelector('.timer-badge'))).toBe('+1');
    });

    it('moves focus to the exit link when the last timer is dismissed from the menu', async () => {
      for (let i = 0; i < 3; i++) {
        click(el.querySelector('.timer'));
        click(document.querySelector('.timer-row'));
      }
      refresh();
      expect(chips().length).toBe(0);
      expect(document.querySelector('.cdk-overlay-pane')).toBeNull();
      expect(document.activeElement).toBe(el.querySelector('.exit'));
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

  it('forgets timers and position when the slug changes', () => {
    click(startButton());
    nextStep();
    fixture.componentRef.setInput('slug', OTHER.slug);
    refresh();
    expect(chips().length).toBe(0);
    expect(text(el.querySelector('.step-counter'))).toBe('Step 1 of 2');
    expect(text(startButton())).toContain('Start 3 min timer');
  });

  describe('header layout', () => {
    const centreOf = (n: Element) => {
      const r = n.getBoundingClientRect();
      return r.left + r.width / 2;
    };
    const head = () => el.querySelector('.cook-head')!;

    for (const width of [390, 900]) {
      it(`keeps the title centred at ${width}px in every timer state`, () => {
        fixture.componentRef.setInput('slug', OTHER.slug);
        refresh();
        el.style.display = 'block';
        el.style.width = `${width}px`;
        refresh();
        const title = el.querySelector('.cook-title')!;
        const expectCentred = () => {
          const h = head().getBoundingClientRect();
          expect(Math.abs(centreOf(title) - (h.left + h.width / 2))).toBeLessThan(1);
        };
        expectCentred();
        click(startButton());
        expectCentred();
        const chipWidth = el.querySelector('.timer')!.getBoundingClientRect().width;
        tick(5);
        expectCentred();
        fixture.componentRef.setInput('slug', RECIPE.slug);
        refresh();
        click(startButton());
        nextStep();
        click(startButton());
        expectCentred();
        // Ticking and a second timer (the +N badge) leave the chip's width alone.
        expect(el.querySelector('.timer')!.getBoundingClientRect().width).toBe(chipWidth);
      });
    }

    it('gives the title over 400px at 768px, still centred', () => {
      el.style.display = 'block';
      el.style.width = '768px';
      el.style.setProperty('--pad-section', '38px');
      refresh();
      const title = el.querySelector('.cook-title')!;
      const h = head().getBoundingClientRect();
      expect(title.getBoundingClientRect().width).toBeGreaterThanOrEqual(400);
      expect(Math.abs(centreOf(title) - (h.left + h.width / 2))).toBeLessThan(1);
      click(startButton());
      const chip = el.querySelector('.timer')!.getBoundingClientRect();
      expect(chip.left).toBeGreaterThanOrEqual(title.getBoundingClientRect().right);
      expect(chip.right).toBeLessThanOrEqual(h.right + 0.5);
    });

    it('has no empty second row at 390px when there is no timer', () => {
      el.style.display = 'block';
      el.style.width = '390px';
      el.style.setProperty('--pad-section', '24px');
      refresh();
      const h = head().getBoundingClientRect();
      const title = el.querySelector('.cook-title')!.getBoundingClientRect();
      const exit = el.querySelector('.exit')!.getBoundingClientRect();
      // 18px of padding above and below the tallest item in the one row.
      expect(h.height).toBeCloseTo(36 + Math.max(title.height, exit.height), 0);
    });

    for (const width of [360, 390]) {
      it(`gives the title the width at ${width}px and puts the chip under it`, () => {
        fixture.componentRef.setInput('slug', OTHER.slug);
        refresh();
        el.style.display = 'block';
        el.style.width = `${width}px`;
        // `5vw` follows the test window, not the host; a phone's window gives 24px.
        el.style.setProperty('--pad-section', '24px');
        refresh();
        click(startButton());
        tick(3);
        const title = el.querySelector('.cook-title')!.getBoundingClientRect();
        const exit = el.querySelector('.exit')!.getBoundingClientRect();
        const chip = el.querySelector('.timer')!.getBoundingClientRect();
        const h = head().getBoundingClientRect();
        const overlap = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap(chip, title)).toBeFalse();
        expect(overlap(chip, exit)).toBeFalse();
        expect(chip.top).toBeGreaterThanOrEqual(title.bottom);
        expect(Math.abs(centreOf(el.querySelector('.cook-title')!) - (h.left + h.width / 2))).toBeLessThan(1);
        expect(title.width).toBeGreaterThanOrEqual(200);
        expect(Math.abs(chip.left + chip.width / 2 - (h.left + h.width / 2))).toBeLessThan(1);
      });
    }
  });
});

describe('cook mode ingredients panel', () => {
  let fixture: ComponentFixture<CookModeComponent>;
  let el: HTMLElement;

  const refresh = () => fixture.detectChanges();
  const toggle = () => el.querySelector<HTMLButtonElement>('.sidebar-toggle')!;
  const panel = () => el.querySelector<HTMLElement>('.sidebar')!;
  const body = () => el.querySelector<HTMLElement>('.sidebar-body')!;
  const click = () => {
    toggle().click();
    refresh();
  };

  async function create(): Promise<void> {
    fixture = await setup();
    el = fixture.nativeElement;
  }

  beforeEach(async () => {
    localStorage.clear();
    await create();
  });

  afterEach(() => {
    fixture.destroy();
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('opens with a labelled toggle that controls the panel body', () => {
    expect(toggle().getAttribute('aria-label')).toBe('Hide ingredients');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(body().id).toBeTruthy();
    expect(toggle().getAttribute('aria-controls')).toBe(body().id);
    expect(panel().classList).not.toContain('is-closed');
    expect(body().hasAttribute('inert')).toBeFalse();
  });

  it('puts the toggle on the heading row, after the heading', () => {
    const head = el.querySelector('.sidebar-top')!;
    expect(head.querySelector('.sidebar-head')).not.toBeNull();
    expect(head.querySelector('.sidebar-toggle')).toBe(toggle());
  });

  it('closes: relabels, flags the panel, and takes the checkboxes out of reach', () => {
    click();
    expect(toggle().getAttribute('aria-label')).toBe('Show ingredients');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(panel().classList).toContain('is-closed');
    expect(el.querySelector('.cook-body')!.classList).toContain('is-closed');
    expect(body().hasAttribute('inert')).toBeTrue();
    const inputs = body().querySelectorAll('input[type=checkbox]');
    expect(inputs.length).toBe(2);
    inputs.forEach((i) => expect(i.closest('[inert]')).not.toBeNull());
  });

  it('hides the list from sight once the close has run its course', async () => {
    jasmine.clock().uninstall(); // the transition needs real time
    click();
    await new Promise((r) => setTimeout(r, 400));
    expect(getComputedStyle(body()).visibility).toBe('hidden');
  });

  it('opens again and restores everything', () => {
    click();
    click();
    expect(toggle().getAttribute('aria-label')).toBe('Hide ingredients');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(panel().classList).not.toContain('is-closed');
    expect(body().hasAttribute('inert')).toBeFalse();
    expect(getComputedStyle(body()).visibility).toBe('visible');
  });

  it('keeps the checks working while open', () => {
    el.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    refresh();
    expect(el.querySelectorAll('.ing-list li.is-checked').length).toBe(1);
  });

  it('remembers the choice when the component is created again', async () => {
    click();
    fixture.destroy();
    jasmine.clock().uninstall();
    fixture = TestBed.createComponent(CookModeComponent);
    fixture.componentRef.setInput('slug', RECIPE.slug);
    fixture.detectChanges();
    el = fixture.nativeElement;
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(panel().classList).toContain('is-closed');
    expect(body().hasAttribute('inert')).toBeTrue();
  });

  it('starts closed when the stored choice is closed', async () => {
    fixture.destroy();
    jasmine.clock().uninstall();
    TestBed.resetTestingModule();
    localStorage.setItem('cookbook.cookIngredients', 'false');
    await create();
    expect(toggle().getAttribute('aria-label')).toBe('Show ingredients');
    expect(body().hasAttribute('inert')).toBeTrue();
  });

  it('centres the toggle in the closed rail', async () => {
    jasmine.clock().uninstall();
    el.style.display = 'block';
    el.style.width = '1200px';
    refresh();
    click();
    await new Promise((r) => setTimeout(r, 450));
    const side = panel().getBoundingClientRect();
    const btn = toggle().getBoundingClientRect();
    expect(Math.abs(btn.left + btn.width / 2 - (side.left + side.width / 2))).toBeLessThan(1);
  });

  it('closes to a round toggle with its icon centred and no box around it', async () => {
    jasmine.clock().uninstall();
    el.style.display = 'block';
    el.style.width = '1200px';
    refresh();
    click();
    await new Promise((r) => setTimeout(r, 450));
    const btn = toggle().getBoundingClientRect();
    const icon = toggle().querySelector('mat-icon')!.getBoundingClientRect();
    expect(Math.abs(btn.width - btn.height)).toBeLessThan(1);
    expect(Math.abs(icon.left + icon.width / 2 - (btn.left + btn.width / 2))).toBeLessThan(1);
    expect(Math.abs(icon.top + icon.height / 2 - (btn.top + btn.height / 2))).toBeLessThan(1);
    expect(Math.abs(panel().getBoundingClientRect().width - btn.width)).toBeLessThan(1);
    expect(Math.abs(panel().getBoundingClientRect().height - btn.height)).toBeLessThan(1);
  });

  it('fades the list out at the start of closing, before the fold ends', async () => {
    jasmine.clock().uninstall();
    click();
    await new Promise((r) => setTimeout(r, 140));
    expect(getComputedStyle(body()).opacity).toBe('0');
  });

  it('shows the list icon set for the layout: chevrons wide, expand arrows stacked', () => {
    el.style.display = 'block';
    el.style.width = '1200px';
    refresh();
    const wide = toggle().querySelector<HTMLElement>('.icon-wide')!;
    const stacked = toggle().querySelector<HTMLElement>('.icon-stacked')!;
    expect(getComputedStyle(wide).display).not.toBe('none');
    expect(getComputedStyle(stacked).display).toBe('none');
    expect(wide.textContent!.trim() || wide.getAttribute('fonticon')).toContain('chevron_right');
    el.style.width = '600px';
    refresh();
    expect(getComputedStyle(wide).display).toBe('none');
    expect(getComputedStyle(stacked).display).not.toBe('none');
    expect(stacked.getAttribute('fonticon')).toBe('expand_less');
    click();
    expect(stacked.getAttribute('fonticon')).toBe('expand_more');
    expect(wide.getAttribute('fonticon')).toBe('chevron_left');
  });

  it('leaves nothing under the heading when closed', async () => {
    jasmine.clock().uninstall();
    el.style.display = 'block';
    el.style.width = '1200px';
    refresh();
    click();
    await new Promise((r) => setTimeout(r, 450));
    expect(body().getBoundingClientRect().height).toBe(0);
  });

  describe('layout', () => {
    const cols = () => getComputedStyle(el.querySelector('.cook-body')!).gridTemplateColumns.split(' ').map(parseFloat);
    // With transitions off the layout lands on the next frame, so nothing waits on a timer.
    const settle = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
    let noMotion: HTMLStyleElement;

    beforeEach(() => {
      jasmine.clock().uninstall();
      noMotion = document.createElement('style');
      noMotion.textContent = '*, *::before, *::after { transition: none !important; }';
      document.head.appendChild(noMotion);
      el.style.display = 'block';
      el.style.width = '1200px';
      refresh();
    });

    afterEach(() => noMotion.remove());

    it('gives the ingredients column about 41% of the row, the step column the rest', () => {
      const [stage, side] = cols();
      expect(side / (stage + side)).toBeGreaterThan(0.39);
      expect(side / (stage + side)).toBeLessThan(0.43);
    });

    it('shrinks to a slim rail when closed and the step column takes the room', async () => {
      const [stageOpen, sideOpen] = cols();
      click();
      await settle();
      const [stage, side] = cols();
      expect(side).toBeLessThan(46);
      expect(side).toBeGreaterThanOrEqual(44);
      expect(stage).toBeGreaterThan(stageOpen);
      expect(sideOpen).toBeGreaterThan(side);
    });
  });
});

describe('cook mode step ingredients', () => {
  let fixture: ComponentFixture<CookModeComponent>;
  let el: HTMLElement;
  const text = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const chips = () => Array.from(el.querySelectorAll('.step-chip')).map(text);

  afterEach(() => {
    fixture.destroy();
    jasmine.clock().uninstall();
  });

  it('shows a Uses list under a step that names an ingredient', async () => {
    fixture = await setup();
    el = fixture.nativeElement;
    expect(chips()).toEqual(['2 cups stock']);
    expect(el.querySelector('.step-uses')!.getAttribute('aria-label')).toBe('Uses');
  });

  it('shows nothing under a step that names none', async () => {
    fixture = await setup();
    el = fixture.nativeElement;
    el.querySelectorAll<HTMLElement>('.stage-nav button')[1].click();
    fixture.detectChanges();
    expect(el.querySelector('.step-uses')).toBeNull();
  });

  it('uses the component\'s ingredients for a component step', async () => {
    const sauce: Recipe = {
      ...RECIPE,
      slug: 'sauce',
      component: true,
      ingredients: [{ qty: 3, unit: 'tbsp', name: 'butter', aisle: 'dairy' }],
      steps: ['Melt the butter and the onion.'],
    };
    const parent: Recipe = {
      ...RECIPE,
      slug: 'parent',
      ingredients: [{ qty: 1, unit: '', name: 'onion', aisle: 'produce' }],
      steps: ['Fry the onion and the butter.'],
      components: [{ slug: 'sauce', label: 'For the sauce' }],
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeRecipes(new FakeRecipeRepository([parent, sauce])),
        ...provideFakeCookbooks(new FakeCookbookRepository([])),
      ],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    jasmine.clock().install();
    fixture = TestBed.createComponent(CookModeComponent);
    fixture.componentRef.setInput('slug', 'parent');
    fixture.detectChanges();
    el = fixture.nativeElement;
    expect(chips()).toEqual(['3 tbsp butter']);
    el.querySelectorAll<HTMLElement>('.stage-nav button')[1].click();
    fixture.detectChanges();
    expect(chips()).toEqual(['1 onion']);
  });
});

describe('cook mode with embedded recipes', () => {
  const SAUCE: Recipe = {
    ...RECIPE,
    slug: 'sauce',
    title: 'Sauce Title',
    component: true,
    ingredients: [{ qty: 3, unit: 'tbsp', name: 'butter', aisle: 'dairy' }],
    steps: ['Melt for 2 minutes.', 'Whisk.'],
  };
  const PARENT: Recipe = {
    ...RECIPE,
    slug: 'parent',
    title: 'Parent',
    ingredients: [{ qty: 1, unit: '', name: 'chicken', aisle: 'meat' }],
    steps: ['Roast for 40 minutes.'],
    components: [{ slug: 'sauce', label: 'For the sauce' }, { slug: 'gone' }],
  };
  let fixture: ComponentFixture<CookModeComponent>;
  let el: HTMLElement;
  const text = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const refresh = () => fixture.detectChanges();
  const nextStep = () => {
    Array.from(el.querySelectorAll<HTMLElement>('.stage-nav button'))
      .find((b) => /Next step/.test(b.textContent ?? ''))!
      .click();
    refresh();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeRecipes(new FakeRecipeRepository([PARENT, SAUCE])),
        ...provideFakeCookbooks(new FakeCookbookRepository([])),
      ],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    jasmine.clock().install();
    fixture = TestBed.createComponent(CookModeComponent);
    fixture.componentRef.setInput('slug', 'parent');
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  afterEach(() => {
    fixture.destroy();
    jasmine.clock().uninstall();
  });

  it('counts component steps and the parent steps as one sequence', () => {
    expect(text(el.querySelector('.step-counter'))).toBe('Step 1 of 3');
    expect(text(el.querySelector('.step-text'))).toBe('Melt for 2 minutes.');
    nextStep();
    nextStep();
    expect(text(el.querySelector('.step-counter'))).toBe('Step 3 of 3');
    expect(text(el.querySelector('.step-text'))).toBe('Roast for 40 minutes.');
  });

  it('labels a component step with the component label', () => {
    expect(text(el.querySelector('.step-label'))).toBe('For the sauce');
    nextStep();
    nextStep();
    expect(el.querySelector('.step-label')).toBeNull();
  });

  it('runs the progress bar across the whole sequence', () => {
    nextStep();
    expect(el.querySelector<HTMLElement>('.progress-fill')!.style.width).toBe('67%');
  });

  it('keys timers by the flat step index', () => {
    (el.querySelector('.timer-start') as HTMLElement).click();
    refresh();
    nextStep();
    nextStep();
    (el.querySelector('.timer-start') as HTMLElement).click();
    refresh();
    (el.querySelector('.timer') as HTMLElement).click();
    refresh();
    const rows = Array.from(document.querySelectorAll('.timer-row-label')).map(text);
    expect(rows).toEqual(['Step 1 · 2:00', 'Step 3 · 40:00']);
  });

  it('lists every step in the jump list, with component labels as headers', () => {
    expect(el.querySelectorAll('.jump button').length).toBe(3);
    expect(Array.from(el.querySelectorAll('.jump-group')).map(text)).toEqual(['For the sauce', 'Parent']);
  });

  it('groups the ingredients panel by component, skipping a missing one', () => {
    expect(Array.from(el.querySelectorAll('.ing-name')).map(text)).toEqual(['chicken', 'butter']);
    expect(Array.from(el.querySelectorAll('.ing-group')).map(text)).toEqual(['For the sauce']);
  });

  it('checks an ingredient from a component without touching the parent\'s', () => {
    const boxes = () => Array.from(el.querySelectorAll<HTMLInputElement>('.ing-list input[type=checkbox]'));
    boxes()[1].click();
    refresh();
    expect(boxes().map((b) => b.checked)).toEqual([false, true]);
    expect(el.querySelectorAll('.ing-list li.is-checked').length).toBe(1);
  });
});

describe('cook mode step ownership and slug changes', () => {
  const part = (slug: string, steps: string[]): Recipe => ({ ...RECIPE, slug, title: slug, component: true, ingredients: [], steps });
  const PARENT: Recipe = {
    ...RECIPE,
    slug: 'parent',
    title: 'Same',
    ingredients: [],
    steps: ['Own one.', 'Own two.'],
    components: [{ slug: 'a', label: 'Same' }, { slug: 'b', label: 'Dup' }, { slug: 'c', label: 'Dup' }],
  };
  const SOLO: Recipe = { ...RECIPE, slug: 'solo', title: 'Solo', steps: ['Only step.'] };
  let fixture: ComponentFixture<CookModeComponent>;
  let el: HTMLElement;
  const text = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeRecipes(
          new FakeRecipeRepository([PARENT, SOLO, part('a', ['A1.']), part('b', ['B1.']), part('c', ['C1.'])]),
        ),
        ...provideFakeCookbooks(new FakeCookbookRepository([])),
      ],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    jasmine.clock().install();
    fixture = TestBed.createComponent(CookModeComponent);
    fixture.componentRef.setInput('slug', 'parent');
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  afterEach(() => {
    fixture.destroy();
    jasmine.clock().uninstall();
  });

  it('shows a component label even when it matches the parent title', () => {
    expect(text(el.querySelector('.step-label'))).toBe('Same');
  });

  it('keeps headers for adjacent components that share a label', () => {
    expect(Array.from(el.querySelectorAll('.jump-group')).map(text)).toEqual(['Same', 'Dup', 'Dup', 'Same']);
  });

  it('resets to step 1 of a shorter recipe when the slug changes', () => {
    el.querySelectorAll<HTMLElement>('.stage-nav button')[1].click();
    fixture.detectChanges();
    fixture.componentRef.setInput('slug', 'solo');
    fixture.detectChanges();
    expect(text(el.querySelector('.step-counter'))).toBe('Step 1 of 1');
    expect(el.querySelectorAll('.jump button').length).toBe(1);
    expect(el.querySelector('.step-label')).toBeNull();
    expect(el.querySelectorAll('.jump-group').length).toBe(0);
  });
});

describe('cook mode units', () => {
  let fixture: ComponentFixture<CookModeComponent>;
  let el: HTMLElement;

  const amounts = () =>
    Array.from(el.querySelectorAll('.ing-amount')).map((n) => (n.textContent ?? '').trim());
  const unitButton = (label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('.unit-toggle button')).find(
      (b) => b.textContent?.trim() === label,
    )!;

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    fixture.destroy();
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('converts the ingredients panel when Metric is chosen', async () => {
    fixture = await setup();
    el = fixture.nativeElement;
    expect(amounts()).toEqual(['2 cups', '1']);
    expect(unitButton('US').getAttribute('aria-pressed')).toBe('true');
    unitButton('Metric').click();
    fixture.detectChanges();
    expect(amounts()).toEqual(['470 ml', '1']);
    expect(unitButton('Metric').getAttribute('aria-pressed')).toBe('true');
    expect(unitButton('US').getAttribute('aria-pressed')).toBe('false');
  });

  it('shares the choice with the detail page', async () => {
    // The detail page writes the preference through PrefsStore; cook mode, created
    // afterwards, reads it back from the same storage.
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(PrefsStore).setUnits('metric');
    TestBed.resetTestingModule();
    fixture = await setup();
    el = fixture.nativeElement;
    expect(amounts()[0]).toBe('470 ml');
    expect(unitButton('Metric').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('cook mode wake lock', () => {
  const own = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');
  afterEach(() => {
    jasmine.clock().uninstall();
    if (own) Object.defineProperty(navigator, 'wakeLock', own);
    else delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  it('requests the lock on creation and releases it on destroy', async () => {
    const sentinel = {
      release: jasmine.createSpy('release').and.resolveTo(undefined),
      addEventListener: () => undefined,
    };
    const request = jasmine.createSpy('request').and.resolveTo(sentinel);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const fixture = await setup();
    expect(request).toHaveBeenCalledOnceWith('screen');
    await Promise.resolve();
    await Promise.resolve();
    fixture.destroy();
    expect(sentinel.release).toHaveBeenCalled();
  });
});

describe('cook mode mark as cooked', () => {
  afterEach(() => localStorage.removeItem('cookbook.deviceKey'));

  let fake: FakeRecipeRepository;
  let fixture: ComponentFixture<CookModeComponent>;
  let navigate: jasmine.Spy;

  async function setup(unlocked: boolean): Promise<void> {
    if (unlocked) localStorage.setItem('cookbook.deviceKey', JSON.stringify('sesame'));
    else localStorage.removeItem('cookbook.deviceKey');
    fake = new FakeRecipeRepository([{ ...RECIPE, steps: ['Only step.'] }]);
    fake.writable = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeRecipes(fake),
        ...provideFakeCookbooks(new FakeCookbookRepository([])),
      ],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(CookModeComponent);
    fixture.componentRef.setInput('slug', RECIPE.slug);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('asks before marking when Finished is pressed on an unlocked device', async () => {
    await setup(true);
    button('Finished')!.click();
    fixture.detectChanges();
    expect(el().textContent).toContain('Mark as cooked?');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('marks cooked and returns to the recipe', async () => {
    await setup(true);
    button('Finished')!.click();
    fixture.detectChanges();
    button('Mark as cooked')!.click();
    await settle();
    expect(TestBed.inject(RecipeStore).bySlug(RECIPE.slug)!.cooked).toBe(RECIPE.cooked + 1);
    expect(navigate).toHaveBeenCalledWith(['/recipes', RECIPE.slug]);
  });

  it('Not this time leaves without writing', async () => {
    await setup(true);
    const spy = spyOn(fake, 'markCooked').and.callThrough();
    button('Finished')!.click();
    fixture.detectChanges();
    button('Not this time')!.click();
    await settle();
    expect(spy).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/recipes', RECIPE.slug]);
  });

  it('Finished leaves straight away when the device cannot save', async () => {
    await setup(false);
    button('Finished')!.click();
    fixture.detectChanges();
    expect(el().textContent).not.toContain('Mark as cooked?');
    expect(navigate).toHaveBeenCalledWith(['/recipes', RECIPE.slug]);
  });

  it('stays on the confirm with the reason when the write fails', async () => {
    await setup(true);
    button('Finished')!.click();
    fixture.detectChanges();
    fake.failNext({ status: 403 });
    button('Mark as cooked')!.click();
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    expect(el().querySelector('.cooked-error')?.textContent).toContain('Unlock it again from the footer.');
    button('Leave anyway')!.click();
    await settle();
    expect(navigate).toHaveBeenCalledWith(['/recipes', RECIPE.slug]);
  });
});
