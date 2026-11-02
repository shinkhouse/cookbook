import { Injectable, computed, inject, signal } from '@angular/core';
import { AISLE_LABELS, AISLE_ORDER, Aisle } from '../aisle';
import { ListSource, mergeSources } from '../list-merge';
import { Storage } from '../storage';
import { RecipeStore } from './recipe.store';

const CART_KEY = 'cookbook.cart';
const BOUGHT_KEY = 'cookbook.bought';
const EXTRAS_KEY = 'cookbook.extras';
const MAX_EXTRA_NAME = 200;

export const OTHER_AISLE = 'other' as const;

/** A one-off item typed in by hand, like paper towels. Not tied to any recipe. */
export interface ExtraItem {
  id: string;
  name: string;
  bought: boolean;
}

/**
 * One row on the shopping list: an ingredient merged across every recipe that
 * needs it, plus where it came from.
 */
export interface ListRow {
  key: string;
  name: string;
  /** Summed across sources: "2 + 1 cup", or '' when every source is to taste. */
  amount: string;
  aisle: Aisle | 'other';
  /** Each recipe ingredient behind the row; their bought keys are the row's state. */
  sources: ListSource[];
  /** Distinct recipe titles, in list order. */
  sourceTitles: string[];
  /** True only when every source is bought. */
  bought: boolean;
  extraId?: string;
}

export interface AisleGroup {
  aisle: Aisle | typeof OTHER_AISLE;
  label: string;
  rows: ListRow[];
}

/**
 * The shopping list: which recipes are on it, and which of their items have
 * been bought. Both persisted, per spec §2.2.
 */
@Injectable({ providedIn: 'root' })
export class ListStore {
  private readonly storage = inject(Storage);
  private readonly recipes = inject(RecipeStore);

  private readonly _cart = signal<readonly string[]>(
    this.storage.read<string[]>(CART_KEY, []),
  );
  private readonly _bought = signal<ReadonlySet<string>>(
    new Set(this.storage.read<string[]>(BOUGHT_KEY, [])),
  );

  private readonly _extras = signal<readonly ExtraItem[]>(
    validExtras(this.storage.read<unknown>(EXTRAS_KEY, [])),
  );

  readonly extras = computed(() => this._extras());
  readonly cart = computed(() => this._cart());
  /**
   * Recipes on the list that still resolve. A cart entry for an archived recipe
   * is kept (un-archiving brings it back) but does not count, so it cannot
   * inflate the nav badge or hide the empty state.
   */
  readonly recipeCount = computed(
    () => this._cart().filter((slug) => this.recipes.bySlug(slug)).length,
  );

  /**
   * Every item from every recipe on the list, grouped by aisle in the display
   * order from §4.
   *
   * Duplicates across recipes merge into one row, because you buy onions once
   * however many recipes want them. The bought marks stay per source (a merged
   * row is bought when all its sources are), so a recipe joining the list
   * unchecks the row — it now needs more — and leaving restores it.
   */
  readonly groups = computed<AisleGroup[]>(() => {
    const bought = this._bought();
    const sources: ListSource[] = [];

    for (const slug of this._cart()) {
      const recipe = this.recipes.bySlug(slug);
      if (!recipe) continue; // a stored slug that no longer exists
      // The parent's own ingredients, then each component's. A component row is
      // keyed `parent>component`, so a component shared by two parents is two
      // sources with separate marks under each ('>' cannot occur in a slug).
      const owners = [
        { owner: slug, ingredients: recipe.ingredients },
        ...this.recipes
          .componentsOf(slug)
          .map((c) => ({ owner: `${slug}>${c.recipe.slug}`, ingredients: c.recipe.ingredients })),
      ];
      for (const { owner, ingredients } of owners) {
        ingredients.forEach((ingredient, index) =>
          sources.push({ owner, index, ingredient, recipeTitle: recipe.title }),
        );
      }
    }

    const byAisle = new Map<Aisle, ListRow[]>();
    for (const line of mergeSources(sources)) {
      const row: ListRow = {
        ...line,
        sourceTitles: [...new Set(line.sources.map((s) => s.recipeTitle))],
        bought: line.sources.every((s) => bought.has(boughtKey(s.owner, s.index))),
      };
      const rows = byAisle.get(line.aisle);
      if (rows) rows.push(row);
      else byAisle.set(line.aisle, [row]);
    }

    const groups: AisleGroup[] = AISLE_ORDER.filter((aisle) => byAisle.has(aisle)).map(
      (aisle) => ({
        aisle,
        label: AISLE_LABELS[aisle],
        rows: byAisle.get(aisle)!,
      }),
    );

    const extras = this._extras();
    if (extras.length > 0) {
      groups.push({
        aisle: OTHER_AISLE,
        label: 'Other',
        rows: extras.map((e) => ({
          key: 'extra:' + e.id,
          name: e.name,
          amount: '',
          aisle: OTHER_AISLE,
          sources: [],
          sourceTitles: [],
          bought: e.bought,
          extraId: e.id,
        })),
      });
    }
    return groups;
  });

