import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Cookbook } from '../../core/model/cookbooks.model';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import { describeWriteError } from '../../core/write-error';

/**
 * Renames and deletes cookbooks. Deleting one keeps its recipes: they stay in
 * the app, and any filed only there show under "Not in a cookbook".
 */
@Component({
  selector: 'app-manage-cookbooks',
  imports: [RouterLink, FormsModule, MatIconModule, DecimalPipe],
  templateUrl: './manage-cookbooks.component.html',
  styleUrl: './manage-cookbooks.component.scss',
})
export class ManageCookbooksComponent {
  protected readonly cookbooks = inject(CookbookStore);
  private readonly recipes = inject(RecipeStore);

  /** Names as typed, by id; a cookbook with no entry shows its saved name. */
  protected readonly drafts = signal<Readonly<Record<string, string>>>({});
  /** The cookbook whose delete is waiting to be confirmed. */
  protected readonly confirming = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** Counts wait for the recipes, which load after the cookbooks; until then they would read 0. */
  protected readonly counted = computed(() => this.recipes.status() === 'ready');

  protected nameOf(cookbook: Cookbook): string {
    return this.drafts()[cookbook.id] ?? cookbook.name;
  }

  protected edit(id: string, name: string): void {
    this.drafts.update((drafts) => ({ ...drafts, [id]: name }));
  }

  /** True when another cookbook already has the typed name, ignoring case. */
  protected clashes(cookbook: Cookbook): boolean {
    const name = this.nameOf(cookbook).trim().toLowerCase();
    return this.cookbooks.cookbooks().some((c) => c.id !== cookbook.id && c.name.toLowerCase() === name);
  }

  protected canRename(cookbook: Cookbook): boolean {
    const name = this.nameOf(cookbook).trim();
    return !this.busy() && name !== '' && name !== cookbook.name && !this.clashes(cookbook);
  }

  protected count(id: string): number {
    return this.cookbooks.countIn(id);
  }

  protected async rename(cookbook: Cookbook): Promise<void> {
    if (!this.canRename(cookbook)) return;
    await this.run(async () => {
      await this.cookbooks.rename(cookbook.id, this.nameOf(cookbook).trim());
      this.drafts.update(({ [cookbook.id]: _, ...rest }) => rest);
    });
  }

  protected async remove(cookbook: Cookbook): Promise<void> {
    await this.run(async () => {
      await this.cookbooks.remove(cookbook.id);
      this.confirming.set(null);
      // The library should not stay on a shelf that no longer exists.
      const shelf = this.recipes.selectedCookbooks();
      if (shelf.has(cookbook.id)) this.recipes.selectedCookbooks.set(new Set());
    });
  }

  private async run(write: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await write();
    } catch (err) {
      this.error.set(describeWriteError(err));
    } finally {
      this.busy.set(false);
    }
  }
}
