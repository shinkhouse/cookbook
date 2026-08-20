/**
 * Turns the extracted .docx tables into Recipe[] TypeScript for the seed data.
 *
 * Every judgement call is logged to a review report rather than applied
 * silently, because the source is an OCR'd family document and a good number of
 * lines need a human eye.
 */
const fs = require('fs');
const SP = '/private/tmp/claude-501/-Users-shinkhouse-Documents-Development-Projects/674da8ee-7491-4feb-8e78-f9db43917702/scratchpad';
const { parseIngredient } = require(SP + '/parser/ingredient-parser.js');

const raw = JSON.parse(fs.readFileSync(SP + '/extracted.json', 'utf8'));

// Already in the app, hand-curated with blurbs, photos and cooked counts.
// Skipped rather than overwritten.
const EXISTING = [
  "Grandma's Spaghetti", "Grandma's Chili", 'Spicy Shrimp Pasta in Tomato Cream Sauce',
  'Marry Me Chicken', 'Honey Buffalo Sauce', 'Mango Chutney Chicken Sheet Pan',
  'Sesame Garlic Ramen Noodles', 'Baked Chicken Parmesan', 'Stuffed Bell Peppers',
  'Vanilla Crème Brûlée', 'Homemade Mozzarella Sticks', 'Sausage Breakfast Casserole',
  'Red Chicken Enchiladas', 'Chicken Taco Baked Sweet Potatoes',
];
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const existing = new Set(EXISTING.map(norm));

const review = { skippedDuplicate: [], skippedTemplate: [], defaultedServings: [], splitLines: [], yields: [], groups: [], noSteps: [], inferredTags: [], rejoined: [], stepsCleaned: [] };

/** A group label, not an ingredient. */
function isGroup(line) {
  if (/\d/.test(line)) return false;
  // "For the marinade", "For the beef topping" — a heading, not something you
  // buy. Caught explicitly because it is neither all-caps nor colon-terminated.
  if (/^for the\b/i.test(line.trim()) && line.split(/\s+/).length <= 6) return true;
  const words = line.split(/\s+/);
  if (words.length < 1 || words.length > 6) return false;
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  if (/:$/.test(line.trim())) return true;
  const upper = [...letters].filter((c) => c === c.toUpperCase()).length / letters.length;
  return upper > 0.8;
}

/** Group labels that are really noise rather than a sub-component. */
const NOISE_GROUP = /^(ingredients|ingredients \(per serving\)|serving suggestions|staple ingredients|notes?|directions?|instructions?)\s*:?$/i;

function tidyGroup(label) {
  return label
    .replace(/:$/, '')
    .replace(/^for the\s+/i, '')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * A line holding several quantity starts lost its paragraph breaks in the
 * source document. Split before each amount that follows a letter.
 */
const SPLIT_AT = new RegExp(
  '(?<=[a-z)\\]*])\\s+(?=' + [
    // an amount followed by a unit or size word
    '\\d+(?:\\s*\\d*/\\d+)?\\s*(?:to\\s+\\d+\\s+)?(?:cups?|tbsps?|tsps?|teaspoons?|tablespoons?|oz|ounces?|lbs?|pounds?|cloves?|medium|small|large|cans?|sprigs?|bunch)\\b',
    // a range with no unit: "1 to 2 serrano peppers"
    '\\d+\\s+to\\s+\\d+\\s+[a-z]',
    // a count whose unit trails the noun: "4 garlic cloves"
    '\\d+\\s+[a-z]+\\s+cloves?\\b',
  ].join('|') + ')',
  'gi',
);

function splitRunTogether(line, title) {
  if (line.length <= 90) return [line];
  const parts = line.split(SPLIT_AT).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    review.splitLines.push({ title, from: line, into: parts });
  }
  return parts;
}

const SERVINGS = [
  /\bserves?\s+(\d+)\s*(?:to|[-–])\s*(\d+)/i,
  /\bserves?\s+(\d+)/i,
  /\b(\d+)\s*[-–]\s*(\d+)\s+servin/i,
  /\b(\d+)\s+servin/i,
  /\byields?\s*:?\s*(\d+)\s*(?:to|[-–])\s*(\d+)/i,
  /\byields?\s*:?\s*(\d+)/i,
];

