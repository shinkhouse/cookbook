import { findFoods } from './aisle';
import { Ingredient } from './model/recipes.model';
import { checkIngredient, checkIngredients, checkNotes, checkSteps, joinRows, sentences } from './recipe-checks';

const row = (name: string, extra: Partial<Ingredient> = {}): Ingredient => ({
  qty: 1,
  unit: '',
  name,
  aisle: 'pantry',
  ...extra,
});

describe('checkIngredient', () => {
  it('finds nothing in a plain row, or an empty one', () => {
    expect(checkIngredient(row('honey'))).toBeNull();
    expect(checkIngredient(row('  '))).toBeNull();
  });

  it('offers to finish a line that ends in "plus"', () => {
    const check = checkIngredient(row('gochujang, plus'))!;
    expect(check.kind).toBe('dangling');
    expect(check.message).toBe('The line ends in “plus”.');
    expect(check.fix?.change).toEqual({ type: 'replace', rows: [row('gochujang, plus more to taste')] });
  });

  it('offers to join a line ending in "or" with the next, when there is one', () => {
    expect(checkIngredient(row('unsalted butter or'), undefined, row('olive oil'))?.fix?.change).toEqual({
      type: 'join',
      with: 'next',
    });
    expect(checkIngredient(row('unsalted butter or'))?.fix).toBeUndefined();
  });

  it('lets "plus more" and "or more" stand', () => {
    expect(checkIngredient(row('flour, plus more'))).toBeNull();
    expect(checkIngredient(row('2 cups broth or more'))).toBeNull();
  });

  it('moves a count read in ahead of the name to the end', () => {
    const check = checkIngredient(row('(5-6) boneless skinless chicken thighs', { aisle: 'meat' }))!;
    expect(check.message).toBe('Looks like “5–6 thighs” got stuck in the name.');
    expect(check.fix?.change).toEqual({
      type: 'replace',
      rows: [row('boneless skinless chicken thighs (5-6)', { aisle: 'meat' })],
    });
  });

  it('puts a word cut at a dash back together', () => {
    const check = checkIngredient(row('-grain cereal)', { qty: 7 }))!;
    expect(check.kind).toBe('dash');
    expect(check.fix?.label).toBe('Make it “7-grain cereal)”');
    expect(check.fix?.change).toEqual({ type: 'replace', rows: [row('7-grain cereal)', { qty: null })] });
    expect(checkIngredient(row('-grain cereal', { qty: null }), row('wheat'))?.fix?.change).toEqual({
      type: 'join',
      with: 'previous',
    });
  });

  it('offers to join a row whose "(" never closes with the next', () => {
    const check = checkIngredient(row('cooked grains (my favorites are: rice,'), undefined, row('barley)'))!;
    expect(check.kind).toBe('unclosed');
    expect(check.fix?.change).toEqual({ type: 'join', with: 'next' });
  });

  it('asks for a number before a unit, and offers 1', () => {
    const check = checkIngredient(row('tomato juice', { qty: null, unit: 'can' }))!;
    expect(check.message).toBe('“can” with no number before it.');
    expect(check.fix?.change).toEqual({ type: 'replace', rows: [row('tomato juice', { qty: 1, unit: 'can' })] });
    expect(checkIngredient(row('salt', { qty: null, unit: 'pinch' }))).toBeNull();
  });

  it('asks what a fraction with no unit measures, except for produce and eggs', () => {
    expect(checkIngredient(row('hamburger', { qty: 0.5, aisle: 'meat' }))?.message).toBe('“½” of what? There’s no unit.');
    expect(checkIngredient(row('onion', { qty: 0.5, aisle: 'produce' }))).toBeNull();
    expect(checkIngredient(row('eggs', { qty: 1.5, aisle: 'dairy' }))).toBeNull();
  });

  it('says which aisle a row usually goes in, and moves it there', () => {
    const check = checkIngredient(row('peaches, quartered'))!;
    expect(check.message).toBe('Peaches are usually in Produce.');
    expect(check.summary).toBe('Peaches filed under Pantry');
    expect(check.fix?.label).toBe('Move to Produce');
  });

  it('puts anything in a can or jar on the shelf', () => {
    const check = checkIngredient(row('cannellini or butter beans, rinsed', { unit: 'can', aisle: 'dairy' }))!;
    expect(check.message).toBe('Canned butter beans are usually in Pantry.');
  });

  it('splits two things from two aisles into two rows', () => {
    const ing = row('Sour cream and chopped flat-leaf parsley (both optional)', { qty: null, aisle: 'dairy' });
    const check = checkIngredient(ing)!;
    expect(check.summary).toBe('Sour cream and parsley are one row');
    expect(check.fix?.change).toEqual({
      type: 'replace',
      rows: [
        row('Sour cream (optional)', { qty: null, aisle: 'dairy' }),
        row('chopped flat-leaf parsley (optional)', { qty: null, aisle: 'produce' }),
      ],
    });
  });

  it('flags a row the parser reads as two things', () => {
    expect(checkIngredient(row('salt + pepper'))?.kind).toBe('several');
  });

  it('never flags a second measurement', () => {
    expect(checkIngredient(row('tomatoes, 12 oz/342 g', { aisle: 'produce' }))).toBeNull();
  });

  it('gives a row one flag, the most telling', () => {
    // Ends in "plus" and sits in the wrong aisle: the line comes first.
    expect(checkIngredient(row('butter, plus'))?.kind).toBe('dangling');
  });
});

