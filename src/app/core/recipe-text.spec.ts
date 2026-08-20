import {
  parseJsonLd,
  parseRecipeText,
  slugify,
  splitFrontMatter,
  stripInlineMarkdown,
} from './recipe-text';

describe('stripInlineMarkdown', () => {
  it('removes emphasis', () => {
    expect(stripInlineMarkdown('**red lentils**')).toBe('red lentils');
    expect(stripInlineMarkdown('_butter_')).toBe('butter');
    expect(stripInlineMarkdown('*olive oil*')).toBe('olive oil');
    expect(stripInlineMarkdown('***everything***')).toBe('everything');
    expect(stripInlineMarkdown('~~cancelled~~')).toBe('cancelled');
    expect(stripInlineMarkdown('`code`')).toBe('code');
  });

  it('keeps the text of a link and drops the target', () => {
    expect(stripInlineMarkdown('see [cold water](https://example.com) first')).toBe(
      'see cold water first',
    );
    expect(stripInlineMarkdown('![a photo](pic.jpg)')).toBe('a photo');
    expect(stripInlineMarkdown('<https://example.com>')).toBe('https://example.com');
  });

  it('leaves an underscore inside a word alone', () => {
    // The rule only fires at word edges, so product names survive.
    expect(stripInlineMarkdown('low_fat_cream')).toBe('low_fat_cream');
  });

  it('leaves plain text untouched', () => {
    expect(stripInlineMarkdown('2 tbsp dried onion')).toBe('2 tbsp dried onion');
  });

  it('handles emphasis mid-sentence', () => {
    expect(stripInlineMarkdown('Simmer **25 minutes**, until soft.')).toBe(
      'Simmer 25 minutes, until soft.',
    );
  });
});

describe('parseRecipeText — markdown', () => {
  it('strips inline markup before it becomes stored data', () => {
    const draft = parseRecipeText(
      ['# Dal', '## Ingredients', '- 1 cup **red lentils**', '- 2 tbsp _butter_', '## Steps', '1. Simmer **25 minutes**.'].join('\n'),
    );
    // The bug this guards: an ingredient stored as "**red lentils**", asterisks
    // and all, showing up that way on the shopping list.
    expect(draft.ingredients.map((i) => i.name)).toEqual(['red lentils', 'butter']);
    expect(draft.steps).toEqual(['Simmer 25 minutes.']);
    expect(draft.title).toBe('Dal');
  });

  it('reads a recipe written inside a table, as a Docs export produces', () => {
    // Google Docs keeps each recipe card in a table and exports it as GFM pipe
    // rows. Untreated, every row parsed as a step reading "| a | b |".
    const draft = parseRecipeText(
      [
        '# Weeknight Dal',
        '',
        '| Ingredients | Steps |',
        '| --- | --- |',
        '| 1 cup red lentils | Rinse the lentils. |',
        '| 2 tbsp butter | Simmer for 25 minutes. |',
      ].join('\n'),
    );
    const text = [...draft.ingredients.map((i) => i.name), ...draft.steps].join(' ');
    expect(text).not.toContain('|');
    expect(text).not.toContain('---');
    expect(draft.ingredients.map((i) => i.name)).toContain('red lentils');
    expect(draft.steps.some((s) => s.includes('Rinse the lentils'))).toBe(true);
  });

  it('never emits a table divider or a rule as content', () => {
    const draft = parseRecipeText(
      ['Soup', '| a |', '| :-: |', '---', '***', 'Ingredients', '- 1 onion', 'Steps', 'Boil.'].join('\n'),
    );
    for (const step of draft.steps) {
      expect(step).not.toMatch(/^[-*|:\s]+$/);
    }
    expect(draft.ingredients.map((i) => i.name)).toEqual(['onion']);
  });

  it('keeps the words of a blockquote and drops the marker', () => {
    const draft = parseRecipeText('Rice\nIngredients\n- 1 cup rice\nSteps\nBoil.\n> Serve hot.');
    expect(draft.steps).toEqual(['Boil.', 'Serve hot.']);
  });

  it('ignores an HTML comment', () => {
    const draft = parseRecipeText('Cake\n<!-- draft note -->\nIngredients\n- 1 egg\nSteps\nBake.');
    expect(draft.steps).toEqual(['Bake.']);
  });

  it('reads a label-and-value table, the other shape a card export takes', () => {
    const draft = parseRecipeText(
      [
        '# Grandmas Chili',
        '',
        '| Ingredients | 1 lb hamburger |',
        '| Steps | Brown the beef. |',
      ].join('\n'),
    );
    expect(draft.ingredients.map((i) => i.name)).toEqual(['hamburger']);
    expect(draft.steps).toEqual(['Brown the beef.']);
  });

  it('splits a cell that packs several lines behind <br>', () => {
    // Docs exports multi-line cells as <br>, which would otherwise arrive as
    // one very long ingredient.
    const draft = parseRecipeText(
      ['Dal', '| Ingredients | Steps |', '| --- | --- |', '| 1 cup lentils<br>2 tbsp butter | Rinse.<br>Simmer. |'].join('\n'),
    );
    expect(draft.ingredients.map((i) => i.name)).toEqual(['lentils', 'butter']);
    expect(draft.steps).toEqual(['Rinse.', 'Simmer.']);
  });

  it('keeps two tables separate rather than merging them', () => {
    const draft = parseRecipeText(
      [
        'Soup',
        '| Ingredients |',
        '| --- |',
        '| 1 onion |',
        '',
        'Steps',
        'Boil.',
      ].join('\n'),
    );
    expect(draft.ingredients.map((i) => i.name)).toEqual(['onion']);
    expect(draft.steps).toEqual(['Boil.']);
  });

  it('finds a heading even when it is written as a markdown heading in a cell', () => {
    const draft = parseRecipeText(
      ['Stew', '| ## Ingredients |', '| - 1 onion |', '| ## Steps |', '| Cook slowly. |'].join('\n'),
    );
    expect(draft.ingredients.map((i) => i.name)).toEqual(['onion']);
    expect(draft.steps).toEqual(['Cook slowly.']);
  });
});

