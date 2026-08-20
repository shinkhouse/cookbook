import { formatQty, scaleFactor, scaleLabel } from './scale';

describe('scaleFactor', () => {
  it('is 1 when the chosen servings match the base', () => {
    expect(scaleFactor(4, 4)).toBe(1);
  });

  it('is the ratio of chosen to base', () => {
    expect(scaleFactor(6, 4)).toBe(1.5);
  });
});

describe('scaleLabel', () => {
  it('reads "as written" at factor 1', () => {
    expect(scaleLabel(1)).toBe('as written');
  });

  it('reads the multiplier when scaled', () => {
    expect(scaleLabel(1.5)).toBe('scaled ×1.5');
  });

  it('trims a trailing zero from the multiplier', () => {
    expect(scaleLabel(2)).toBe('scaled ×2');
  });
});

describe('formatQty', () => {
  it('renders nothing for a null quantity', () => {
    expect(formatQty(null)).toBe('');
  });

  it('renders a whole number plainly', () => {
    expect(formatQty(3)).toBe('3');
  });

  it('renders each supported vulgar fraction', () => {
    expect(formatQty(0.125)).toBe('⅛');
    expect(formatQty(0.25)).toBe('¼');
    expect(formatQty(1 / 3)).toBe('⅓');
    expect(formatQty(0.375)).toBe('⅜');
    expect(formatQty(0.5)).toBe('½');
    expect(formatQty(0.625)).toBe('⅝');
    expect(formatQty(2 / 3)).toBe('⅔');
    expect(formatQty(0.75)).toBe('¾');
  });

  it('renders a mixed number as whole plus fraction', () => {
    expect(formatQty(1.5)).toBe('1½');
    expect(formatQty(2.25)).toBe('2¼');
  });

  it('snaps to a fraction inside the 0.04 tolerance', () => {
    expect(formatQty(0.53)).toBe('½');
  });

  it('falls back to decimals outside the tolerance', () => {
    expect(formatQty(0.57)).toBe('0.57');
  });

  it('trims trailing zeros from the decimal fallback', () => {
    // 0.9 is further than the tolerance from every supported fraction, so this
    // takes the decimal path; toFixed(2) would otherwise leave "1.90".
    expect(formatQty(1.9)).toBe('1.9');
  });

  it('snaps to the eighth for a remainder just inside tolerance of it', () => {
    // Guards the case that caught a bad expectation while writing these: 0.1 is
    // 0.025 from ⅛, so it snaps rather than rendering as a decimal.
    expect(formatQty(1.1)).toBe('1⅛');
  });

  it('rounds the decimal fallback to two places', () => {
    expect(formatQty(0.567)).toBe('0.57');
  });
});
