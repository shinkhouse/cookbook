import { Ingredient } from './model/recipes.model';
import { checkIngredient, checkNotes } from './recipe-checks';

const row = (name: string, extra: Partial<Ingredient> = {}): Ingredient => ({
  qty: 1,
  unit: '',
  name,
  aisle: 'pantry',
  ...extra,
});
const kinds = (ing: Ingredient) => checkIngredient(ing).map((c) => c.kind);

describe('checkIngredient', () => {
  it('finds nothing in a plain row, or an empty one', () => {
    expect(checkIngredient(row('honey'))).toEqual([]);
    expect(checkIngredient(row('  '))).toEqual([]);
  });

  it('offers to finish a line that ends in "plus"', () => {
    const [check] = checkIngredient(row('gochujang, plus'));
    expect(check.kind).toBe('plus');
    expect(check.summary).toBe('“gochujang, plus” — plus what?');
    expect(check.fix?.change).toEqual({ type: 'name', name: 'gochujang, plus more to taste' });
  });

  it('moves a count read in ahead of the name to the end', () => {
    const [check] = checkIngredient(row('(5-6) boneless skinless chicken thighs', { aisle: 'meat' }));
    expect(check.kind).toBe('stuck');
    expect(check.message).toBe('Looks like “5–6 thighs” got stuck in the name.');
    expect(check.fix?.change).toEqual({ type: 'name', name: 'boneless skinless chicken thighs (5-6)' });
  });

  it('says which aisle a row usually goes in, and moves it there', () => {
    const [check] = checkIngredient(row('peaches, quartered', { aisle: 'pantry' }));
    expect(check.message).toBe('Peaches are usually in Produce.');
    expect(check.summary).toBe('Peaches filed under Pantry');
    expect(check.fix).toEqual({ label: 'Move to Produce', change: { type: 'aisle', aisle: 'produce' } });
  });

  it('says singular things are in an aisle, and the fish counter is a counter', () => {
    expect(checkIngredient(row('butter', { aisle: 'pantry' }))[0].message).toBe('Butter is usually in Dairy.');
    expect(checkIngredient(row('cod', { aisle: 'pantry' }))[0].message).toBe('Cod is usually at the fish counter.');
  });

  it('puts anything in a can or jar on the shelf', () => {
    const [check] = checkIngredient(row('cannellini or butter beans, rinsed', { unit: 'can', aisle: 'dairy' }));
    expect(check.message).toBe('Canned butter beans are usually in Pantry.');
    expect(check.fix?.change).toEqual({ type: 'aisle', aisle: 'pantry' });
  });

  it('says nothing about a row whose name matches no aisle', () => {
    expect(checkIngredient(row('gochujang', { aisle: 'dairy' }))).toEqual([]);
  });

  it('splits two things from two aisles into two rows', () => {
    const ing = row('Sour cream and chopped flat-leaf parsley (both optional)', { qty: null, aisle: 'dairy' });
    const [check] = checkIngredient(ing);
    expect(check.kind).toBe('two-in-one');
    expect(check.summary).toBe('Sour cream and parsley are one row');
    expect(check.fix?.change).toEqual({
      type: 'split',
      rows: [
        { qty: null, unit: '', name: 'Sour cream (optional)', aisle: 'dairy' },
        { qty: null, unit: '', name: 'chopped flat-leaf parsley (optional)', aisle: 'produce' },
      ],
    });
  });

  it('leaves two things from one aisle as one row', () => {
    expect(kinds(row('Kosher salt and black pepper', { qty: null }))).toEqual([]);
  });

  it('flags a row the parser reads as two things, with no fix to offer', () => {
    const [check] = checkIngredient(row('salt + pepper'));
    expect(check.kind).toBe('several');
    expect(check.fix).toBeUndefined();
  });
});

describe('checkNotes', () => {
  const tomatoes = [row('cherry or grape tomatoes (see Tip)', { aisle: 'produce' })];

  it('notices a "see Tip" with no tip among the notes', () => {
    const [check] = checkNotes(tomatoes, [], []);
    expect(check.message).toBe('“cherry or grape tomatoes” says “see Tip”, but there’s no tip yet.');
    expect(check.summary).toBe('“see Tip” points nowhere');
    expect(check.fix).toEqual({ label: 'Add the Tip', note: 'Tip: ' });
  });

  it('is satisfied once a note starts with Tip', () => {
    expect(checkNotes(tomatoes, [], ['Tip: any small tomato works.'])).toEqual([]);
  });

  it('reads the steps too', () => {
    expect(checkNotes([], ['Make the dough (see Note).'], [])[0].message).toBe(
      'Step 1 says “see Note”, but there’s no note yet.',
    );
  });
});