describe('parseRecipeText', () => {
  it('is empty for empty input', () => {
    const draft = parseRecipeText('');
    expect(draft.confidence).toBe('empty');
    expect(draft.title).toBe('');
    expect(draft.ingredients).toEqual([]);
    expect(draft.steps).toEqual([]);
  });

  it('takes the first non-empty line as the title', () => {
    expect(parseRecipeText('\n\n  Tomato Soup\n\nSteps\nSimmer.').title).toBe('Tomato Soup');
  });

  it('splits on Ingredients and Steps headings', () => {
    const draft = parseRecipeText(
      ['Chili', 'Ingredients', '1 lb beef', '1 can beans', 'Steps', 'Brown the beef.', 'Simmer.'].join('\n'),
    );
    expect(draft.title).toBe('Chili');
    expect(draft.ingredients.map((i) => i.name)).toEqual(['beef', 'beans']);
    expect(draft.steps).toEqual(['Brown the beef.', 'Simmer.']);
    expect(draft.confidence).toBe('clean');
  });

  it('accepts Directions, Instructions and Method as the steps heading', () => {
    for (const heading of ['Directions', 'Instructions', 'Method']) {
      const draft = parseRecipeText(`Cake\nIngredients\n1 cup flour\n${heading}\nBake it.`);
      expect(draft.steps).withContext(heading).toEqual(['Bake it.']);
    }
  });

  it('strips bullets and ordered-list markers', () => {
    const draft = parseRecipeText(
      ['Salad', 'Ingredients', '- 2 tomatoes', '* 1 cucumber', '• 1 tsp salt', 'Steps', '1. Chop.', '2) Toss.'].join('\n'),
    );
    expect(draft.ingredients.map((i) => i.name)).toEqual(['tomatoes', 'cucumber', 'salt']);
    expect(draft.steps).toEqual(['Chop.', 'Toss.']);
  });

  it('guesses the split when there is no heading, and says it guessed', () => {
    const draft = parseRecipeText(
      ['Quick Eggs', '2 eggs', '1 tbsp butter', 'Whisk the eggs.', 'Cook gently.'].join('\n'),
    );
    // Lines opening with a digit read as ingredients, the rest as steps.
    expect(draft.ingredients.map((i) => i.name)).toEqual(['eggs', 'butter']);
    expect(draft.steps).toEqual(['Whisk the eggs.', 'Cook gently.']);
    expect(draft.confidence).toBe('guessed');
  });

  it('treats a bulleted line as an ingredient even without a leading amount', () => {
    const draft = parseRecipeText('Toast\n- butter\nToast the bread.');
    expect(draft.ingredients.map((i) => i.name)).toEqual(['butter']);
    expect(draft.steps).toEqual(['Toast the bread.']);
  });

  it('runs ingredients through the ingredient parser, aisles and all', () => {
    const draft = parseRecipeText('Dinner\nIngredients\n2 cups chicken broth\nSteps\nHeat.');
    expect(draft.ingredients[0]).toEqual({
      qty: 2,
      unit: 'cup',
      name: 'chicken broth',
      // The longest-match rule still applies: broth is pantry, not meat.
      aisle: 'pantry',
    });
  });

  it('reports lines the ingredient parser wants checked', () => {
    const draft = parseRecipeText('Pasta\nIngredients\nsalt + black pepper\nSteps\nBoil.');
    expect(draft.review).toEqual(['salt + black pepper']);
  });

  it('is not confident when a heading yielded only one section', () => {
    expect(parseRecipeText('Broth\nIngredients\n1 cup water').confidence).toBe('guessed');
  });

  it('ignores markdown heading hashes on the title and headings', () => {
    const draft = parseRecipeText('# Stew\n## Ingredients\n- 1 onion\n## Steps\nCook.');
    expect(draft.title).toBe('Stew');
    expect(draft.ingredients.map((i) => i.name)).toEqual(['onion']);
    expect(draft.steps).toEqual(['Cook.']);
  });
});

