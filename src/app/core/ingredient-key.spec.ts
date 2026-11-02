import { ingredientHead, ingredientKey, singular, stripDescriptors } from './ingredient-key';

describe('ingredientKey', () => {
  it('drops the prep after the comma and singularises', () =>
    expect(ingredientKey('Onions, diced')).toBe('onion'));

  it('drops a leading size and a parenthetical', () =>
    // The parser has already taken "2" off "2 large tomatoes (12 oz/342 g)".
    expect(ingredientKey('large tomatoes (12 oz/342 g)')).toBe('tomato'));

  it('keeps a multi-word name, singularising only the last word', () =>
    expect(ingredientKey('Ground beef')).toBe('ground beef'));

  it('is blank for a blank name', () => expect(ingredientKey('  ')).toBe(''));
});

describe('ingredientHead', () => {
  it('lowercases, collapses whitespace and ignores a comma inside parentheses', () =>
    expect(ingredientHead('  Large   Tomatoes (12 oz, 342 g), halved')).toBe('large tomatoes'));
});

describe('stripDescriptors', () => {
  it('drops every leading descriptor but not a word that only starts with one', () => {
    expect(stripDescriptors('fresh chopped parsley')).toBe('parsley');
    expect(stripDescriptors('freshwater fish')).toBe('freshwater fish');
  });
});

describe('singular', () => {
  it('follows the rules in order', () => {
    expect(singular('berries')).toBe('berry');
    expect(singular('peaches')).toBe('peach');
    expect(singular('molasses')).toBe('molasses');
    expect(singular('potatoes')).toBe('potato');
    expect(singular('dishes')).toBe('dish');
    expect(singular('boxes')).toBe('box');
    expect(singular('onions')).toBe('onion');
    expect(singular('glass')).toBe('glass');
    expect(singular('hummus')).toBe('hummus');
    expect(singular('peas')).toBe('pea');
    expect(singular('gas')).toBe('gas');
    expect(singular('pies')).toBe('pie');
  });
});
