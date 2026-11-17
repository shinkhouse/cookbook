import { mentionPieces } from './mentions';

/** The step with each mention marked as [text→index], for compact expectations. */
function marked(step: string, ingredients: string[]): string {
  return mentionPieces(step, ingredients)
    .map((p) => (p.ingredient === undefined ? p.text : `[${p.text}→${p.ingredient}]`))
    .join('');
}

const SPAGHETTI = [
  'spaghetti noodles',
  'hamburger',
  'dried onion',
  'tomato paste',
  'tomato juice',
  'garlic powder',
  'chili powder',
  'sugar',
];

describe('mentionPieces', () => {
  it('marks the ingredients a step names, longest match first', () => {
    expect(marked('Add jar of sauce, then add in tomato juice to thin sauce.', SPAGHETTI)).toBe(
      'Add jar of sauce, then add in [tomato juice→4] to thin sauce.',
    );
    expect(marked('Add in garlic powder, chili powder, and sugar.', SPAGHETTI)).toBe(
      'Add in [garlic powder→5], [chili powder→6], and [sugar→7].',
    );
  });

  it('takes a plural for a singular and the other way round', () => {
    expect(marked('Brown hamburger with dried onions till brown.', SPAGHETTI)).toBe(
      'Brown [hamburger→1] with [dried onions→2] till brown.',
    );
    expect(marked('Halve the tomato.', ['2 tomatoes'.replace(/^\d+ /, '')])).toBe('Halve the [tomato→0].');
    expect(marked('Slice the peaches.', ['peach'])).toBe('Slice the [peaches→0].');
    expect(marked('Toss the berries.', ['berry'])).toBe('Toss the [berries→0].');
  });

  it('uses a shorter phrase only when no other ingredient shares it', () => {
    expect(marked('Once boiling, add spaghetti.', SPAGHETTI)).toBe('Once boiling, add [spaghetti→0].');
    // "tomato" is in two names, so it names neither.
    expect(marked('Add the tomato and stir.', SPAGHETTI)).toBe('Add the tomato and stir.');
    expect(marked('Season the chicken.', ['boneless skinless chicken thighs'])).toBe(
      'Season the [chicken→0].',
    );
  });

  it('leaves a shorter phrase alone when a general noun after it makes it something else', () => {
    expect(marked('Add jar of spaghetti sauce, then the spaghetti.', SPAGHETTI)).toBe(
      'Add jar of spaghetti sauce, then the [spaghetti→0].',
    );
    expect(marked('Pour in the chicken broth.', ['chicken thighs', 'broth'])).toBe(
      'Pour in the chicken [broth→1].',
    );
  });

  it('never lets a describing word or a general noun stand alone', () => {
    expect(marked('Add the paste, then the dried herbs.', SPAGHETTI)).toBe('Add the paste, then the dried herbs.');
    expect(marked('Add the powder.', SPAGHETTI)).toBe('Add the powder.');
  });

  it('gives a word to the ingredient it names, not one it only describes', () => {
    const soup = ['boneless, skinless chicken breasts (or thighs)', 'low-sodium chicken broth (divided)', 'lime juice'];
    expect(marked('Return the chicken to the pot with the chicken broth.', soup)).toBe(
      'Return the [chicken→0] to the pot with the [chicken broth→1].',
    );
    expect(marked('Season with salt and lime.', soup)).toBe('Season with salt and lime.');
  });

  it('reads the name before a comma or bracket', () => {
    expect(marked('Toss in the celery.', ['celery, chopped'])).toBe('Toss in the [celery→0].');
    expect(marked('Add the bacon.', ['bacon (10 to 12 slices)'])).toBe('Add the [bacon→0].');
  });

  it('matches whole words, ignoring case', () => {
    expect(marked('SUGAR first; no sugary bits.', ['sugar'])).toBe('[SUGAR→0] first; no sugary bits.');
  });

  it('returns the step as one piece when it names nothing', () => {
    expect(mentionPieces('Boil water.', SPAGHETTI)).toEqual([{ text: 'Boil water.' }]);
    expect(mentionPieces('', SPAGHETTI)).toEqual([]);
  });
});