describe('splitFrontMatter', () => {
  it('reads title, servings and tags', () => {
    const { meta, body } = splitFrontMatter(
      ['---', 'title: Ramen', 'servings: 3', 'tags: [dinner, quick]', '---', 'Ingredients', '- 1 egg'].join('\n'),
    );
    expect(meta.title).toBe('Ramen');
    expect(meta.servings).toBe(3);
    expect(meta.tags).toEqual(['dinner', 'quick']);
    expect(body).toContain('Ingredients');
  });

  it('passes text through untouched when there is no front matter', () => {
    const raw = 'Just a title\nand a line';
    expect(splitFrontMatter(raw)).toEqual({ body: raw, meta: {} });
  });

  it('lets front matter supply the title so the first line stays content', () => {
    const draft = parseRecipeText(['---', 'title: Soup', '---', 'Ingredients', '- 1 onion', 'Steps', 'Boil.'].join('\n'));
    expect(draft.title).toBe('Soup');
    expect(draft.ingredients.map((i) => i.name)).toEqual(['onion']);
  });

  it('ignores a nonsense servings value', () => {
    expect(splitFrontMatter('---\nservings: lots\n---\nx').meta.servings).toBeUndefined();
  });
});

describe('parseJsonLd', () => {
  const recipe = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Pancakes',
    recipeIngredient: ['2 cups flour', '1 tsp salt'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Mix.' },
      { '@type': 'HowToStep', text: 'Fry.' },
    ],
  };

  it('reads a bare JSON-LD object', () => {
    const draft = parseJsonLd(JSON.stringify(recipe))!;
    expect(draft.title).toBe('Pancakes');
    expect(draft.ingredients.map((i) => i.name)).toEqual(['flour', 'salt']);
    expect(draft.steps).toEqual(['Mix.', 'Fry.']);
    expect(draft.confidence).toBe('clean');
  });

  it('finds the recipe inside a pasted HTML page', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body>x</body></html>`;
    expect(parseJsonLd(html)?.title).toBe('Pancakes');
  });

  it('finds the recipe inside an @graph wrapper', () => {
    const graph = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, recipe] };
    expect(parseJsonLd(JSON.stringify(graph))?.title).toBe('Pancakes');
  });

  it('handles @type given as an array', () => {
    const multi = { ...recipe, '@type': ['Recipe', 'NewsArticle'] };
    expect(parseJsonLd(JSON.stringify(multi))?.title).toBe('Pancakes');
  });

  it('flattens a HowToSection', () => {
    const sectioned = {
      ...recipe,
      recipeInstructions: [
        { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Mix.' }] },
        { '@type': 'HowToStep', text: 'Fry.' },
      ],
    };
    expect(parseJsonLd(JSON.stringify(sectioned))?.steps).toEqual(['Mix.', 'Fry.']);
  });

  it('accepts instructions given as one string', () => {
    const stringy = { ...recipe, recipeInstructions: 'Mix well.\nFry gently.' };
    expect(parseJsonLd(JSON.stringify(stringy))?.steps).toEqual(['Mix well.', 'Fry gently.']);
  });

  it('returns null for input with no recipe in it', () => {
    expect(parseJsonLd('<html><body>no recipe here</body></html>')).toBeNull();
    expect(parseJsonLd('{"@type":"WebPage"}')).toBeNull();
    expect(parseJsonLd('not json at all')).toBeNull();
  });
});

describe('slugify', () => {
  it('makes a URL-safe slug', () => {
    expect(slugify("Grandma's Spaghetti")).toBe('grandmas-spaghetti');
    expect(slugify('Sheet-Pan  Chicken!')).toBe('sheet-pan-chicken');
  });

  it('keeps accented characters, matching the existing seed slugs', () => {
    // The data already contains 'vanilla-crème-brûlée'.
    expect(slugify('Vanilla Crème Brûlée')).toBe('vanilla-crème-brûlée');
  });
});
