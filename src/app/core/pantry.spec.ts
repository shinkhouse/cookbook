import { Ingredient } from './model/recipes.model';
import { PANTRY_STAPLES, compareCoverage, coverageOf, parseHave } from './pantry';

const ing = (name: string): Ingredient => ({ qty: 1, unit: '', name, aisle: 'pantry' });

describe('parseHave', () => {
  it('splits "Chicken, rice and broccoli" into chicken, rice, broccoli', () =>
    expect(parseHave('Chicken, rice and broccoli')).toEqual(['chicken', 'rice', 'broccoli']));

  it('splits on semicolons and new lines, normalises, drops empties and dedupes', () =>
    expect(parseHave('Onions;\n onion ,, ; Large Tomatoes')).toEqual(['onion', 'tomato']));

  it('is empty for blank text', () => expect(parseHave('  ,  ')).toEqual([]));
});

describe('coverageOf', () => {
  it('ignores staples in the total', () => {
    const c = coverageOf(
      [ing('salt'), ing('Kosher salt'), ing('olive oil'), ing('chicken'), ing('rice'), ing('carrots')],
      ['chicken'],
    );
    expect(c).toEqual({ covered: 1, total: 3, ratio: 1 / 3 });
  });

  it('counts "chicken" as covering "chicken breasts"', () =>
    expect(coverageOf([ing('Chicken breasts, cubed')], ['chicken'])).toEqual({
      covered: 1,
      total: 1,
      ratio: 1,
    }));

  it('counts a broader term the ingredient sits inside, but not a part word', () => {
    expect(coverageOf([ing('rice')], ['brown rice'])?.covered).toBe(1);
    expect(coverageOf([ing('cream')], ['creamer'])?.covered).toBe(0);
  });

  it('returns null for a recipe of only staples', () =>
    expect(coverageOf([ing('salt'), ing('water'), ing('all-purpose flour')], ['chicken'])).toBeNull());

  it('knows its staples', () => {
    expect(PANTRY_STAPLES.has('baking powder')).toBe(true);
    expect(PANTRY_STAPLES.has('chicken')).toBe(false);
  });
});

describe('compareCoverage', () => {
  const r = (title: string, covered: number, total: number) => ({
    title,
    coverage: { covered, total, ratio: covered / total },
  });

  it('orders by share, then covered, then fewest ingredients, then title', () => {
    const sorted = [
      r('b', 1, 2),
      r('a', 1, 2),
      r('half-big', 2, 4),
      r('full', 1, 1),
      r('third', 1, 3),
      r('full-big', 3, 3),
    ].sort(compareCoverage);
    expect(sorted.map((x) => x.title)).toEqual(['full-big', 'full', 'half-big', 'a', 'b', 'third']);
  });
});
