import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { stripDescriptors, ingredientHead } from '../../core/ingredient-key';
import { Ingredient, Recipe } from '../../core/model/recipes.model';
import { ingredientsInStep } from '../../core/step-ingredients';
import { DeviceStore } from '../../core/stores/device.store';
import { describeDeviceError } from '../../core/write-error';
import { PrefsStore } from '../../core/stores/prefs.store';
import { UnitSystem, amountText } from '../../core/units';
import { RecipeStore } from '../../core/stores/recipe.store';
import { ScreenWakeLock } from '../../core/wake-lock';
import { formatCountdown, parseDuration } from '../../core/timer';

interface RunningTimer {
  id: number;
  /** The step this timer belongs to; a step holds at most one. */
  stepIndex: number;
  label: string;
  /** Seconds left. Counted down by the single shared interval. */
  remaining: number;
  total: number;
  /** Order of finishing, so the earliest-finished sorts first. Unset while running. */
  finishedAt?: number;
}

interface FlatStep {
  text: string;
  /** The component's label, or the parent's title when components exist; else null. */
  label: string | null;
  /** Which part the step belongs to: a component's position, or the parent. */
  owner: 'parent' | number;
  /** The owner's own ingredients, so a step never claims another section's. */
  ingredients: Ingredient[];
}

@Component({
  selector: 'app-cook-mode',
  imports: [RouterLink, MatIconModule, MatCheckboxModule, MatMenuModule],
  templateUrl: './cook-mode.component.html',
  styleUrl: './cook-mode.component.scss',
})
export class CookModeComponent {
  readonly slug = input.required<string>();