/** "MAKES 2 CUPS" is a yield, not a serving count. */
const YIELD_ONLY = /\bmakes\s+[\d½¼¾\s/-]+\s*(cups?|quarts?|pints?|oz|ounces?|liters?|ml|g|dozen|loaves|loaf)\b/i;

function readServings(lines, title) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (YIELD_ONLY.test(line)) {
      review.yields.push({ title, line });
      return { servings: null, dropIndex: i, yieldNote: line.trim() };
    }
    for (const pat of SERVINGS) {
      const m = pat.exec(line);
      if (m) {
        const nums = m.slice(1).filter(Boolean).map(Number).filter((n) => n > 0 && n < 100);
        if (nums.length) return { servings: Math.max(...nums), dropIndex: i, yieldNote: null };
      }
    }
  }
  return { servings: null, dropIndex: null, yieldNote: null };
}

/**
 * Tags are inferred only where they are mechanically derivable — the protein
 * from the parsed ingredient aisles, and a cuisine only when the title names it
 * outright. Everything else is left untagged rather than guessed; the review
 * report lists what was inferred.
 */
const CUISINE = [
  ['thai', /\bthai\b|pad thai/i], ['mexican', /\bmexican|tatemada|tomatillo|elote|pico de gallo|mojo|enchilada|bulgogi?!/i],
  ['italian', /\bitalian|bolognese|alfredo|diavolo|parmesan|orzo\b/i], ['chinese', /\bchinese|szechuan|dan dan|gong bao|kung pao|bulgogi?!/i],
  ['korean', /\bkorean|bulgogi\b/i], ['french', /\bcoq au vin|bourguignon|au poivre|madeleine|poulet\b/i],
  ['cajun', /\bgumbo|andouille\b/i], ['cuban', /\bcuban\b/i], ['indian', /\blassi|curry\b/i],
];
const DISH = [
  ['soup', /\bsoup|gumbo|chili\b/i], ['pasta', /\bpasta|noodles?|bolognese|orzo|bucatini|diavolo\b/i],
  ['salsa', /\bsalsa|pico de gallo\b/i], ['dessert', /\btart|cookies|cookie|brûlée|brulee|lassi\b/i],
  ['sauce', /\bsauce|reduction\b/i], ['rice', /\brice\b/i],
];
const PROTEIN_FROM_NAME = [
  ['chicken', /\bchicken\b/i], ['beef', /\bbeef|brisket|chuck|steak|ribeye|short rib\b/i],
  ['pork', /\bpork|bacon|andouille|sausage|prosciutto\b/i], ['shrimp', /\bshrimp|prawn\b/i],
  ['salmon', /\bsalmon\b/i], ['fish', /\bcod|trout|barramundi|bass|haddock\b/i],
];

function inferTags(title, subtitle, ingredients) {
  const hay = `${title} ${subtitle}`;
  const ingHay = ingredients
    .map((i) => i.name)
    .filter((n) => !/\b(broth|stock|bouillon)\b/i.test(n))
    .join(' ');
  const tags = new Set();
  for (const [tag, re] of CUISINE) if (re.test(hay)) tags.add(tag);
  for (const [tag, re] of DISH) if (re.test(hay)) tags.add(tag);
  for (const [tag, re] of PROTEIN_FROM_NAME) {
    if (re.test(hay) || re.test(ingHay)) tags.add(tag);
  }
  return [...tags].sort();
}

/**
 * Words that stay lowercase inside a title, unless they lead it.
 */
const SMALL_WORDS = new Set([
  'a','an','and','as','at','but','by','de','en','for','from','in','la','le','of',
  'on','or','the','to','with','w','au','aux','du','et','y',
]);

