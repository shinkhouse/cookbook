/**
 * Turns pasted recipe text into a draft, per design spec §6.4.
 *
 * The rules, in order:
 *   - the first non-empty line is the title
 *   - an "Ingredients" heading starts the ingredient section; "Steps",
 *     "Directions", "Instructions" or "Method" starts the steps section
 *   - before any heading, a line beginning with a digit or a bullet is an
 *     ingredient and anything else is a step
 *   - list markers (-, *, •, "1.") are stripped
 *
 * The split is a guess, which is why `confidence` exists: the UI shows
 * "Check the split" rather than claiming a clean parse when no heading was
 * found and the guess did the work.
 */

import { Ingredient } from './model/recipes.model';
import { parseIngredient } from './ingredient-parser';

export type ParseConfidence = 'empty' | 'guessed' | 'clean';

export interface RecipeDraft {
  title: string;
  ingredients: Ingredient[];
  steps: string[];
  confidence: ParseConfidence;
  /** Lines the ingredient parser flagged for a human to look at. */
  review: string[];
}

const INGREDIENT_HEADING = /^\s*#{0,4}\s*(ingredients|you(?:'ll)? need|shopping list)\s*:?\s*$/i;
const STEP_HEADING = /^\s*#{0,4}\s*(steps|directions|instructions|method|preparation)\s*:?\s*$/i;

/** A leading bullet or an ordered-list marker. */
const LIST_MARKER = /^\s*(?:[-*•‣·–]|\d{1,2}[.)])\s+/;

/** Front matter delimiters, for the markdown-file tab. */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** A GFM table row: `| cell | cell |`. */
const TABLE_ROW = /^\s*\|.*\|?\s*$/;

/** A table's alignment row: `| --- | :--: |`. Carries no content. */
const TABLE_DIVIDER = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

/** A thematic break, which is only a divider and never content. */
const THEMATIC_BREAK = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * Removes inline markdown, leaving the words.
 *
 * Necessary because an ingredient's name is *stored data*, not display markup:
 * without this, "- 1 cup **red lentils**" is saved as an ingredient literally
 * named "**red lentils**", and the asterisks turn up on the shopping list.
 * Nothing here renders markdown — it is stripped, so no HTML is ever bound.
 */
export function stripInlineMarkdown(text: string): string {
  return (
    text
      // Images before links: the image syntax contains the link syntax.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Bare autolinks.
      .replace(/<((?:https?|mailto):[^>]+)>/g, '$1')
      // Emphasis, longest marker first so ** is not read as two lots of *.
      .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|\W)\*([^*\s][^*]*)\*(?=\W|$)/g, '$1$2')
      .replace(/___([^_]+)___/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      // Underscore emphasis only at word edges, so "low_fat" survives intact.
      .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1$2')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim()
  );
}