describe('checkIngredients and joinRows', () => {
  it('reads each row with its neighbours', () => {
    const list = [row('grains (rice,', { qty: 1, unit: 'cup' }), row('-grain cereal)', { qty: 7 })];
    expect(checkIngredients(list).map((c) => c?.kind)).toEqual(['unclosed', 'dash']);
  });

  it('joins two rows into the first, amount and all', () => {
    expect(joinRows(row('grains (rice,', { unit: 'cup' }), row('-grain cereal)', { qty: 7 }))).toEqual(
      row('grains (rice, 7-grain cereal)', { unit: 'cup' }),
    );
  });
});

describe('checkSteps', () => {
  const list = [row('spaghetti noodles'), row('hamburger', { aisle: 'meat' }), row('dried onion')];

  it('offers to take "Step 3:" off the front', () => {
    const [check] = checkSteps(['Step 3: Stir it all.'], list);
    expect(check?.kind).toBe('step-label');
    expect(check?.fix?.steps).toEqual(['Stir it all.']);
  });

  it('offers to split a one-step method into its sentences', () => {
    const [check] = checkSteps(['Mix all together. Pour dressing over salad and chill.'], []);
    expect(check?.message).toBe('This step has two sentences — one per step reads better in cooking mode.');
    expect(check?.summary).toBe('Method is one step');
    expect(check?.fix?.label).toBe('Split into 2 steps');
  });

  it('leaves a long step alone when there are others', () => {
    expect(checkSteps(['Boil water. Add salt.', 'Drain.'], [])).toEqual([null, null]);
  });

  it('notices a step using something not on the list, and offers to add it', () => {
    const [ok, missing] = checkSteps(
      ['Brown the beef with the dried onions; boil the spaghetti.', 'Stir in the sour cream.'],
      list,
    );
    expect(ok).toBeNull();
    expect(missing?.summary).toBe('Step 2 uses “sour cream”, not on the list');
    expect(missing?.fix?.ingredient).toEqual({ qty: null, unit: '', name: 'sour cream', aisle: 'dairy' });
  });

  it('takes salt, pepper and oil for granted', () => {
    expect(checkSteps(['Season with salt and pepper in hot oil.', 'Serve.'], list)).toEqual([null, null]);
  });
});

describe('sentences', () => {
  it('cuts at a full stop before a capital, not at "approx."', () => {
    expect(sentences('Bake approx. 10 minutes. Cool. Serve warm!')).toEqual(['Bake approx. 10 minutes.', 'Cool.', 'Serve warm!']);
  });
});

describe('findFoods', () => {
  it('finds every food word once, longest first, in order', () => {
    expect(findFoods('Brown the ground beef, then the onions and more beef.').map((f) => f.word)).toEqual([
      'ground beef',
      'onions',
      'beef',
    ]);
  });
});

describe('checkNotes', () => {
  const tomatoes = [row('cherry or grape tomatoes (see Tip)', { aisle: 'produce' })];

  it('notices a "see Tip" with no tip among the notes', () => {
    const [check] = checkNotes(tomatoes, [], []);
    expect(check.message).toBe('“cherry or grape tomatoes” says “see Tip”, but there’s no tip yet.');
    expect(check.fix).toEqual({ label: 'Add the Tip', note: 'Tip: ' });
  });

  it('is satisfied once a note starts with Tip', () => {
    expect(checkNotes(tomatoes, [], ['Tip: any small tomato works.'])).toEqual([]);
  });
});
