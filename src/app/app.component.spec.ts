import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule, provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      // The header binds ngModel, renders mat-icons and uses routerLink.
      imports: [RouterModule, FormsModule, MatIconModule],
      declarations: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'recipes'`, () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    expect(app.title).toEqual('recipes');
  });

  it('renders the brand, search field and add-recipe action', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const shell = fixture.nativeElement as HTMLElement;

    expect(shell.querySelector('header .brand h1')?.textContent).toContain("Sam's Recipes");
    expect(shell.querySelector('header .search input')).toBeTruthy();
    expect(shell.querySelector('header button')?.textContent).toContain('Add Recipe');
    expect(shell.querySelector('router-outlet')).toBeTruthy();
  });

  it('navigates to the search page with the entered term', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate');
    const app = fixture.componentInstance;

    app.searchTerm = 'ramen';
    app.searchRecipes();

    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { q: 'ramen' } });
  });

  it('applies one of the random colour themes to the body on init', () => {
    const themes = [
      'red-theme', 'blue-theme', 'green-theme', 'sea-green-theme', 'yellow-theme',
      'orange-theme', 'purple-theme', 'pink-theme', 'brown-theme',
    ];
    themes.forEach(t => document.body.classList.remove(t));

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(themes.some(t => document.body.classList.contains(t))).toBe(true);
  });
});
