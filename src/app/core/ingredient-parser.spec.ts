import { parseIngredient } from './ingredient-parser';

describe('parseIngredient — quantities', () => {
  it('reads a leading integer', () => {
    expect(parseIngredient('2 tablespoons dried onion').qty).toBe(2);
  });

  it('reads a bare fraction', () => {
    expect(parseIngredient('1/2 cup dry white wine').qty).toBe(0.5);
  });

  it('reads a unicode fraction', () => {
    expect(parseIngredient('¼ teaspoon ground black pepper').qty).toBe(0.25);
    expect(parseIngredient('⅓ cup sundried tomatoes chopped').qty).toBeCloseTo(1 / 3, 5);
  });

  it('reads a mixed number', () => {
    expect(parseIngredient('1 1/2 cups grated pepper Jack cheese').qty).toBe(1.5);
  });

  it('takes the upper bound of a range', () => {
    expect(parseIngredient('4-6 Green onions, thinly sliced').qty).toBe(6);
  });

  it('is null when the line has no quantity', () => {
    expect(parseIngredient('can of tomato juice').qty).toBeNull();
  });

  it('is null for a "to taste" line', () => {
    expect(parseIngredient('Salt to taste').qty).toBeNull();
    expect(parseIngredient('Chili powder to taste').qty).toBeNull();
  });

  it('tolerates leading whitespace', () => {
    expect(parseIngredient(' 1 tablespoon chili powder').qty).toBe(1);
  });
});

describe('parseIngredient — units', () => {
  it('normalises long unit names to short forms', () => {
    expect(parseIngredient('2 tablespoons dried onion').unit).toBe('tbsp');
    expect(parseIngredient('1 teaspoon sugar').unit).toBe('tsp');
    expect(parseIngredient('1 pound hamburger').unit).toBe('lb');
  });

  it('keeps cup as cup', () => {
    expect(parseIngredient('1/2 cup honey').unit).toBe('cup');
  });

  it('keeps a size qualifier as part of the unit', () => {
    const parsed = parseIngredient('1 small can tomato paste');
    expect(parsed.unit).toBe('small can');
    expect(parsed.name).toBe('tomato paste');
  });

  it('reads a bare can', () => {
    const parsed = parseIngredient('1 can kidney beans');
    expect(parsed.unit).toBe('can');
    expect(parsed.name).toBe('kidney beans');
  });

  it('reads a unit with no quantity and drops the connective', () => {
    const parsed = parseIngredient('can of tomato juice');
    expect(parsed.qty).toBeNull();
    expect(parsed.unit).toBe('can');
    expect(parsed.name).toBe('tomato juice');
  });

  it('is empty for a countable with no unit', () => {
    const parsed = parseIngredient('3 scallions, sliced');
    expect(parsed.unit).toBe('');
    expect(parsed.name).toBe('scallions, sliced');
  });

  it('does not mistake the first word of a name for a unit', () => {
    const parsed = parseIngredient('2 chicken breasts');
    expect(parsed.unit).toBe('');
    expect(parsed.name).toBe('chicken breasts');
  });
});

describe('parseIngredient — names', () => {
  it('keeps the remainder of the line as the name', () => {
    expect(parseIngredient('1 tablespoon garlic powder').name).toBe('garlic powder');
  });

  it('keeps the whole line as the name when there is no quantity', () => {
    expect(parseIngredient('can of tomato juice').name).toBe('tomato juice');
    expect(parseIngredient('Fresh cilantro').name).toBe('Fresh cilantro');
  });

  it('drops a trailing serving instruction, which is not part of the item', () => {
    expect(parseIngredient('crumbled feta, for serving').name).toBe('crumbled feta');
    expect(parseIngredient('Salt to taste').name).toBe('Salt');
    expect(parseIngredient('Cilantro, chopped, optional').name).toBe('Cilantro, chopped');
    expect(parseIngredient('1 tsp chili flakes, more to taste').name).toBe('chili flakes');
  });

  it('never strips the whole name away', () => {
    // 'to taste' is the entire line; there is nothing else to keep.
    expect(parseIngredient('to taste').name).toBe('to taste');
  });

  it('trims surrounding whitespace', () => {
    expect(parseIngredient('  1 teaspoon sugar  ').name).toBe('sugar');
  });

  it('never returns an empty name for a non-empty line', () => {
    expect(parseIngredient('1 cup').name).toBe('cup');
  });
});

describe('parseIngredient — aisle', () => {
  it('infers the aisle from the name', () => {
    expect(parseIngredient('2 tablespoons fresh basil').aisle).toBe('produce');
    expect(parseIngredient('4 chicken breasts').aisle).toBe('meat');
    expect(parseIngredient('1 cup heavy cream').aisle).toBe('dairy');
  });

  it('infers pantry for a broth despite the word chicken', () => {
    expect(parseIngredient('2 cups chicken broth').aisle).toBe('pantry');
  });
});

describe('parseIngredient — needsReview', () => {
  it('is false for a clean single ingredient', () => {
    expect(parseIngredient('2 tablespoons dried onion').needsReview).toBe(false);
  });

  it('flags a line listing several ingredients with "each:"', () => {
    expect(
      parseIngredient('1/2 tsp each: dried oregano, thyme, smoked paprika').needsReview,
    ).toBe(true);
  });

  it('flags a line joining ingredients with a plus', () => {
    expect(parseIngredient('salt + black pepper').needsReview).toBe(true);
  });

  it('flags a dual-measure line', () => {
    expect(parseIngredient('3/4 cup/200 ml low fat cream').needsReview).toBe(true);
  });

  it('does not flag an ordinary comma-qualified name', () => {
    expect(parseIngredient('3 scallions, sliced').needsReview).toBe(false);
  });
});

describe('parseIngredient — degenerate input', () => {
  it('handles an empty string', () => {
    const parsed = parseIngredient('');
    expect(parsed.qty).toBeNull();
    expect(parsed.name).toBe('');
  });

  it('handles a whitespace-only string', () => {
    expect(parseIngredient('   ').name).toBe('');
  });
});
