import { bestUnit, convertMeasure, formatMeasure, measurable } from './units';

describe('measurable', () => {
  it('looks units up case-insensitively', () => {
    expect(measurable('Cup')).toEqual(measurable('cup'));
    expect(measurable('Cup')?.unit).toBe('cup');
    expect(formatMeasure({ qty: 2, unit: 'Cup' })).toBe('2 cups');
    expect(measurable('KG')).toEqual(measurable('kg'));
    expect(measurable('Small Can')).toBeNull();
  });

  it('looks up exact units only', () => {
    expect(measurable('cup')).toEqual({ unit: 'cup', dimension: 'volume', system: 'us', base: 236.588 });
    expect(measurable('kg')).toEqual({ unit: 'kg', dimension: 'weight', system: 'metric', base: 1000 });
    expect(measurable('small can')).toBeNull();
    expect(measurable('heaping tbsp')).toBeNull();
  });
});

describe('bestUnit', () => {
  it('picks tsp, tbsp and cup for US volume', () => {
    expect(bestUnit(5, 'volume', 'us').unit).toBe('tsp');
    expect(bestUnit(15, 'volume', 'us').unit).toBe('tbsp');
    expect(bestUnit(120, 'volume', 'us').unit).toBe('cup');
  });

  it('moves to litres at 1000 ml', () => {
    expect(bestUnit(1500, 'volume', 'metric')).toEqual({ qty: 1.5, unit: 'l' });
  });
});

describe('convertMeasure', () => {
  it('converts a cup to 240 ml', () =>
    expect(convertMeasure({ qty: 1, unit: 'cup' }, 'metric')).toEqual({ qty: 240, unit: 'ml' }));
  it('converts a teaspoon to 5 ml', () =>
    expect(convertMeasure({ qty: 1, unit: 'tsp' }, 'metric')).toEqual({ qty: 5, unit: 'ml' }));
  it('converts 2 lb to 905 g', () =>
    expect(convertMeasure({ qty: 2, unit: 'lb' }, 'metric')).toEqual({ qty: 905, unit: 'g' }));
  it('moves to kg at 1000 g', () =>
    expect(convertMeasure({ qty: 2.5, unit: 'lb' }, 'metric')).toEqual({ qty: 1.15, unit: 'kg' }));
  it('converts 250 ml to a cup', () =>
    expect(convertMeasure({ qty: 250, unit: 'ml' }, 'us')).toEqual({ qty: 1, unit: 'cup' }));
  it('converts 30 ml to 2 tbsp', () =>
    expect(convertMeasure({ qty: 30, unit: 'ml' }, 'us')).toEqual({ qty: 2, unit: 'tbsp' }));
  it('converts 500 g to 1⅛ lb', () =>
    expect(convertMeasure({ qty: 500, unit: 'g' }, 'us')).toEqual({ qty: 1.125, unit: 'lb' }));
  it('leaves unmeasurable and qualified units alone', () => {
    for (const unit of ['', 'pinch', 'can', 'small can', 'heaping tbsp', 'clove']) {
      expect(convertMeasure({ qty: 2, unit }, 'metric')).withContext(unit).toEqual({ qty: 2, unit });
    }
  });
  it('does not round a unit already in the target system', () =>
    expect(convertMeasure({ qty: 2.37, unit: 'g' }, 'metric')).toEqual({ qty: 2.37, unit: 'g' }));
  it('never rounds a positive amount to nothing', () =>
    expect(convertMeasure({ qty: 0.125, unit: 'tsp' }, 'metric').qty).toBe(0.5));
  it('never rounds a tiny US amount to nothing', () =>
    expect(convertMeasure({ qty: 1, unit: 'g' }, 'us')).toEqual({ qty: 0.125, unit: 'oz' }));
});

describe('formatMeasure', () => {
  it('formats metric as decimals and US as fractions', () => {
    expect(formatMeasure({ qty: 1.15, unit: 'kg' })).toBe('1.15 kg');
    expect(formatMeasure({ qty: 1.5, unit: 'cup' })).toBe('1½ cups');
    expect(formatMeasure({ qty: 3, unit: '' })).toBe('3');
  });

  it('pluralises cup above one, and only cup', () => {
    expect(formatMeasure({ qty: 1, unit: 'cup' })).toBe('1 cup');
    expect(formatMeasure({ qty: 0.5, unit: 'cup' })).toBe('½ cup');
    expect(formatMeasure({ qty: 2, unit: 'cup' })).toBe('2 cups');
    expect(formatMeasure({ qty: 1.5, unit: 'cup' })).toBe('1½ cups');
    expect(formatMeasure({ qty: 2, unit: 'tbsp' })).toBe('2 tbsp');
    expect(formatMeasure({ qty: 3, unit: 'oz' })).toBe('3 oz');
  });
});
