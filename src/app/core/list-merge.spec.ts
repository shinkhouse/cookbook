import { ListSource, mergeSources, sumAmounts } from './list-merge';
import { Ingredient } from './model/recipes.model';

function source(owner: string, index: number, ingredient: Ingredient, recipeTitle = owner): ListSource {
  return { owner, index, ingredient, recipeTitle };
}

describe('sumAmounts', () => {
  it('sums the same unit without converting', () =>
    expect(sumAmounts([{ qty: 1, unit: 'cup' }, { qty: 1, unit: 'cup' }])).toBe('2 cup'));
  it('converts mixed US volume into one unit', () =>
    expect(sumAmounts([{ qty: 2, unit: 'tbsp' }, { qty: 0.25, unit: 'cup' }])).toBe('⅜ cup'));
  it('keeps incompatible amounts side by side', () =>
    expect(sumAmounts([{ qty: 2, unit: '' }, { qty: 1, unit: 'cup' }])).toBe('2 + 1 cup'));
  it('sums an exact non-measurable unit', () =>
    expect(sumAmounts([{ qty: 1, unit: 'can' }, { qty: 2, unit: 'can' }])).toBe('3 can'));
  it('ignores to-taste entries, and is blank when all are', () => {
    expect(sumAmounts([{ qty: null, unit: '' }, { qty: 1, unit: 'tsp' }])).toBe('1 tsp');
    expect(sumAmounts([{ qty: null, unit: '' }])).toBe('');
  });
  it('converts mixed metric and US into US', () =>
    expect(sumAmounts([{ qty: 250, unit: 'g' }, { qty: 1, unit: 'lb' }])).toBe('1½ lb'));
  it('converts mixed metric into metric', () =>
    expect(sumAmounts([{ qty: 500, unit: 'g' }, { qty: 1, unit: 'kg' }])).toBe('1.5 kg'));
});

describe('mergeSources', () => {
  it('merges onion and onions, diced into one row with both sources', () => {
    const a = source('a', 0, { qty: 1, unit: '', name: 'onion', aisle: 'produce' });
    const b = source('b', 3, { qty: 2, unit: '', name: 'Onions, diced', aisle: 'pantry' });
    const lines = mergeSources([a, b]);
    expect(lines.length).toBe(1);
    expect(lines[0].key).toBe('name:onion');
    expect(lines[0].name).toBe('onion');
    expect(lines[0].amount).toBe('3');
    expect(lines[0].aisle).toBe('produce');
    expect(lines[0].sources).toEqual([a, b]);
  });

  it('keeps a lone source\'s original name, in first-seen order', () => {
    const lines = mergeSources([
      source('a', 0, { qty: 1, unit: 'cup', name: 'Rice, rinsed', aisle: 'pantry' }),
      source('a', 1, { qty: null, unit: '', name: 'Salt', aisle: 'pantry' }),
    ]);
    expect(lines.map((l) => l.name)).toEqual(['Rice, rinsed', 'Salt']);
    expect(lines.map((l) => l.amount)).toEqual(['1 cup', '']);
  });

  it('names a merged row from the first source without its descriptors', () => {
    const [line] = mergeSources([
      source('a', 0, { qty: 2, unit: '', name: 'Large Tomatoes (ripe)', aisle: 'produce' }),
      source('b', 0, { qty: 1, unit: '', name: 'tomato', aisle: 'produce' }),
    ]);
    expect(line.name).toBe('Tomatoes');
  });

  it('keeps the first source\'s casing on a merged row', () => {
    const [line] = mergeSources([
      source('a', 0, { qty: 1, unit: '', name: 'Fresh Basil Leaves, torn', aisle: 'produce' }),
      source('b', 0, { qty: 1, unit: '', name: 'basil leaves', aisle: 'produce' }),
    ]);
    expect(line.name).toBe('Basil Leaves');
  });

  it('sums units that differ only by case into the canonical unit', () => {
    const [line] = mergeSources([
      source('a', 0, { qty: 1, unit: 'Cup', name: 'rice', aisle: 'pantry' }),
      source('b', 0, { qty: 1, unit: 'cup', name: 'rice', aisle: 'pantry' }),
    ]);
    expect(line.amount).toBe('2 cup');
  });

  it('falls back to the source position when the name has no key', () => {
    const lines = mergeSources([
      source('a', 4, { qty: 1, unit: '', name: '', aisle: 'pantry' }),
      source('b', 2, { qty: 1, unit: '', name: '', aisle: 'pantry' }),
    ]);
    expect(lines.map((l) => l.key)).toEqual(['a:4', 'b:2']);
  });
});
