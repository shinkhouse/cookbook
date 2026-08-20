import { formatCountdown, parseDuration } from './timer';

describe('parseDuration', () => {
  it('returns null when a step mentions no duration', () => {
    expect(parseDuration('Brown the hamburger with dried onions.')).toBeNull();
  });

  it('reads a whole number of minutes as seconds', () => {
    expect(parseDuration('Simmer on low heat for about 20 minutes')).toBe(20 * 60);
  });

  it('reads a singular minute', () => {
    expect(parseDuration('Rest for 1 minute')).toBe(60);
  });

  it('reads the abbreviated form', () => {
    expect(parseDuration('Bake for 25 min')).toBe(25 * 60);
    expect(parseDuration('Bake for 25 mins')).toBe(25 * 60);
  });

  it('reads hours', () => {
    expect(parseDuration('Braise for 2 hours')).toBe(2 * 3600);
    expect(parseDuration('Rest 1 hour before slicing')).toBe(3600);
  });

  it('takes the upper bound of a hyphen range', () => {
    expect(parseDuration('Cook for 20-25 minutes')).toBe(25 * 60);
  });

  it('takes the upper bound of an en-dash range', () => {
    expect(parseDuration('Cook for 20–25 minutes')).toBe(25 * 60);
  });

  it('takes the upper bound of a "to" range', () => {
    expect(parseDuration('Cook for 20 to 30 minutes')).toBe(30 * 60);
  });

  it('is case insensitive', () => {
    expect(parseDuration('SIMMER 10 MINUTES')).toBe(600);
  });

  it('returns the first duration when a step mentions several', () => {
    expect(parseDuration('Sear 3 minutes, then bake 40 minutes')).toBe(180);
  });

  it('ignores a number that is not a duration', () => {
    expect(parseDuration('Add 2 tablespoons of dried onion')).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('renders minutes and padded seconds', () => {
    expect(formatCountdown(125)).toBe('2:05');
  });

  it('renders a whole minute', () => {
    expect(formatCountdown(60)).toBe('1:00');
  });

  it('renders under a minute with a zero minute part', () => {
    expect(formatCountdown(9)).toBe('0:09');
  });

  it('renders zero', () => {
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('carries minutes past sixty rather than showing hours', () => {
    expect(formatCountdown(3600)).toBe('60:00');
  });

  it('never renders a negative countdown', () => {
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