/**
 * Re-cases a title that the source document set in capitals.
 *
 * The source document sets some titles in full capitals and others in sentence
 * case, so they are normalised to one convention rather than left inconsistent.
 *
 * CSS cannot do this: `text-transform: capitalize` uppercases the first letter
 * of each word but never lowercases the rest, so "LA TATEMADA CREMOSA" would
 * survive it untouched. It has to happen in the data.
 *
 * Small words stay small unless they lead the title, which is what keeps
 * "Coq au Vin" and "Pico de Gallo" reading correctly.
 */
function titleCase(title) {
  if (!/[A-Za-z]/.test(title)) return title;

  const words = title.toLowerCase().split(/(\s+)/);
  let wordIndex = 0;
  return words
    .map((token) => {
      if (/^\s+$/.test(token)) return token;
      const i = wordIndex++;
      // Keep a small word small unless it opens or closes the title.
      const bare = token.replace(/[^a-z]/g, '');
      if (i > 0 && SMALL_WORDS.has(bare)) return token;
      // Capitalise every alphabetic run in the token, so a hyphenated compound
      // reads "Pan-Seared" rather than "Pan-seared", and a bracketed word
      // reads "(Salsa)". The apostrophe stays inside a run so "xie's" becomes
      // "Xie's" and not "Xie'S".
      return token.replace(
        /[a-zà-ÿ][a-zà-ÿ'’]*/g,
        (w) => w.charAt(0).toUpperCase() + w.slice(1),
      );
    })
    .join('');
}

/** A paragraph that is only a step label: "Step 1", "STEP 2.". */
const BARE_STEP_LABEL = /^(?:step|stage|part|direction)\s*\.?\s*\d+\s*[:.)]?$/i;

/** A redundant section header inside the steps cell. */
const STEP_SECTION_HEADER = /^(?:directions?|instructions?|method|preparation|steps?)\s*:?$/i;

