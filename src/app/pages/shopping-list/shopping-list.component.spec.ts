import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ListStore } from '../../core/stores/list.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import { provideFakeRecipes } from '../../core/testing/fake-repositories';
import { ShoppingListComponent } from './shopping-list.component';

describe('ShoppingListComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListComponent],
      providers: [provideFakeRecipes(), provideRouter([])],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('shows the list, not the empty state, when it holds only manual items', () => {
    TestBed.inject(ListStore).addExtra('Paper towels');
    const fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.empty-line')).toBeNull();
    expect(el.textContent).toContain('Paper towels');
    expect(el.querySelector('button[aria-label="Remove Paper towels"]')).not.toBeNull();
  });

  it('adds an item on Enter and clears the field', () => {
    const fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Add an item"], #add-item')!;
    input.value = 'Paper towels';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(TestBed.inject(ListStore).extras().map((e) => e.name)).toEqual(['Paper towels']);
    expect(input.value).toBe('');
    expect(el.textContent).toContain('Paper towels');
  });
});
