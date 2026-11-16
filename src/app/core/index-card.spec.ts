import { cardLines, cardTilt } from './index-card';
import { Ingredient } from './model/recipes.model';

const ing = (name: string): Ingredient => ({ qty: 1, unit: '', name, aisle: 'pantry' });

describe('cardLines', () => {
  it('writes each name as it would go on a card: before the comma, without asides', () => {
    expect(
      cardLines([ing('boneless chicken thighs (about 2 lb), cut into strips'), ing('soy sauce')]),
    ).toEqual(['Boneless chicken thighs', 'Soy sauce']);
  });

  it('skips blank names and stray units an import left behind', () => {
    expect(cardLines([ing(''), ing('cup'), ing('Tbsp'), ing('mozzarella cheese')])).toEqual([
      'Mozzarella cheese',
    ]);
  });

  it('writes a name once, whatever its case', () => {
    expect(cardLines([ing('Salt'), ing('salt'), ing('pepper')])).toEqual(['Salt', 'Pepper']);
  });

  it('stops at what fits on a card', () => {
    const many = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'].map((n) => ing(`item ${n}`));
    expect(cardLines(many).length).toBe(6);
    expect(cardLines(many, 3)).toEqual(['Item a1', 'Item b2', 'Item c3']);
  });
});

describe('cardTilt', () => {
  const slugs = ['grandmas-chili', 'pad-thai', 'pizza-dough', 'coq-au-vin', 'black-beans', 'pico'];

  it('is the same every time for a recipe', () => {
    for (const slug of slugs) expect(cardTilt(slug)).toBe(cardTilt(slug));
  });

  it('leans only slightly, and not every card the same way', () => {
    const tilts = slugs.map(cardTilt);
    for (const t of tilts) {
      expect(t).toBeGreaterThanOrEqual(-1.2);
      expect(t).toBeLessThanOrEqual(1.2);
    }
    expect(new Set(tilts).size).toBeGreaterThan(1);
  });
});
