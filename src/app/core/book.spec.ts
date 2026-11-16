import { bookSections, parseBookOrder } from './book';
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
    expect(parseBookOrder('cookbook')).toBe('cookbook');
    expect(parseBookOrder('cuisine')).toBe('cuisine');
    expect(parseBookOrder('title')).toBe('title');
    expect(parseBookOrder('nonsense')).toBe('title');
    expect(parseBookOrder(undefined)).toBe('title');
  });
});

describe('bookSections', () => {
  it('lists A–Z in one unheaded section, leaving out parts printed inside their parent', () => {
    const part = { ...recipe('rice', 'Rice'), component: true };
    const sections = bookSections([recipe('b', 'banana bread'), part, recipe('a', 'Apple Pie')], 'title', []);
    expect(titles(sections)).toEqual([[null, ['Apple Pie', 'banana bread']]]);
  });

  it('groups by cookbook in shelf order, each recipe once, unfiled ones last', () => {
    const books = [
      { id: 'sam', name: "Sam's Cookbook" },
      { id: 'empty', name: 'Empty' },
      { id: 'bob', name: "Bob's Cookbook" },
    ];
    const sections = bookSections(
      [
        recipe('c', 'Chili', [], ['bob']),
        recipe('s', 'Stew', [], ['bob', 'sam']),
        recipe('a', 'Apple Pie', [], ['sam']),
        recipe('l', 'Loose Notes'),
      ],
      'cookbook',
      books,
    );
    expect(titles(sections)).toEqual([
      ["Sam's Cookbook", ['Apple Pie', 'Stew']],
      ["Bob's Cookbook", ['Chili']],
      ['Other', ['Loose Notes']],
    ]);
  });

  it('groups by meal in the filter order, a recipe under its first meal', () => {
    const sections = bookSections(
      [
        recipe('t', 'Tomato Tart', ['dinner', 'breakfast']),
        recipe('p', 'Pancakes', ['breakfast']),
        recipe('s', 'Salsa', ['sauces']),
      ],
      'meal',
      [],
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
      [],
    );
    expect(titles(sections)).toEqual([
      ['Mexican', ['Tacos']],
      ['Asian', ['Bulgogi']],
    ]);
  });
});
