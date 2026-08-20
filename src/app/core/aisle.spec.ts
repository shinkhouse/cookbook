import { AISLE_LABELS, AISLE_ORDER, inferAisle } from './aisle';

describe('inferAisle', () => {
  it('defaults to pantry when nothing matches', () => {
    expect(inferAisle('smoked paprika')).toBe('pantry');
  });

  it('puts fresh vegetables in produce', () => {
    expect(inferAisle('fresh basil')).toBe('produce');
    expect(inferAisle('garlic, minced')).toBe('produce');
    expect(inferAisle('scallions, sliced')).toBe('produce');
  });

  it('puts cuts of meat in meat', () => {
    expect(inferAisle('chicken breasts')).toBe('meat');
    expect(inferAisle('hamburger')).toBe('meat');
  });

  it('puts fish and shellfish at the fish counter', () => {
    expect(inferAisle('shrimp, peeled')).toBe('seafood');
    expect(inferAisle('salmon fillet')).toBe('seafood');
  });

  it('puts milk and cheese in dairy', () => {
    expect(inferAisle('heavy cream')).toBe('dairy');
    expect(inferAisle('parmesan cheese')).toBe('dairy');
  });

  it('prefers the longest match so chicken broth is pantry, not meat', () => {
    expect(inferAisle('chicken broth')).toBe('pantry');
    expect(inferAisle('chicken stock')).toBe('pantry');
  });

  it('is case insensitive', () => {
    expect(inferAisle('Fresh Basil')).toBe('produce');
  });

  it('matches on whole words so "creamy" is not "cream"', () => {
    expect(inferAisle('creamy dressing')).toBe('pantry');
  });
});

describe('aisle presentation', () => {
  it('maps seafood to the "Fish counter" label', () => {
    expect(AISLE_LABELS.seafood).toBe('Fish counter');
  });

  it('labels the remaining aisles plainly', () => {
    expect(AISLE_LABELS.produce).toBe('Produce');
    expect(AISLE_LABELS.meat).toBe('Meat');
    expect(AISLE_LABELS.dairy).toBe('Dairy');
    expect(AISLE_LABELS.pantry).toBe('Pantry');
  });

  it('orders aisles produce, meat, seafood, dairy, pantry', () => {
    expect(AISLE_ORDER).toEqual(['produce', 'meat', 'seafood', 'dairy', 'pantry']);
  });
});
