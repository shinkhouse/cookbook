import { Injectable, computed, inject, signal } from '@angular/core';
import { AISLE_LABELS, AISLE_ORDER, Aisle } from '../aisle';
import { Ingredient } from '../model/recipes.model';
import { Storage } from '../storage';
import { RecipeStore } from './recipe.store';

const CART_KEY = 'cookbook.cart';
const BOUGHT_KEY = 'cookbook.bought';

/** One row on the shopping list: an ingredient plus where it came from. */
export interface ListRow {
  key: string;
  /** Position within its recipe's ingredient list — half of the bought key. */
  index: number;
  ingredient: Ingredient;
  recipeSlug: string;
  recipeTitle: string;
  bought: boolean;
}

export interface AisleGroup {
  aisle: Aisle;
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

  readonly cart = computed(() => this._cart());
  readonly recipeCount = computed(() => this._cart().length);

  /**
   * Every item from every recipe on the list, grouped by aisle in the display
   * order from §4.
   *
   * Duplicates across recipes stay as separate rows — merging is out of scope
   * per §1 and is why the bought key is scoped per recipe.
   */
  readonly groups = computed<AisleGroup[]>(() => {
    const bought = this._bought();
    const byAisle = new Map<Aisle, ListRow[]>();

    for (const slug of this._cart()) {
      const recipe = this.recipes.bySlug(slug);
      if (!recipe) continue; // a stored slug that no longer exists
      recipe.ingredients.forEach((ingredient, index) => {
        const key = boughtKey(slug, index);
        const row: ListRow = {
          key,
          index,
          ingredient,
          recipeSlug: slug,
          recipeTitle: recipe.title,
          bought: bought.has(key),
        };
        const rows = byAisle.get(ingredient.aisle);
        if (rows) rows.push(row);
        else byAisle.set(ingredient.aisle, [row]);
      });
    }

    return AISLE_ORDER.filter((aisle) => byAisle.has(aisle)).map((aisle) => ({
      aisle,
      label: AISLE_LABELS[aisle],
      rows: byAisle.get(aisle)!,
    }));
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
    this.setCart(this._cart().filter((s) => s !== slug));
    const prefix = `${slug}:`;
    const next = new Set([...this._bought()].filter((k) => !k.startsWith(prefix)));
    this.setBought(next);
  }

  toggleRecipe(slug: string): void {
    if (this.has(slug)) this.removeRecipe(slug);
    else this.addRecipe(slug);
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

  uncheckAll(): void {
    this.setBought(new Set());
  }

  clear(): void {
    this.setCart([]);
    this.setBought(new Set());
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
 * Scoped per recipe, not per ingredient name: two recipes both needing garlic
 * are two separate rows, so checking one must not check the other (§2.2).
 */
export function boughtKey(slug: string, index: number): string {
  return `${slug}:${index}`;
}
