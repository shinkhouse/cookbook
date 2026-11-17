import { bookRecipes, bookSections, parseBookOrder } from './book';
import { Recipes } from './mock/recipes.mock';
import { Recipe } from './model/recipes.model';

const recipe = (slug: string, title: string, tags: string[] = [], cookbooks: string[] = []): Recipe => ({
  ...Recipes[0],
  slug,
  title,
  tags,
  cookbooks,
  component: false,
});

const titles = (sections: ReturnType<typeof bookSections>) =>
  sections.map((s) => [s.label, s.recipes.map((r) => r.title)]);

describe('parseBookOrder', () => {
  it('reads a known order and falls back to A–Z', () => {
    expect(parseBookOrder('meal')).toBe('meal');
    // A book is one cookbook, so grouping by cookbook is gone.
    expect(parseBookOrder('cookbook')).toBe('title');
    expect(parseBookOrder('cuisine')).toBe('cuisine');
    expect(parseBookOrder('title')).toBe('title');
    expect(parseBookOrder('nonsense')).toBe('title');
    expect(parseBookOrder(undefined)).toBe('title');
  });
});

describe('bookRecipes', () => {
  it("takes one cookbook's recipes, less the parts printed inside their parent", () => {
    const part = { ...recipe('rice', 'Rice', [], ['sam']), component: true };
    const picked = bookRecipes([recipe('a', 'Apple Pie', [], ['sam', 'bob']), recipe('c', 'Chili', [], ['bob']), part], 'sam');
    expect(picked.map((r) => r.slug)).toEqual(['a']);
  });
});

describe('bookSections', () => {
  it('lists A–Z in one unheaded section, leaving out parts printed inside their parent', () => {
    const part = { ...recipe('rice', 'Rice'), component: true };
    const sections = bookSections([recipe('b', 'banana bread'), part, recipe('a', 'Apple Pie')], 'title');
    expect(titles(sections)).toEqual([[null, ['Apple Pie', 'banana bread']]]);
  });

  it('groups by meal in the filter order, a recipe under its first meal', () => {
    const sections = bookSections(
      [
        recipe('t', 'Tomato Tart', ['dinner', 'breakfast']),
        recipe('p', 'Pancakes', ['breakfast']),
        recipe('s', 'Salsa', ['sauces']),
      ],
      'meal',
    );
    expect(titles(sections)).toEqual([
      ['Breakfast', ['Pancakes', 'Tomato Tart']],
      ['Other', ['Salsa']],
    ]);
  });

  it('groups by cuisine the same way', () => {
    const sections = bookSections(
      [recipe('b', 'Bulgogi', ['korean', 'asian']), recipe('t', 'Tacos', ['mexican'])],
      'cuisine',
    );
    expect(titles(sections)).toEqual([
      ['Mexican', ['Tacos']],
      ['Asian', ['Bulgogi']],
    ]);
  });
});
