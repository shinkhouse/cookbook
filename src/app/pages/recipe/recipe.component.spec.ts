import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { RecipeComponent } from './recipe.component';

describe('RecipeComponent', () => {
  let component: RecipeComponent;
  let fixture: ComponentFixture<RecipeComponent>;

  // ngOnInit reads the :id route param, so the fixture needs a snapshot.
  const withRouteId = async (id: string) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [RecipeComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecipeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('should create', async () => {
    await withRouteId('grandmas-spaghetti');
    expect(component).toBeTruthy();
  });

  it('reads the recipe slug off the route', async () => {
    await withRouteId('grandmas-spaghetti');
    expect(component.recipeId).toBe('grandmas-spaghetti');
  });

  it('resolves a known slug to a recipe', async () => {
    await withRouteId('grandmas-spaghetti');
    expect(component.recipe).toBeTruthy();
    expect(component.recipe?.slug).toBe('grandmas-spaghetti');
  });

  it('leaves recipe undefined for a slug that does not exist', async () => {
    await withRouteId('no-such-recipe');
    expect(component.recipe).toBeUndefined();
  });
});