/** Splits a pipe row into trimmed cells, dropping the leading/trailing empties. */
function cellsOf(row: string): string[] {
  return row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Which section a heading word names, if any. */
function sectionOf(text: string): 'ingredients' | 'steps' | null {
  if (INGREDIENT_HEADING.test(text)) return 'ingredients';
  if (STEP_HEADING.test(text)) return 'steps';
  return null;
}

/**
 * Rewrites a GFM table into the linear form the section parser already
 * understands, rather than teaching that parser about tables.
 *
 * This matters because a cookbook exported from Google Docs keeps each recipe
 * card in a table. Two shapes are handled:
 *
 *   Column-oriented — the header names the sections, so each column is one
 *   section and the cells below it are that section's lines:
 *       | Ingredients | Steps |
 *       | 1 cup rice  | Boil. |
 *
 *   Label-and-value — the first cell of each row names a section:
 *       | Ingredients | 1 cup rice |
 *
 * Anything else falls back to reading the cells in order, which is no worse
 * than treating the row as prose.
 */
function flattenTable(rows: string[][]): string[] {
  const out: string[] = [];
  if (rows.length === 0) return out;

  const header = rows[0];
  const headerSections = header.map(sectionOf);

  // Tested before the column shape because the two are otherwise ambiguous:
  // "| Ingredients | 1 lb beef |" has a section name in its first header cell
  // just as a column-oriented table does. What separates them is that here
  // *every* row starts with a section name, not only the first.
  const isLabelValue =
    rows.length > 1 &&
    rows.every((row) => row.length === 2 && sectionOf(row[0]) !== null);

  if (isLabelValue) {
    for (const [label, value] of rows) {
      out.push(label);
      out.push(...value.split(/<br\s*\/?>|\n/).map((c) => c.trim()).filter(Boolean));
    }
    return out;
  }

  if (headerSections.some((s) => s !== null) && rows.length > 1) {
    // Column-oriented: emit each column under its own heading, so the two
    // sections stay separate instead of interleaving row by row.
    header.forEach((name, column) => {
      const section = headerSections[column];
      if (section === null) return;
      out.push(name);
      for (const row of rows.slice(1)) {
        const cell = row[column];
        if (cell) out.push(...cell.split(/<br\s*\/?>|\n/).map((c) => c.trim()).filter(Boolean));
      }
    });
    return out;
  }

  for (const row of rows) {
    // Label-and-value: "| Ingredients | 1 cup rice |".
    if (row.length === 2 && sectionOf(row[0]) !== null) {
      out.push(row[0]);
      out.push(...row[1].split(/<br\s*\/?>|\n/).map((c) => c.trim()).filter(Boolean));
      continue;
    }
    for (const cell of row) {
      if (cell) out.push(cell);
    }
  }
  return out;
}

/**
 * Flattens markdown structure into plain content lines before the section
 * parser runs: tables become linear, dividers and comments go, and blockquote
 * markers are dropped while their words are kept.
 */
function normaliseLines(body: string): string[] {
  const out: string[] = [];
  let table: string[][] | null = null;

  const closeTable = () => {
    if (table) out.push(...flattenTable(table));
    table = null;
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();

    // A divider belongs to the table it sits inside, so it must not close it.
    if (TABLE_DIVIDER.test(line) && table) continue;

    if (TABLE_ROW.test(line)) {
      const cells = cellsOf(line);
      if (table) table.push(cells);
      else table = [cells];
      continue;
    }

    closeTable();

    if (!line) continue;
    if (THEMATIC_BREAK.test(line)) continue;
    // An HTML comment is never recipe content.
    if (/^<!--/.test(line)) continue;

    // A blockquote is usually a tip; keep the words, drop the marker.
    out.push(line.replace(/^>\s?/, ''));
  }

  closeTable();
  return out;
}

export function parseRecipeText(raw: string): RecipeDraft {
  const { body, meta } = splitFrontMatter(raw ?? '');
  const lines = normaliseLines(body);

  let title = meta.title ?? '';
  let section: 'unknown' | 'ingredients' | 'steps' = 'unknown';
  let sawHeading = false;

  const ingredientLines: string[] = [];
  const stepLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (INGREDIENT_HEADING.test(line)) {
      section = 'ingredients';
      sawHeading = true;
      continue;
    }
    if (STEP_HEADING.test(line)) {
      section = 'steps';
      sawHeading = true;
      continue;
    }

    // The first surviving line is the title, unless front matter supplied one.
    if (!title) {
      title = stripInlineMarkdown(stripMarkers(line).replace(/^#{1,6}\s*/, ''));
      continue;
    }

    // Inline markup is stripped here, before the line becomes stored data.
    const text = stripInlineMarkdown(stripMarkers(line));
    if (!text) continue;

    if (section === 'ingredients') {
      ingredientLines.push(text);
    } else if (section === 'steps') {
      stepLines.push(text);
    } else if (looksLikeIngredient(line)) {
      // No heading yet: a bullet or a leading amount reads as an ingredient.
      ingredientLines.push(text);
    } else {
      stepLines.push(text);
    }
  }

  const parsed = ingredientLines.map((line) => ({ line, result: parseIngredient(line) }));

  return {
    title,
    ingredients: parsed.map(({ result }) => ({
      qty: result.qty,
      unit: result.unit,
      name: result.name,
      aisle: result.aisle,
    })),
    steps: stepLines,
    confidence: confidenceOf(title, ingredientLines, stepLines, sawHeading),
    review: parsed.filter(({ result }) => result.needsReview).map(({ line }) => line),
  };
}

/** Front matter supplies title, servings and tags for the markdown tab (§6.4). */
export function splitFrontMatter(raw: string): {
  body: string;
  meta: { title?: string; servings?: number; tags?: string[] };
} {
  const match = FRONT_MATTER.exec(raw);
  if (!match) return { body: raw, meta: {} };

  const meta: { title?: string; servings?: number; tags?: string[] } = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^\s*([A-Za-z_-]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    const value = pair[2].replace(/^["']|["']$/g, '');

    if (key === 'title') meta.title = value;
    else if (key === 'servings' || key === 'serves') {
      const n = Number.parseInt(value, 10);
      if (Number.isFinite(n) && n > 0) meta.servings = n;
    } else if (key === 'tags') {
      meta.tags = value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return { body: raw.slice(match[0].length), meta };
}

/**
 * Reads schema.org Recipe JSON-LD out of pasted HTML or JSON (§6.4). Does not
 * fetch anything — that is an explicit non-goal.
 */
export function parseJsonLd(raw: string): RecipeDraft | null {
  const candidates: string[] = [];
  const scripts = raw.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of scripts) candidates.push(match[1]);
  if (candidates.length === 0) candidates.push(raw);

  for (const candidate of candidates) {
    const recipe = findRecipeNode(safeJson(candidate));
    if (recipe) return draftFromJsonLd(recipe);
  }
  return null;
}

function draftFromJsonLd(node: Record<string, unknown>): RecipeDraft {
  const ingredientLines = asStringArray(node['recipeIngredient']);
  const parsed = ingredientLines.map((line) => ({ line, result: parseIngredient(line) }));

  return {
    title: typeof node['name'] === 'string' ? node['name'] : '',
    ingredients: parsed.map(({ result }) => ({
      qty: result.qty,
      unit: result.unit,
      name: result.name,
      aisle: result.aisle,
    })),
    steps: instructionsOf(node['recipeInstructions']),
    // A structured source is authoritative; there is no guesswork to flag.
    confidence: ingredientLines.length || node['name'] ? 'clean' : 'empty',
    review: parsed.filter(({ result }) => result.needsReview).map(({ line }) => line),
  };
}

function instructionsOf(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|(?<=\.)\s{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const text = entry.trim();
      if (text) out.push(text);
    } else if (entry && typeof entry === 'object') {
      const node = entry as Record<string, unknown>;
      // HowToSection nests its own itemListElement.
      if (Array.isArray(node['itemListElement'])) {
        out.push(...instructionsOf(node['itemListElement']));
      } else if (typeof node['text'] === 'string' && node['text'].trim()) {
        out.push(node['text'].trim());
      } else if (typeof node['name'] === 'string' && node['name'].trim()) {
        out.push(node['name'].trim());
      }
    }
  }
  return out;
}

function findRecipeNode(value: unknown): Record<string, unknown> | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRecipeNode(entry);
      if (found) return found;
    }
    return null;
  }

  if (typeof value !== 'object') return null;
  const node = value as Record<string, unknown>;

  if (isRecipeType(node['@type'])) return node;
  // Publishers commonly wrap the recipe in an @graph.
  if (node['@graph']) return findRecipeNode(node['@graph']);
  return null;
}

function isRecipeType(type: unknown): boolean {
  if (typeof type === 'string') return type.toLowerCase() === 'recipe';
  if (Array.isArray(type)) return type.some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe');
  return false;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
}

function stripMarkers(line: string): string {
  return line.replace(LIST_MARKER, '').trim();
}

function looksLikeIngredient(line: string): boolean {
  if (LIST_MARKER.test(line)) return true;
  return /^\s*[\d¼-¾⅐-⅞]/.test(line);
}

function confidenceOf(
  title: string,
  ingredients: readonly string[],
  steps: readonly string[],
  sawHeading: boolean,
): ParseConfidence {
  if (!title && ingredients.length === 0 && steps.length === 0) return 'empty';
  // Without a heading the section split was inferred, so say so.
  if (!sawHeading) return 'guessed';
  return ingredients.length > 0 && steps.length > 0 ? 'clean' : 'guessed';
}

/** Slug from a title, matching the shape of the existing seed data. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9À-ɏ]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
