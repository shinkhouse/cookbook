/**
 * Makes the printed cookbook: every recipe in one PDF, with a cover, a
 * contents page that gives each recipe's page, and page numbers in the footers.
 *
 * It prints the app's /book page through Google Chrome, so the app must be
 * running (`npm start`, with the API on 3152) and Chrome installed.
 *
 *     npm run book                              # A–Z, to ~/Desktop/My Cookbooks.pdf
 *     npm run book -- --order cookbook          # or meal, cuisine
 *     npm run book -- --out ~/Desktop/book.pdf  # somewhere else
 *     npm run book -- --url http://localhost:4320/cookbook/book
 *
 * Chrome cannot number a contents page, so the book is printed once to learn
 * where each recipe lands. Chrome keeps every contents link as a named
 * destination (r0, r1, …) pointing at its page; those numbers are written into
 * the page and it is printed again. The footers are stamped on afterwards,
 * on every page but the cover.
 */
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, StandardFonts, rgb } from 'pdf-lib';
import { chromium } from 'playwright-core';

const ORDERS = ['title', 'cookbook', 'meal', 'cuisine'];

const { values: args } = parseArgs({
  options: {
    order: { type: 'string', default: 'title' },
    url: { type: 'string', default: 'http://localhost:4200/cookbook/book' },
    out: { type: 'string', default: join(homedir(), 'Desktop', 'My Cookbooks.pdf') },
  },
});

/** Letter, with the margins from the app's own @page rule. */
const PDF_OPTIONS = { format: 'Letter', printBackground: true, preferCSSPageSize: true };

/** --ink-3, the colour the app uses for secondary text. */
const FOOTER_INK = rgb(0x5a / 255, 0x68 / 255, 0x78 / 255);

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** The page number, counting the cover as 1, of each named destination. */
async function destinationPages(bytes) {
  const doc = await PDFDocument.load(bytes);
  const pageNumber = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i + 1]));
  const dests = doc.catalog.lookupMaybe(PDFName.of('Dests'), PDFDict);
  const pages = new Map();
  for (const [name, value] of dests ? dests.entries() : []) {
    const target = doc.context.lookup(value);
    const ref = target instanceof PDFArray ? target.get(0) : undefined;
    if (ref instanceof PDFRef) pages.set(name.decodeText(), pageNumber.get(ref.toString()));
  }
  return pages;
}

async function stampFooters(bytes) {
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 9;
  doc.getPages().forEach((page, i) => {
    if (i === 0) return; // The cover goes unnumbered.
    const label = String(i + 1);
    const width = font.widthOfTextAtSize(label, size);
    // Centred in the bottom margin, which the app's @page rule makes 1.5cm.
    page.drawText(label, { x: (page.getWidth() - width) / 2, y: 20, size, font, color: FOOTER_INK });
  });
  doc.setTitle('My Cookbooks');
  return { bytes: await doc.save(), pages: doc.getPageCount() };
}

async function main() {
  if (!ORDERS.includes(args.order)) fail(`--order must be one of ${ORDERS.join(', ')}.`);
  const url = new URL(args.url);
  url.searchParams.set('order', args.order);

  const browser = await chromium
    .launch({ channel: 'chrome', headless: true })
    .catch(() => fail('Could not start Google Chrome, which this needs. Is it installed?'));

  try {
    const page = await browser.newPage();
    await page
      .goto(url.href, { waitUntil: 'load' })
      .catch(() => fail(`Could not open ${url.href}. Is the app running (npm start)?`));
    await page
      .waitForSelector('[data-book-ready]', { timeout: 30_000 })
      .catch(() => fail('The book never finished loading. Is the API running on 3152?'));
    await page.evaluate(() => document.fonts.ready);

    const anchors = await page.$$eval('[data-book-page]', (els) =>
      els.map((el) => el.getAttribute('data-book-page')),
    );
    let numbers = await destinationPages(await page.pdf(PDF_OPTIONS));
    const lost = anchors.filter((a) => !numbers.has(a));
    if (lost.length > 0) fail(`Chrome did not keep a link to ${lost.length} of the recipes (${lost.join(', ')}).`);

    // Writing the numbers in should move nothing, since their slots are
    // already wide enough; print until the pages agree, to be sure.
    let printed;
    for (let attempt = 0; attempt < 3 && !printed; attempt++) {
      await page.$$eval(
        '[data-book-page]',
        (els, map) => {
          for (const el of els) el.textContent = String(map[el.getAttribute('data-book-page')] ?? '');
        },
        Object.fromEntries(numbers),
      );
      const bytes = await page.pdf(PDF_OPTIONS);
      const after = await destinationPages(bytes);
      if (anchors.every((a) => after.get(a) === numbers.get(a))) printed = bytes;
      else numbers = after;
    }
    if (!printed) fail('The contents kept moving the recipes to other pages; no PDF was written.');

    const book = await stampFooters(printed);
    const out = resolve(args.out.replace(/^~(?=$|\/)/, homedir()));
    await writeFile(out, book.bytes);
    console.log(`${anchors.length} recipes on ${book.pages} pages, arranged by ${args.order}.`);
    console.log(`Wrote ${out}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => fail(err.stack ?? String(err)));
