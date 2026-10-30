import { Provider } from '@angular/core';
import { CookbookRepository } from '../cookbook-repository';
import { Cookbook, CookbookSeed } from '../model/cookbooks.model';

/**
 * In-memory stand-in for the API, with the same contract: null/false only for a
 * missing id, a rejection for everything else. `failNext` is how a test makes
 * "everything else" happen.
 */
export class FakeCookbookRepository extends CookbookRepository {
  private items: Cookbook[];
  private pending: { error: unknown } | null = null;

  override writable = true;

  constructor(seed: Cookbook[] = CookbookSeed) {
    super();
    this.items = seed.map((c) => ({ ...c }));
  }

  /** The next call of any method rejects with this, then behaviour returns to normal. */
  failNext(error: unknown): void {
    this.pending = { error };
  }

  override async list(): Promise<Cookbook[]> {
    this.maybeFail();
    return this.items.map((c) => ({ ...c }));
  }

  override async create(cookbook: Cookbook): Promise<Cookbook> {
    this.maybeFail();
    if (this.items.some((c) => c.id === cookbook.id)) throw new Error('conflict');
    this.items.push({ ...cookbook });
    return { ...cookbook };
  }

  override async update(cookbook: Cookbook): Promise<Cookbook | null> {
    this.maybeFail();
    const i = this.items.findIndex((c) => c.id === cookbook.id);
    if (i < 0) return null;
    this.items[i] = { ...cookbook };
    return { ...cookbook };
  }

  override async remove(id: string): Promise<boolean> {
    this.maybeFail();
    const before = this.items.length;
    this.items = this.items.filter((c) => c.id !== id);
    return this.items.length < before;
  }

  private maybeFail(): void {
    if (!this.pending) return;
    const { error } = this.pending;
    this.pending = null;
    throw error;
  }
}

/**
 * Tests that need `failNext` before the store loads construct the fake first
 * and pass it in.
 */
export function provideFakeCookbooks(fake?: FakeCookbookRepository): Provider[] {
  return [{ provide: CookbookRepository, useValue: fake ?? new FakeCookbookRepository() }];
}
