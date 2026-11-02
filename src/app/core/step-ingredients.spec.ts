import { Ingredient } from './model/recipes.model';
import { ingredientsInStep } from './step-ingredients';

const ing = (name: string, qty: number | null = 1, unit = ''): Ingredient => ({
  qty,
  unit,
  name,
  aisle: 'pantry',
});
const names = (list: Ingredient[]) => list.map((i) => i.name);

describe('ingredientsInStep', () => {
  it('finds "onions" for a "large onion" ingredient', () => {
    expect(names(ingredientsInStep('Fry the onions until soft.', [ing('large onion')]))).toEqual([
      'large onion',
    ]);
  });

  it('does not match "oil" against "olive oil"', () => {
    expect(ingredientsInStep('Heat the oil.', [ing('olive oil')])).toEqual([]);
  });

  it('does not match inside a word', () => {
    expect(names(ingredientsInStep('Add the scallions.', [ing('scallion')]))).toEqual(['scallion']);
    expect(ingredientsInStep('Slice the peach.', [ing('pea')])).toEqual([]);
  });

  it('returns each ingredient once, in list order', () => {
    const list = [ing('salt'), ing('onion'), ing('salt, flaky')];
    expect(names(ingredientsInStep('Onion, then salt, more salt.', list))).toEqual([
      'salt',
      'onion',
      'salt, flaky',
    ]);
    expect(names(ingredientsInStep('Salt salt salt.', [ing('salt')]))).toEqual(['salt']);
  });

  it('skips water', () => {
    expect(ingredientsInStep('Add the water.', [ing('water')])).toEqual([]);
  });
});
