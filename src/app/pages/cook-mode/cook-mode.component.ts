import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { formatQty } from '../../core/scale';
import { RecipeStore } from '../../core/stores/recipe.store';
import { formatCountdown, parseDuration } from '../../core/timer';

interface RunningTimer {
  id: number;
  label: string;
  /** Seconds left. Counted down by the single shared interval. */
  remaining: number;
  total: number;
}

@Component({
  selector: 'app-cook-mode',
  imports: [RouterLink, MatIconModule, MatCheckboxModule],
  templateUrl: './cook-mode.component.html',
  styleUrl: './cook-mode.component.scss',
})
export class CookModeComponent {
  readonly slug = input.required<string>();

  private readonly recipes = inject(RecipeStore);
  private readonly router = inject(Router);

  protected readonly recipe = computed(() => this.recipes.bySlug(this.slug()));

  protected readonly stepIndex = signal(0);
  private readonly checked = signal<ReadonlySet<number>>(new Set());
  protected readonly timers = signal<readonly RunningTimer[]>([]);

  protected readonly steps = computed(() => this.recipe()?.steps ?? []);
  protected readonly stepCount = computed(() => this.steps().length);

  protected readonly currentStep = computed(() => this.steps()[this.stepIndex()] ?? '');

  protected readonly isLastStep = computed(
    () => this.stepIndex() >= this.stepCount() - 1,
  );

  protected readonly progress = computed(() => {
    const total = this.stepCount();
    if (total === 0) return 0;
    return Math.round(((this.stepIndex() + 1) / total) * 100);
  });

  /** §6.3 — the sidebar shares the detail page's amounts. */
  protected readonly ingredients = computed(() => {
    const recipe = this.recipe();
    if (!recipe) return [];
    const checked = this.checked();
    return recipe.ingredients.map((ingredient, index) => ({
      index,
      name: ingredient.name,
      amount:
        ingredient.qty === null
          ? ''
          : `${formatQty(ingredient.qty)}${ingredient.unit ? ' ' + ingredient.unit : ''}`,
      checked: checked.has(index),
    }));
  });

  /**
   * A duration mentioned in the current step, in seconds, if there is one —
   * this is what turns into the "Start N min timer" button (§6.3, §5.4).
   */
  protected readonly stepDuration = computed(() => parseDuration(this.currentStep()));

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

  private wakeLock: WakeLockSentinel | null = null;
  private nextTimerId = 1;

  constructor() {
    this.requestWakeLock();

    // One interval drives every running timer, rather than one each.
    const tick = setInterval(() => this.tickTimers(), 1000);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      this.releaseWakeLock();
    });
  }

  protected next(): void {
    if (this.isLastStep()) {
      // The last step's button reads "Done cooking" and returns to the recipe.
      this.router.navigate(['/recipes', this.slug()]);
      return;
    }
    this.stepIndex.update((i) => i + 1);
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

  /** Multiple concurrent timers are allowed (§6.3). */
  protected startTimer(seconds: number, label: string): void {
    this.timers.update((list) => [
      ...list,
      { id: this.nextTimerId++, label, remaining: seconds, total: seconds },
    ]);
  }

  protected dismissTimer(id: number): void {
    this.timers.update((list) => list.filter((t) => t.id !== id));
  }

  protected readonly clock = formatCountdown;

  private tickTimers(): void {
    const current = this.timers();
    if (current.length === 0) return;

    const finished: RunningTimer[] = [];
    const next = current.map((t) => {
      if (t.remaining <= 0) return t;
      const remaining = t.remaining - 1;
      if (remaining === 0) finished.push(t);
      return { ...t, remaining };
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

  private async requestWakeLock(): Promise<void> {
    // Feature-detected and silently skipped where unsupported (§6.3).
    try {
      const nav = navigator as Navigator & { wakeLock?: WakeLock };
      if (!nav.wakeLock) return;
      this.wakeLock = await nav.wakeLock.request('screen');
    } catch {
      // A rejected request is not worth surfacing — the screen just dims.
    }
  }

  private releaseWakeLock(): void {
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
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