  readonly totalItems = computed(() =>
    this.groups().reduce((n, g) => n + g.rows.length, 0),
  );

  readonly boughtCount = computed(() =>
    this.groups().reduce((n, g) => n + g.rows.filter((r) => r.bought).length, 0),
  );

  has(slug: string): boolean {
    return this._cart().includes(slug);
  }

  addRecipe(slug: string): void {
    if (this.has(slug)) return;
    this.setCart([...this._cart(), slug]);
  }

  /** Removing a recipe drops its bought marks too, per §6.5. */
  removeRecipe(slug: string): void {
    // The parent's own marks (`slug:`) and its components' (`slug>`), by prefix
    // so it works even when the parent has since been archived.
    const prefixes = [`${slug}:`, `${slug}>`];
    this.setCart(this._cart().filter((s) => s !== slug));
    const next = new Set(
      [...this._bought()].filter((k) => !prefixes.some((p) => k.startsWith(p))),
    );
    this.setBought(next);
  }

  toggleRecipe(slug: string): void {
    if (this.has(slug)) this.removeRecipe(slug);
    else this.addRecipe(slug);
  }

  /** A merged row checks as one item: every source's mark goes on or off together. */
  toggleRow(row: ListRow): void {
    if (row.extraId !== undefined) {
      this.setExtras(
        this._extras().map((e) => (e.id === row.extraId ? { ...e, bought: !e.bought } : e)),
      );
      return;
    }
    const next = new Set(this._bought());
    for (const s of row.sources) {
      const key = boughtKey(s.owner, s.index);
      if (row.bought) next.delete(key);
      else next.add(key);
    }
    this.setBought(next);
  }

  toggleBought(slug: string, index: number): void {
    const key = boughtKey(slug, index);
    const next = new Set(this._bought());
    if (!next.delete(key)) next.add(key);
    this.setBought(next);
  }

  isBought(slug: string, index: number): boolean {
    return this._bought().has(boughtKey(slug, index));
  }

  /** False when the name is blank or already on the list (ignoring case). */
  addExtra(name: string): boolean {
    const trimmed = name.trim().slice(0, MAX_EXTRA_NAME).trim();
    if (trimmed === '') return false;
    const lower = trimmed.toLowerCase();
    if (this._extras().some((e) => e.name.toLowerCase() === lower)) return false;
    this.setExtras([...this._extras(), { id: newId(), name: trimmed, bought: false }]);
    return true;
  }

  removeExtra(id: string): void {
    this.setExtras(this._extras().filter((e) => e.id !== id));
  }

  uncheckAll(): void {
    this.setBought(new Set());
    this.setExtras(this._extras().map((e) => ({ ...e, bought: false })));
  }

  clear(): void {
    this.setCart([]);
    this.setBought(new Set());
    this.setExtras([]);
  }

  private setExtras(extras: readonly ExtraItem[]): void {
    this._extras.set(extras);
    this.storage.write(EXTRAS_KEY, [...extras]);
  }

  private setCart(cart: readonly string[]): void {
    this._cart.set(cart);
    this.storage.write(CART_KEY, [...cart]);
  }

  private setBought(bought: ReadonlySet<string>): void {
    this._bought.set(bought);
    this.storage.write(BOUGHT_KEY, [...bought]);
  }
}

/**
 * Scoped per recipe, not per ingredient name: a merged garlic row is checked
 * by marking each recipe's garlic, so adding a third recipe that needs garlic
 * shows up unchecked rather than inheriting the earlier mark (§2.2).
 */
export function boughtKey(slug: string, index: number): string {
  return `${slug}:${index}`;
}

/** A phone on a plain-HTTP LAN address has no `crypto.randomUUID`. */
function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stored extras are untrusted: anything not shaped right becomes empty. */
function validExtras(raw: unknown): ExtraItem[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.every(
    (e) =>
      e !== null &&
      typeof e === 'object' &&
      typeof e.id === 'string' &&
      typeof e.name === 'string' &&
      typeof e.bought === 'boolean',
  );
  return ok ? (raw as ExtraItem[]) : [];
}
