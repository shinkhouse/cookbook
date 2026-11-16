/** A page button, or a gap standing for the pages between two buttons. */
export type PageItem = number | 'gap';

/**
 * The page buttons for a pager: the first and last pages, the current one and
 * its neighbours, with gaps between. A gap would only ever hide one page, so
 * that page is shown instead ("1 2 3", never "1 … 3").
 */
export function pageNumbers(current: number, total: number): PageItem[] {
  const pages = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const items: PageItem[] = [];
  let last = 0;
  for (const page of pages) {
    if (page - last === 2) items.push(last + 1);
    else if (page - last > 2) items.push('gap');
    items.push(page);
    last = page;
  }
  return items;
}