  private readonly recipes = inject(RecipeStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly prefs = inject(PrefsStore);
  private readonly device = inject(DeviceStore);

  /** Finished on a device that can save asks whether to count the cook. */
  protected readonly recipesCanSave = this.recipes.canSave;
  protected readonly confirmingCooked = signal(false);
  protected readonly cookedSaving = signal(false);
  protected readonly cookedError = signal('');
  private readonly exitLink = viewChild<ElementRef<HTMLElement>>('exitLink');

  protected readonly recipe = computed(() => this.recipes.bySlug(this.slug()));

  /** 'loading' until the collection arrives; "not found" is only true after that. */
  protected readonly status = this.recipes.status;

  /** Try again after a failed first load. */
  protected retry(): void {
    void this.recipes.load();
  }

  /** The ingredients panel's open state, remembered between visits. */
  protected readonly ingredientsOpen = this.prefs.cookIngredientsOpen;

  protected readonly units = this.prefs.units;

  protected setUnits(system: UnitSystem): void {
    this.prefs.setUnits(system);
  }

  protected toggleIngredients(): void {
    this.prefs.toggleCookIngredients();
  }

  protected readonly stepIndex = signal(0);
  private readonly checked = signal<ReadonlySet<number>>(new Set());
  protected readonly timers = signal<readonly RunningTimer[]>([]);

  /** Embedded recipes in order; one that no longer resolves is already left out. */
  private readonly parts = computed(() => {
    const recipe = this.recipe();
    return recipe ? this.recipes.componentsOf(recipe.slug) : [];
  });

  /**
   * The one step sequence cook mode runs: each component's steps, labelled with
   * the component, then the parent's own. The counter, progress bar, timers and
   * jump list all index into this list.
   */
  protected readonly flatSteps = computed<FlatStep[]>(() => {
    const recipe = this.recipe();
    if (!recipe) return [];
    const parts = this.parts();
    return [
      ...parts.flatMap((p, i) =>
        p.recipe.steps.map((text): FlatStep => ({
          text,
          label: p.label,
          owner: i,
          ingredients: p.recipe.ingredients,
        })),
      ),
      ...recipe.steps.map((text): FlatStep => ({
        text,
        label: parts.length ? recipe.title : null,
        owner: 'parent',
        ingredients: recipe.ingredients,
      })),
    ];
  });

  /** The jump list's headers: the index of each step that opens a new owner's run. */
  protected readonly jumpHeaders = computed(() => {
    const steps = this.flatSteps();
    return new Set(
      steps.flatMap((s, i) => (s.label && (i === 0 || steps[i - 1].owner !== s.owner) ? [i] : [])),
    );
  });

  protected readonly steps = computed(() => this.flatSteps().map((s) => s.text));

  /** The current step's component label, if it belongs to one. */
  protected readonly stepLabel = computed(() => {
    const step = this.flatSteps()[this.stepIndex()];
    return step && step.owner !== 'parent' ? step.label : null;
  });
  protected readonly stepCount = computed(() => this.steps().length);

  protected readonly currentStep = computed(() => this.steps()[this.stepIndex()] ?? '');

  /** What the current step uses: "1 large onion"-style amounts, unit-converted, not scaled. */
  protected readonly stepChips = computed<string[]>(() => {
    const step = this.flatSteps()[this.stepIndex()];
    if (!step) return [];
    const units = this.units();
    return ingredientsInStep(step.text, step.ingredients).map((i) => {
      const head = stripDescriptors(ingredientHead(i.name));
      const amount = amountText(i.qty, i.unit, 1, units);
      return amount ? `${amount} ${head}` : head;
    });
  });

  protected readonly isLastStep = computed(
    () => this.stepIndex() >= this.stepCount() - 1,
  );

  protected readonly progress = computed(() => {
    const total = this.stepCount();
    if (total === 0) return 0;
    return Math.round(((this.stepIndex() + 1) / total) * 100);
  });

  /**
   * §6.3 — the sidebar shares the detail page's amounts. The parent's list
   * comes first, then each component's under its label; rows are numbered on
   * across all of them so one check set covers the lot.
   */
  protected readonly ingredientSections = computed(() => {
    const recipe = this.recipe();
    if (!recipe) return [];
    const checked = this.checked();
    const units = this.units();
    let offset = 0;
    const section = (label: string | null, list: Recipe['ingredients']) => {
      const items = list.map((ingredient, i) => ({
        index: offset + i,
        name: ingredient.name,
        amount: amountText(ingredient.qty, ingredient.unit, 1, units),
        checked: checked.has(offset + i),
      }));
      offset += list.length;
      return { label, items };
    };
    return [
      section(null, recipe.ingredients),
      ...this.parts().map((p) => section(p.label, p.recipe.ingredients)),
    ];
  });

  /**
   * A duration mentioned in the current step, in seconds, if there is one —
   * this is what turns into the "Start N min timer" button (§6.3, §5.4).
   */
  protected readonly stepDuration = computed(() => parseDuration(this.currentStep()));

  /** The current step's timer, running or finished but not yet dismissed. */
  protected readonly stepTimer = computed(
    () => this.timers().find((t) => t.stepIndex === this.stepIndex()) ?? null,
  );

  /**
   * Every timer, most urgent first: finished ones (earliest-finished first),
   * then running ones by least time remaining.
   */
  protected readonly urgentTimers = computed(() =>
    [...this.timers()].sort((a, b) => {
      const aDone = a.remaining <= 0;
      const bDone = b.remaining <= 0;
      if (aDone !== bDone) return aDone ? -1 : 1;
      if (aDone) return (a.finishedAt ?? 0) - (b.finishedAt ?? 0);
      return a.remaining - b.remaining || a.id - b.id;
    }),
  );

  /** The header chip shows this one; the rest sit behind it in the menu. */
  protected readonly chipTimer = computed(() => this.urgentTimers()[0] ?? null);

  /** The chip's accessible name: the most urgent timer, and how many there are. */
  protected readonly chipLabel = computed(() => {
    const chip = this.chipTimer();
    if (!chip) return '';
    const step = `Step ${chip.stepIndex + 1} timer`;
    const state = chip.remaining <= 0 ? 'done' : `${formatCountdown(chip.remaining)} left`;
    return `${step}, ${state}, ${this.timers().length} timers`;
  });

  /** The button's label rounds to whole minutes; the timer keeps the seconds. */
  protected readonly stepDurationLabel = computed(() => {
    const seconds = this.stepDuration();
    if (seconds === null) return '';
    return seconds >= 3600
      ? `${trim(seconds / 3600)} hr`
      : `${trim(seconds / 60)} min`;
  });

  /** Announced through a polite live region on every step change (§7). */
  protected readonly announcement = computed(() =>
    this.stepCount() === 0
      ? ''
      : `Step ${this.stepIndex() + 1} of ${this.stepCount()}. ${this.currentStep()}`,
  );

  private readonly wakeLock = new ScreenWakeLock(navigator, inject(DOCUMENT));
  private nextTimerId = 1;
  private nextFinishOrder = 1;

  constructor() {
    void this.wakeLock.acquire();

    // A reused instance (the route param changing) must not carry one recipe's
    // timers, position, ticks or "Mark as cooked?" panel onto another recipe.
    effect(() => {
      this.slug();
      untracked(() => {
        this.timers.set([]);
        this.stepIndex.set(0);
        this.checked.set(new Set());
        this.confirmingCooked.set(false);
        this.cookedError.set('');
        this.cookedSaving.set(false);
      });
    });

    // One interval drives every running timer, rather than one each.
    const tick = setInterval(() => this.tickTimers(), 1000);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      this.wakeLock.release();
    });
  }

  protected next(): void {
    if (this.isLastStep()) {
      // The last step's button reads "Finished": ask first when a cook can be saved.
      if (this.recipes.canSave()) this.confirmingCooked.set(true);
      else void this.router.navigate(['/recipes', this.slug()]);
      return;
    }
    this.stepIndex.update((i) => i + 1);
  }

  /**
   * Counts the cook, then returns to the recipe. A failure stays on the panel
   * with the reason, and "Leave anyway" takes over from the retry.
   */
  protected async confirmCooked(): Promise<void> {
    if (this.cookedSaving()) return;
    this.cookedSaving.set(true);
    this.cookedError.set('');
    try {
      await this.recipes.markCooked(this.slug());
    } catch (err) {
      this.cookedError.set(describeDeviceError(err, this.device.lockoutMinutes()));
      this.cookedSaving.set(false);
      return;
    }
    // Saving stays true through the navigation, so a second tap cannot count twice.
    void this.router.navigate(['/recipes', this.slug()]);
  }

  protected skipCooked(): void {
    void this.router.navigate(['/recipes', this.slug()]);
  }

  protected back(): void {
    this.stepIndex.update((i) => Math.max(0, i - 1));
  }

  protected jumpTo(index: number): void {
    this.stepIndex.set(index);
  }

  protected toggleCheck(index: number): void {
    const next = new Set(this.checked());
    if (!next.delete(index)) next.add(index);
    this.checked.set(next);
  }

  /**
   * Multiple concurrent timers are allowed (§6.3), at most one per step: a step
   * that already has one, running or finished but not dismissed, ignores this.
   */
  protected startTimer(seconds: number, label: string): void {
    const stepIndex = this.stepIndex();
    if (this.timers().some((t) => t.stepIndex === stepIndex)) return;
    this.timers.update((list) => [
      ...list,
      { id: this.nextTimerId++, stepIndex, label, remaining: seconds, total: seconds },
    ]);
  }

  protected dismissTimer(id: number): void {
    this.timers.update((list) => list.filter((t) => t.id !== id));
  }

  /**
   * Dismiss from the header menu. The chip is the menu's trigger and goes with
   * the last timer, which would drop focus to the body, so it moves to the exit
   * link once the view has settled.
   */
  protected dismissFromMenu(id: number): void {
    this.dismissTimer(id);
    if (this.timers().length > 0) return;
    afterNextRender(() => this.exitLink()?.nativeElement.focus(), { injector: this.injector });
  }

  protected readonly clock = formatCountdown;

  private tickTimers(): void {
    const current = this.timers();
    if (current.length === 0) return;

    const finished: RunningTimer[] = [];
    const next = current.map((t) => {
      if (t.remaining <= 0) return t;
      const remaining = t.remaining - 1;
      if (remaining > 0) return { ...t, remaining };
      const done = { ...t, remaining, finishedAt: this.nextFinishOrder++ };
      finished.push(done);
      return done;
    });

    this.timers.set(next);
    for (const timer of finished) this.alarm(timer);
  }

  /** A sound plus a notification where permission has already been granted. */
  private alarm(timer: RunningTimer): void {
    beep();
    try {
      if ('Notification' in globalThis && Notification.permission === 'granted') {
        new Notification('Timer done', { body: `${timer.label} is up.` });
      }
    } catch {
      // Notification construction can throw on some platforms; the beep and
      // the on-screen state are enough on their own.
    }
  }

}

/** Drops a trailing ".0" so "20 min" does not read as "20.0 min". */
function trim(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** A short tone via WebAudio, so no audio asset has to ship. */
function beep(): void {
  try {
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => void ctx.close().catch(() => undefined);
  } catch {
    // Autoplay policy or no audio device. Not worth failing the timer over.
  }
}