/** A phase label whose text follows on the next line: "Marinate:", "Sear:". */
const PHASE_LABEL = /^[A-Z][A-Za-z &,'’()-]{1,32}:$/;

/** "Serves 4." sitting among the steps. */
const SERVES_LINE = /^serves?\s+(\d+)\s*\.?$/i;

/**
 * Whether a step is finished, or was cut off mid sentence.
 *
 * Some recipes in the source are hard-wrapped at about fifty characters, so a
 * single step arrives as five paragraphs broken mid-clause. A line that does not
 * end on sentence punctuation is unfinished, and the line after it is its
 * continuation rather than a step of its own.
 */
function isUnterminated(line) {
  return !/[.!?:;]["'”’)]?$/.test(line.trim());
}

/** A line that reads as the tail of the sentence above it. */
function continuesPrevious(line) {
  return /^[a-z(]/.test(line) || /^\)/.test(line) || /^\d+[a-z]/.test(line);
}

/**
 * Cleans the step list.
 *
 * The source document numbers its steps with a standalone "Step 1" paragraph
 * followed by the text, so a naive read produces alternating label and content
 * lines and the page renders "1. Step 1" / "2. <the actual step>". The
 * numbering is already rendered from the list index, so a bare label carries
 * nothing and is dropped.
 */
function cleanSteps(lines, title) {
  const out = [];
  let pendingLabel = null;
  let servesFound = null;
  let dropped = 0;

  for (const raw of lines) {
    const line = raw.replace(/^\s*\d{1,2}\s*[.)]\s*/, '').trim();
    if (!line) continue;

    if (BARE_STEP_LABEL.test(line) || STEP_SECTION_HEADER.test(line)) { dropped++; continue; }

    const serves = SERVES_LINE.exec(line);
    if (serves) { servesFound = Number(serves[1]); dropped++; continue; }

    // A phase label belongs to the step it introduces, so hold it and prefix.
    if (PHASE_LABEL.test(line)) { pendingLabel = line; continue; }

    // A continuation belongs to the step above it, whether it was stranded on
    // its own or is one of several mid-sentence wraps.
    if (
      out.length > 0 &&
      !pendingLabel &&
      isUnterminated(out[out.length - 1]) &&
      continuesPrevious(line)
    ) {
      out[out.length - 1] = `${out[out.length - 1]} ${line}`.replace(/\s+/g, ' ');
      dropped++;
      continue;
    }

    out.push(pendingLabel ? `${pendingLabel} ${line}` : line);
    pendingLabel = null;
  }

  // A label with nothing after it still beats losing it.
  if (pendingLabel) out.push(pendingLabel.replace(/:$/, ''));

  if (dropped) review.stepsCleaned.push({ title, dropped });
  out.servesFound = servesFound;
  return out;
}

function slugify(t) {
  return t.toLowerCase().trim().replace(/['’]/g, '').replace(/[^a-z0-9À-ɏ]+/g, '-').replace(/^-+|-+$/g, '');
}

const esc = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const round = (n) => String(Math.round(n * 1000) / 1000);

const out = [];
const usedSlugs = new Set();

for (const rec of raw) {
  const title = titleCase(rec.title.replace(/\s+/g, ' ').replace(/-\s+/g, '-').trim());

  if (/recipe template/i.test(title)) { review.skippedTemplate.push(title); continue; }
  if (existing.has(norm(title))) { review.skippedDuplicate.push(title); continue; }

  // ---- subtitle, which sometimes carries the serving count instead ----
  let subtitle = (rec.subtitle || '').trim();
  let servingsFromSub = null;
  if (subtitle) {
    for (const pat of SERVINGS) {
      const m = pat.exec(subtitle);
      if (m) {
        const nums = m.slice(1).filter(Boolean).map(Number).filter((n) => n > 0 && n < 100);
        if (nums.length) { servingsFromSub = Math.max(...nums); subtitle = subtitle.replace(pat, '').trim(); }
        break;
      }
    }
  }
  if (/^(optional description|image)?$/i.test(subtitle)) subtitle = '';

  // ---- servings ----
  const lines = [...rec.ingredientLines];
  const { servings: found, dropIndex, yieldNote } = readServings(lines, title);
  if (dropIndex !== null) lines.splice(dropIndex, 1);
  let servings = servingsFromSub ?? found;
  if (!servings) { servings = 4; review.defaultedServings.push(title); }

  // ---- ingredients, carrying their sub-group ----
  const notes = [];
  if (yieldNote) notes.push(yieldNote);

  const ingredients = [];
  let group = null;
  let inTrailingProse = false;

  for (const line of lines) {
    if (isGroup(line)) {
      if (/serving suggestions/i.test(line)) { inTrailingProse = true; group = null; continue; }
      if (NOISE_GROUP.test(line.trim())) { group = null; continue; }
      group = tidyGroup(line);
      review.groups.push({ title, group });
      continue;
    }
    // Prose that follows a "SERVING SUGGESTIONS" header is a note, not an item.
    if (inTrailingProse) { notes.push(line); continue; }

    for (const piece of splitRunTogether(line, title)) {
      const normalised = piece.replace(/(\d)\s*-\s*(?=[A-Za-z])/g, '$1 ');
      const p = parseIngredient(normalised);
      const name = p.name.trim();
      if (!name) continue;
      // "(12 oz/342 g), cored and left whole" is the tail of the line above,
      // wrapped onto its own paragraph in the source. Re-join it rather than
      // storing it as an ingredient of its own.
      if (p.qty === null && /^\(/.test(name) && ingredients.length > 0) {
        const prev = ingredients[ingredients.length - 1];
        prev.name = `${prev.name} ${name}`.replace(/\s+/g, ' ').trim();
        review.rejoined.push({ title, onto: prev.name });
        continue;
      }
      // "½ cup (1 stick) unsalted butter" parses correctly but leaves the
      // name opening on a duplicate measure. Move it to the end so the name
      // reads as a name — nothing is discarded.
      let tidy = name;
      const lead = /^\(([^)]*)\)\s*(.+)$/.exec(name);
      if (lead && lead[2].trim()) {
        tidy = `${lead[2].trim()} (${lead[1].trim()})`;
      }

      const ing = { qty: p.qty, unit: p.unit, name: tidy, aisle: p.aisle };
      if (group) ing.group = group;
      ingredients.push(ing);
    }
  }

  // ---- steps ----
  const steps = cleanSteps(rec.stepLines, title);
  if (steps.length === 0) review.noSteps.push(title);

  // "Serves 4." sometimes hides among the steps rather than the ingredients.
  if (!servingsFromSub && !found && steps.servesFound) {
    servings = steps.servesFound;
    review.defaultedServings.splice(review.defaultedServings.indexOf(title), 1);
  }

  if (ingredients.length === 0) continue;

  let slug = slugify(title) || 'untitled';
  if (usedSlugs.has(slug)) { let n = 2; while (usedSlugs.has(`${slug}-${n}`)) n++; slug = `${slug}-${n}`; }
  usedSlugs.add(slug);

  const tags = inferTags(title, subtitle, ingredients);
  if (tags.length) review.inferredTags.push({ title, tags });

  out.push({ slug, title, subtitle, tags, servings, ingredients, steps, notes });
}

// ---- emit TypeScript ----
const body = out.map((r) => {
  const L = ['  {'];
  L.push(`    slug: ${esc(r.slug)},`);
  L.push(`    title: ${esc(r.title)},`);
  if (r.subtitle) L.push(`    subtitle: ${esc(r.subtitle)},`);
  L.push(`    tags: [${r.tags.map(esc).join(', ')}],`);
  L.push(`    time: '',`);
  L.push(`    servings: ${r.servings},`);
  L.push(`    cooked: 0,`);
  L.push(`    blurb: '',`);
  L.push(`    desc: '',`);
  L.push('    ingredients: [');
  for (const i of r.ingredients) {
    const q = i.qty === null ? 'null' : round(i.qty);
    const g = i.group ? `, group: ${esc(i.group)}` : '';
    L.push(`      { qty: ${q}, unit: ${esc(i.unit)}, name: ${esc(i.name)}, aisle: ${esc(i.aisle)}${g} },`);
  }
  L.push('    ],');
  L.push('    steps: [');
  for (const s of r.steps) L.push(`      ${esc(s)},`);
  L.push('    ],');
  L.push('    notes: [');
  for (const n of r.notes) L.push(`      ${esc(n)},`);
  L.push('    ],');
  L.push('  },');
  return L.join('\n');
}).join('\n');

const header = `import { Recipe } from '../model/recipes.model';

/**
 * The Hinkhouse/Stokes family cookbook, imported from the Google Docs export
 * (revised 09/21/2025).
 *
 * Generated from the .docx rather than the .md export: markdown tables cannot
 * hold newlines, so the .md had collapsed every ingredient of a recipe into one
 * unbroken string. In the .docx each ingredient is still its own paragraph.
 *
 * Amounts and aisles come from core/ingredient-parser. The source is an OCR'd
 * document, so expect typos in the prose — they are reproduced faithfully rather
 * than guessed at. See docs for the import review notes.
 *
 * Fields the source does not carry: \`time\`, \`blurb\`, \`desc\`, \`photo\`, and
 * \`cooked\`. They are left empty rather than invented.
 */
export const ImportedRecipes: Recipe[] = [
`;

fs.writeFileSync(SP + '/imported-recipes.ts', header + body + '\n];\n');
fs.writeFileSync(SP + '/review.json', JSON.stringify(review, null, 1));

console.log(`imported: ${out.length} recipes`);
console.log(`  skipped duplicates: ${review.skippedDuplicate.length}  ${review.skippedDuplicate.join(', ')}`);
console.log(`  skipped templates:  ${review.skippedTemplate.length}`);
console.log(`  servings defaulted to 4: ${review.defaultedServings.length}`);
console.log(`  yields moved to notes:   ${review.yields.length}`);
console.log(`  run-together lines split: ${review.splitLines.length}`);
console.log(`  recipes with sub-groups:  ${new Set(review.groups.map((g) => g.title)).size}`);
console.log(`  recipes with no steps:    ${review.noSteps.length}  ${review.noSteps.join(', ')}`);
console.log(`  total ingredients:        ${out.reduce((n, r) => n + r.ingredients.length, 0)}`);
console.log(`  untagged recipes:         ${out.filter((r) => r.tags.length === 0).length}`);
