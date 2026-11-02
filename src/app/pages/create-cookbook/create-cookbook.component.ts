import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { cookbookFacet } from '../../core/facets';
import { slugify } from '../../core/recipe-text';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import { describeWriteError } from '../../core/write-error';

/** A new cookbook: a name, an optional description, and the id the name makes. */
@Component({
  selector: 'app-create-cookbook',
  imports: [RouterLink, FormsModule, MatIconModule],
  templateUrl: './create-cookbook.component.html',
  styleUrl: './create-cookbook.component.scss',
})
export class CreateCookbookComponent {
  private readonly cookbooks = inject(CookbookStore);
  private readonly recipes = inject(RecipeStore);
  private readonly router = inject(Router);

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected readonly id = computed(() => slugify(this.name()));
  /** The store would suffix a clashing id; here it is refused so two names never read alike. */
  protected readonly taken = computed(() => this.id() !== '' && this.cookbooks.byId(this.id()) !== undefined);
  protected readonly canSave = computed(
    () => this.id() !== '' && !this.taken() && !this.saving() && this.cookbooks.status() === 'ready',
  );

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.error.set('');
    const description = this.description().trim();
    try {
      const id = await this.cookbooks.add({
        id: this.id(),
        name: this.name().trim(),
        ...(description ? { description } : {}),
      });
      this.showInLibrary(id);
      void this.router.navigate(['/']);
    } catch (err) {
      this.error.set(describeWriteError(err));
    } finally {
      this.saving.set(false);
    }
  }

  /** Leaves the library filtered to the new cookbook, when there are enough to have a facet. */
  private showInLibrary(id: string): void {
    const facet = cookbookFacet(this.cookbooks.cookbooks());
    if (!facet) return;
    this.recipes.clearTags();
    this.recipes.toggleOption(facet, id);
  }
}
