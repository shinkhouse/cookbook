import { pageNumbers } from './pagination';

describe('pageNumbers', () => {
  it('lists every page when there are few', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps the ends and the pages either side of the current one, with gaps between', () => {
    expect(pageNumbers(7, 50)).toEqual([1, 'gap', 6, 7, 8, 'gap', 50]);
  });

  it('shows a single missing page rather than a gap standing for one page', () => {
    expect(pageNumbers(4, 50)).toEqual([1, 2, 3, 4, 5, 'gap', 50]);
    expect(pageNumbers(47, 50)).toEqual([1, 'gap', 46, 47, 48, 49, 50]);
  });

  it('works at either end', () => {
    expect(pageNumbers(1, 50)).toEqual([1, 2, 'gap', 50]);
    expect(pageNumbers(50, 50)).toEqual([1, 'gap', 49, 50]);
  });
});
