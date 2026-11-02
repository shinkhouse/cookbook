# Cookbook Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved roadmap, everything but Share. Phase A is kitchen and authoring features that need no new writes from the live site. Phase B is a passcode-gated write path for notes, mark as cooked, and favorites.

**Architecture:**
- **Phase A.** Mostly pure frontend modules in `src/app/core/` (`units.ts`, `ingredient-key.ts`, `list-merge.ts`, `step-ingredients.ts`, `pantry.ts`, `wake-lock.ts`), wired into the existing stores and pages. One new API route, `POST /import/photo`, calls Claude through `@anthropic-ai/sdk`.
- **Phase B.** A `requireDevice` gate on the API with three narrow, atomic Mongo endpoints. On the frontend, a `DeviceStore` holds the passcode, and `RecipeStore` gains `canSave` and three device write methods.

**Tech Stack:**
- Frontend: Angular 21 (standalone, zoneless, signals), Angular Material, Karma/Jasmine.
- API: Express 4 on Node 22, CommonJS, MongoDB driver 5.6, multer 1.4.5-lts.1, sharp 0.32, zod 4.6.7, Jest/supertest. `@anthropic-ai/sdk` is new.

**Spec:** `docs/superpowers/specs/2026-11-02-cookbook-roadmap-design.md`. Its "Planner calls" section holds the decisions that `decisions.md` left open; read it before starting.

## Global Constraints

- **Frontend repo:** `/Users/shinkhouse/Documents/Development-Projects/cookbook`. Tasks tagged **FE**.
- **API repo:** `/Users/shinkhouse/Documents/Development-Projects/api.samuelhinkhouse.com`. Tasks tagged **API**.
- **Git:**
  - Both repos are on `feat/cookbook-roadmap`. Stay on it.
  - Commit per task. Never push. Never pass `-c user.*` or change git identity.
- **Secrets:**
  - Never read, print, source or commit `.env`. To check a key exists, run `grep -c '^KEYNAME=' .env` and nothing else.
  - `ANTHROPIC_API_KEY` and `RECIPES_DEVICE_KEY` are not set yet; Sam adds them.
- **Ports and data:**
  - Never stop or bind 3152, 4200, 4300 or 4310. For checks, use 3153 (API) and 4320 (`ng serve --port 4320`), and kill only PIDs you started.
  - No writes to the real database during checks.
- **Frontend style:**
  - 2-space indent in TS and HTML; match each SCSS file (4-space where it uses it). Single quotes.
  - Doc comments explain *why*, in the voice of the existing files.
  - Font sizes use `--text-*` tokens and colours use colour tokens (`--ink*`, `--paper`, …). No hard-coded colours.
  - Respect `prefers-reduced-motion` for any new transition.
- **API style:** CommonJS, 4-space indent. Error bodies are fixed strings that never echo driver, fetch or SDK messages; log host or code and reason only.
- **Test commands:**
  - Frontend, full: `npx ng test --watch=false --browsers=ChromeHeadless`.
  - Frontend, one spec: add `--include='<path>'`.
  - API: `npx jest`, or `npx jest <file> -t '<name>'`.
- **Baselines:** the frontend has 460 passing and 2 failing until Task 1, then 0 failures always. The API has 318 passing and 0 failing. Any other failure is a regression.
- **Long runs:** run the full frontend suite in the background and post status rather than going silent.
- **UI work:** verify by rendering. Serve on 4320 and take Playwright screenshots at 390 px and 1280 px. Hand Sam the screenshots, never his device.

## Review Focus

1. **Merged-row checks across cart changes.** Check a merged row, then add a recipe that contributes to it: the row must come back unchecked. Remove that recipe again: the row is checked again. A shared component under two parents yields one merged row with two sources. (Task 3: tests `unchecks a merged row when a new recipe adds to it` and `rechecks it when that recipe leaves`.)
2. **Units the converter must not touch.** "small can", "pinch", "heaping tbsp", `''` and `null` qty must pass through unchanged in both systems. A metric recipe in metric mode must not be re-rounded. (Task 2: `leaves unmeasurable and qualified units alone` and `does not round a unit already in the target system`.)
3. **Device gate bypasses.** All of these must be refused:
   - No Origin.
   - A disallowed Origin with the right key.
   - `RECIPES_DEVICE_KEY` unset or empty.
   - The right key during a lockout.
   - A full PUT `/recipes/:slug` sent with only `x-device-key`.

   (Task 15: `refuses even the right key while locked out`; Task 17: `keeps the full edit surface local-only`.)
4. **Edits erasing device data.** A local edit (full PUT) of a recipe carrying `lastCooked` and `favorite` must keep both. (Task 19: `round-trips lastCooked through a PUT`; Task 22: `round-trips favorite through a PUT`.)
5. **Favorites migration re-adding removed favorites.** A device with no stored list must push nothing when the server already has favorites. A failed push must leave the flag unset, so the migration runs again. (Task 23: `pushes nothing from a device with no stored list once the server has favorites` and `retries next time when a push fails`.)

---

## File map

**FE — new files**
- `src/app/core/units.ts`: unit table, conversion and kitchen rounding.
- `src/app/core/ingredient-key.ts`: name head, descriptor strip, singular, key.
- `src/app/core/list-merge.ts`: merge list sources into rows and sum amounts.
- `src/app/core/step-ingredients.ts`: the ingredients a step mentions.
- `src/app/core/pantry.ts`: staples, parsing the "have" list, coverage.
- `src/app/core/wake-lock.ts`: the `ScreenWakeLock` class.
- `src/app/core/stores/device.store.ts`
- `src/app/core/favorites-migration.ts`
- `src/app/device-unlock/device-unlock.component.{ts,html,scss}`

Each new file gets a `.spec.ts` beside it.

**FE — changed files**
- `core/model/recipes.model.ts`, `core/aisle.ts` (export `containsWord`), `core/facets.ts`, `core/import-client.ts`, `core/recipe-repository.ts`, `core/testing/fake-repositories.ts`, `core/write-error.ts`.
- Stores: `list.store.ts`, `prefs.store.ts`, `recipe.store.ts`.
- Pages: `library`, `shopping-list`, `recipe-detail`, `cook-mode`, `create-recipe`.
- App shell: `app.component.{ts,html,scss}`, `styles.scss`.

**API — new files**
- `import/read-photo.js`
- `middleware/require-device.js`
- `routes/device.js`

Each gets a test in `test/`.

**API — changed files**
- `middleware/require-local-write.js` (export `isLocalWrite`), `routes/import.js`, `routes/recipes.js`, `recipes.repository.js`, `recipes.validation.js`, `index.js`, `test/fake-recipe-repository.js`, `package.json`.
- Docs: `docs/import-api.md` and `docs/recipes-api.md`, plus a new `docs/device-api.md`.

---

# Phase A

### Task 1 (FE): Make the two failing specs match the data (item 15)

**Files:**
- Modify: `src/app/core/mock/recipes.mock.spec.ts:42-56`
- Modify: `src/app/core/recipe-health.spec.ts:110-117`

All 72 recipes now have at least 2 steps; `shrimp-and-pasta`, `grandmas-chili` and `honey-buffalo-sauce` were written up. Strengthen the specs rather than loosen them.

- [ ] **Step 1: Run the two specs and confirm they fail**

Run each spec with `--include='src/app/core/mock/recipes.mock.spec.ts'` and `--include='src/app/core/recipe-health.spec.ts'`.
Expected: one failure in each.

- [ ] **Step 2: Rewrite both tests**

```ts
it('gives every imported recipe its steps', () => {
  for (const r of ImportedRecipes) {
    expect(r.steps.length).withContext(r.slug).toBeGreaterThan(0);
  }
});
```

```ts
it('finds no recipe without a method now that the last three were written up', () => {
  const none = Recipes.filter((r) => gapsOf(r).needsMethod).map((r) => r.slug);
  expect(none).toEqual([]);
});
```

`gapsOf`'s synthetic test, `flags a recipe with no method at all`, still pins detection.

- [ ] **Step 3: Run the full suite**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: `462 SUCCESS`, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/mock/recipes.mock.spec.ts src/app/core/recipe-health.spec.ts
git commit -m "test: pin that every recipe now has a method"
```

### Task 2 (FE): Unit table and conversion (`units.ts`)

**Files:**
- Create: `src/app/core/units.ts`
- Create: `src/app/core/units.spec.ts`

**Interfaces:**
- Produces:
  - `export type UnitSystem = 'us' | 'metric';`
  - `export type Dimension = 'volume' | 'weight';`
  - `export interface Measure { qty: number; unit: string }`
  - `export function measurable(unit: string): { dimension: Dimension; system: UnitSystem; base: number } | null`. `base` is ml or g per unit. The lookup is on the exact unit only, so `'small can'` and `'heaping tbsp'` give `null`.
  - `export function bestUnit(baseAmount: number, dimension: Dimension, system: UnitSystem): Measure`, rounded.
  - `export function convertMeasure(m: Measure, system: UnitSystem): Measure`. Returns `m` unchanged when the unit is not measurable or already in `system`.
  - `export function formatMeasure(m: Measure): string`. Metric units render as trimmed decimals, everything else through `formatQty`. A unitless measure renders as the number alone.

Table, in ml or g per unit:

| Unit | Dimension | System | Base |
|---|---|---|---|
| `tsp` | volume | us | 4.92892 |
| `tbsp` | volume | us | 14.7868 |
| `cup` | volume | us | 236.588 |
| `pint` | volume | us | 473.176 |
| `quart` | volume | us | 946.353 |
| `gallon` | volume | us | 3785.41 |
| `ml` | volume | metric | 1 |
| `l` | volume | metric | 1000 |
| `oz` | weight | us | 28.3495 |
| `lb` | weight | us | 453.592 |
| `g` | weight | metric | 1 |
| `kg` | weight | metric | 1000 |

`bestUnit` rules:

```text
US volume:  ml >= 59.147 → cup; ml >= 14.7868 → tbsp; else tsp
US weight:  g >= 453.592 → lb; else oz
US rounding: whole + nearest of [0, 1/8, 1/4, 1/3, 3/8, 1/2, 5/8, 2/3, 3/4, 7/8, 1]
Metric volume: ml >= 1000 → l (round to 0.05); else ml (<10 → 0.5, <100 → 5, else 10)
Metric weight: g >= 1000 → kg (round to 0.05); else g (<10 → 0.5, <100 → 1, else 5)
Never round a positive amount to 0: use the smallest step instead.
```

- [ ] **Step 1: Write the failing tests**

```ts
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
it('formats metric as decimals and US as fractions', () => {
  expect(formatMeasure({ qty: 1.15, unit: 'kg' })).toBe('1.15 kg');
  expect(formatMeasure({ qty: 1.5, unit: 'cup' })).toBe('1½ cup');
  expect(formatMeasure({ qty: 3, unit: '' })).toBe('3');
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run with `--include='src/app/core/units.spec.ts'`.
Expected: FAIL, because the module cannot be found.

- [ ] **Step 3: Implement `units.ts`** per the interfaces and rules above.

- [ ] **Step 4: Run them and confirm they pass**

Same command. Expected: all pass.

- [ ] **Step 5: Commit** — `feat(core): unit table and US/metric conversion`

### Task 3 (FE): Merge duplicate ingredients on the shopping list (item 1)

**Files:**
- Create: `src/app/core/ingredient-key.ts`, `src/app/core/list-merge.ts`, and a spec for each.
- Modify: `src/app/core/stores/list.store.ts`
- Modify: `src/app/pages/shopping-list/shopping-list.component.{ts,html}`
- Modify: `src/app/core/stores/stores.spec.ts`. Rewrite these three tests, because their behaviour is deliberately reversed:
  - ListStore `keeps a duplicate ingredient from two recipes as two rows` (`:781`)
  - "component shared by two parents" `gives each parent its own rows with distinct keys` (`:1018`)
  - the same block's `checks one copy without the other` (`:1024`)

  Every other ListStore test must keep passing unchanged.

**Interfaces:**
- Consumes (Task 2): `measurable`, `bestUnit`, `formatMeasure`.
- Produces from `ingredient-key.ts`:
  - `export function ingredientHead(name: string): string`. The text before the first comma, with parentheticals removed, lowercased and whitespace collapsed.
  - `export function stripDescriptors(head: string): string`. Drops leading `small|medium|large|fresh|chopped|diced|minced|sliced`.
  - `export function singular(word: string): string`. Rules, in order:
    - Words in `INVARIANT = ['molasses', 'hummus', 'asparagus', 'couscous', 'swiss']` are returned unchanged.
    - `-ies` (length over 4) becomes `-y`.
    - `-oes` becomes `-o`.
    - `-ches`, `-shes`, `-xes` and `-zes` lose the `es`.
    - Otherwise a trailing `s` is dropped when the word is longer than 3 characters and does not end in `ss`, `us` or `is`.
  - `export function ingredientKey(name: string): string`. Equal to `singular`-on-last-word of `stripDescriptors(ingredientHead(name))`.
- Produces from `list-merge.ts`:
  - `export interface ListSource { owner: string; index: number; ingredient: Ingredient; recipeTitle: string }`
  - `export interface MergedLine { key: string; name: string; aisle: Aisle; amount: string; sources: ListSource[] }`
  - `export function sumAmounts(items: readonly { qty: number | null; unit: string }[]): string`
  - `export function mergeSources(sources: readonly ListSource[]): MergedLine[]`. Output is in first-seen order.
    - `key` is `'name:' + ingredientKey`, or `` `${owner}:${index}` `` when the key is `''`.
    - `name`:
      - A single source keeps its original `ingredient.name`.
      - A merged row uses `stripDescriptors(ingredientHead(first.name))`.
    - `aisle` is the first source's aisle.
- Produces from `ListStore` (changed):
  - `ListRow` becomes `{ key: string; name: string; amount: string; aisle: Aisle | 'other'; sources: ListSource[]; sourceTitles: string[]; bought: boolean; extraId?: string }`.
  - `toggleRow(row: ListRow): void`
  - `toggleBought(slug, index)`, `isBought(slug, index)` and `boughtKey(slug, index)` keep their signatures and meaning as per-source primitives.

`sumAmounts` algorithm:

```text
entries = items with qty !== null; if none → ''
bucket id per entry: measurable(unit)?.dimension ?? (unit === '' ? 'count' : 'other:' + unit.toLowerCase())
for each bucket in first-seen order:
  if every entry has the same unit → total = Σqty, unit unchanged
  else (volume/weight only can differ) → base = Σ qty·base(unit);
       system = 'us' if any entry's unit is US else 'metric'; total = bestUnit(base, dimension, system)
render each bucket with formatMeasure; join with ' + '
```

Bought state: `row.bought = sources.every((s) => bought.has(boughtKey(s.owner, s.index)))`. `toggleRow` clears all of the row's source keys when it is bought, and otherwise adds all of them. `groups`, `totalItems` and `boughtCount` count merged rows.

- [ ] **Step 1: Write the failing tests**

`ingredient-key.spec.ts`:
- `ingredientKey('Onions, diced')` is `'onion'`.
- `ingredientKey('2 large tomatoes (12 oz/342 g)')`: the parser has already removed qty, so call it with `'large tomatoes (12 oz/342 g)'`. Expect `'tomato'`.
- `singular('berries')` is `'berry'`, `singular('peaches')` is `'peach'`, and `singular('molasses')` is `'molasses'`.
- `ingredientKey('Ground beef')` is `'ground beef'`.

`list-merge.spec.ts`:

```ts
it('sums the same unit without converting', () =>
  expect(sumAmounts([{ qty: 1, unit: 'cup' }, { qty: 1, unit: 'cup' }])).toBe('2 cup'));
it('converts mixed US volume into one unit', () =>
  expect(sumAmounts([{ qty: 2, unit: 'tbsp' }, { qty: 0.25, unit: 'cup' }])).toBe('⅜ cup'));
it('keeps incompatible amounts side by side', () =>
  expect(sumAmounts([{ qty: 2, unit: '' }, { qty: 1, unit: 'cup' }])).toBe('2 + 1 cup'));
it('sums an exact non-measurable unit', () =>
  expect(sumAmounts([{ qty: 1, unit: 'can' }, { qty: 2, unit: 'can' }])).toBe('3 can'));
it('ignores to-taste entries, and is blank when all are', () => {
  expect(sumAmounts([{ qty: null, unit: '' }, { qty: 1, unit: 'tsp' }])).toBe('1 tsp');
  expect(sumAmounts([{ qty: null, unit: '' }])).toBe('');
});
it('merges onion and onions, diced into one row with both sources', () => { /* 2 sources → 1 line, key 'name:onion' */ });
```

`stores.spec.ts`, ListStore, using two small fake recipes that both list `onion` (pass them via `provideFakeRecipes(new FakeRecipeRepository([...]))` in a new describe block):
- `merges a duplicate ingredient from two recipes into one row`. One row; `sourceTitles` has both titles; amount `'2 + 1 cup'` when one recipe has `2 onion` and the other `1 cup onions`.
- `checks a merged row as one item`. After `toggleRow(row)`, `isBought` is true for both sources and `row.bought` is true.
- `unchecks a merged row when a new recipe adds to it`. Check the row, then add a third recipe with `onion`. The row is now `bought === false`.
- `rechecks it when that recipe leaves`. Remove the third recipe; the row is `bought === true`.
- `merges a component shared by two parents into one row with two sources`. This replaces the `:1018` and `:1024` tests: the sources' owners are `'a>sauce'` and `'b>sauce'`.

- [ ] **Step 2: Run them and confirm they fail**

Run with `--include` for the three spec files.
Expected: FAIL.

- [ ] **Step 3: Implement**

- Implement `ingredient-key.ts` and `list-merge.ts`.
- Change `ListStore.groups` to collect `ListSource[]` across the cart (same owner and keys as today), then `mergeSources`, then group by aisle in `AISLE_ORDER`.
- Template:
  - `(change)="list.toggleRow(row)"`
  - amount `{{ row.amount }}`, name `{{ row.name }}`
  - source `{{ row.sourceTitles.join(' · ') }}` when `list.recipeCount() > 1`
- Delete the "Duplicates across recipes stay as separate rows" comment and replace it with the merge rationale.

- [ ] **Step 4: Run them and confirm they pass**

Run the three specs plus `src/app/pages/shopping-list`.
Expected: pass.

- [ ] **Step 5: Render-check**

Serve on 4320 and add Grandma's Chili and Grandma's Spaghetti. Take screenshots of `/list` at 390 px and 1280 px.

- [ ] **Step 6: Commit** — `feat(list): merge duplicate ingredients across recipes`

### Task 4 (FE): Manual one-off list items (item 3)

**Files:**
- Modify: `src/app/core/stores/list.store.ts`
- Modify: `src/app/pages/shopping-list/shopping-list.component.{ts,html,scss}`
- Test: `src/app/core/stores/stores.spec.ts`, `src/app/pages/shopping-list/shopping-list.component.spec.ts`. Create the latter if absent, using the `provideFakeRecipes` setup.

**Interfaces:**
- Consumes (Task 3): `ListRow`, `toggleRow`.
- Produces:
  - `export interface ExtraItem { id: string; name: string; bought: boolean }`
  - `export const OTHER_AISLE = 'other' as const;`
  - `ListStore.extras: Signal<readonly ExtraItem[]>`
  - `addExtra(name: string): boolean`. False when the name is blank or a case-insensitive repeat.
  - `removeExtra(id: string): void`
  - Storage key `'cookbook.extras'`. The id comes from `crypto.randomUUID()`.
  - Extras appear as a final `AisleGroup` `{ aisle: 'other', label: 'Other', rows }`. Each row has `key: 'extra:' + id`, `amount: ''`, `sources: []`, `sourceTitles: []` and `extraId: id`.
  - `toggleRow` flips an extra's `bought`.
  - `uncheckAll()` unchecks extras, and `clear()` removes them. `totalItems` and `boughtCount` include them.

- [ ] **Step 1: Write the failing tests**
  - `adds a manual item to an Other group`
  - `trims and caps a name at 200 characters`
  - `ignores a blank or repeated name` (`'Paper towels'` then `'paper towels '` leaves one)
  - `checks and removes a manual item`
  - `persists manual items across a fresh injection`
  - `counts manual items in the totals and unchecks them with everything else`
  - Component: `shows the list, not the empty state, when it holds only manual items`.
  - Component: `adds an item on Enter and clears the field`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**
  - Store as specified.
  - The component's `isEmpty` becomes `recipeCount() === 0 && extras().length === 0`.
  - Add a labelled "Add an item" input with a button, shown below the aisles and in the empty state.
  - Each extra row gets a remove button: `aria-label="Remove <name>"`, icon `close`.
- [ ] **Step 4: Run them and confirm they pass.** Then render-check at 390 px and 1280 px.
- [ ] **Step 5: Commit** — `feat(list): add one-off items like paper towels`

### Task 5 (FE): Cookbook facet in the library (item 2)

**Files:**
- Modify: `src/app/core/facets.ts`, `src/app/core/stores/recipe.store.ts`, `src/app/pages/library/library.component.ts`
- Test: `src/app/core/facets.spec.ts`, `src/app/core/stores/stores.spec.ts`, `src/app/pages/library/library.component.spec.ts`

**Interfaces:**
- Produces:
  - `Facet.kind: 'tag' | 'gap' | 'cookbook'`
  - `export const COOKBOOK_FACET = 'cookbook';`
  - `export function cookbookFacet(cookbooks: readonly { id: string; name: string }[]): Facet | null`. Null when `length < 2`. Options are the ids, in store order; the label is `'Cookbook'`.
  - `RecipeStore.selectedCookbooks: WritableSignal<ReadonlySet<string>>`.
  - In `results`, when the selection is non-empty, a recipe must carry at least one selected id.
  - `isOptionSelected`, `toggleOption`, `clearFacet`, `facetCount`, `selectedCount` and `reset` all handle `'cookbook'` through one private `selectionFor(facet)`. Option keys are lowercased only for `'tag'` and `'gap'`.
  - `LibraryComponent.facets` puts `cookbookFacet(cookbookStore.cookbooks())` first when it is non-null. `optionLabel` for cookbook is `byId(id)?.name ?? id`.

- [ ] **Step 1: Write the failing tests**
  - `cookbookFacet returns null for one cookbook`.
  - `cookbookFacet offers one option per cookbook, labelled Cookbook`.
  - Store: `filters by cookbook, OR within the facet`. Two recipes in `a`, one in `b`: selecting `a` gives 2, and selecting `a` and `b` gives 3.
  - Store: `ANDs the cookbook facet with tags`.
  - Store: `does not lowercase cookbook ids` (id `'Bobs'`).
  - Library: `hides the Cookbook facet with one cookbook` (default seed).
  - Library: `shows it first, named, with two` (`FakeCookbookRepository` with two).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass.**
- [ ] **Step 5: Commit** — `feat(library): filter by cookbook when there is more than one`

### Task 6 (FE): US / metric switch on the detail page and in cook mode (item 7)

**Files:**
- Modify: `src/app/core/stores/prefs.store.ts`
- Modify: `src/app/pages/recipe-detail/recipe-detail.component.{ts,html,scss}`
- Modify: `src/app/pages/cook-mode/cook-mode.component.{ts,html,scss}`
- Test: `stores.spec.ts` (PrefsStore), `recipe-detail.component.spec.ts`, `cook-mode.component.spec.ts`

**Interfaces:**
- Consumes (Task 2): `UnitSystem`, `convertMeasure`, `formatMeasure`.
- Produces:
  - `PrefsStore.units: Signal<UnitSystem>`, storage key `'cookbook.units'`, default `'us'`.
  - `PrefsStore.setUnits(system: UnitSystem): void`
  - `export function amountText(qty: number | null, unit: string, factor: number, system: UnitSystem): string` in `units.ts`. Blank for `null`; otherwise `formatMeasure(convertMeasure({ qty: qty * factor, unit }, system))`. Task 8 reuses it.
  - Detail `DetailIngredient` keeps `amount`, which now includes the unit; `amountLabel` is removed. The same applies to the cook-mode `ingredientSections` items.

- [ ] **Step 1: Write the failing tests**
  - PrefsStore: `defaults units to US and remembers a change`.
  - Detail: `shows a recipe's cups as ml after switching to Metric`. The fixture has `{ qty: 2, unit: 'cup' }`; expect the row to read `470 ml`.
  - Detail: `scales and converts together`. With servings doubled from 2 to 4, expect `950 ml`.
  - Detail: `leaves a countable row as written in Metric`.
  - Cook mode: `converts the ingredients panel when Metric is chosen`.
  - Cook mode: `shares the choice with the detail page`. Set the pref on one and create the other; it reads Metric.
  - Both: the toggle is a two-button group with `aria-pressed`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**
  - Detail: a "US | Metric" segmented control in the "Makes" rail item, under the stepper.
  - Cook mode: the same control in the sidebar heading row, after the toggle.
- [ ] **Step 4: Run them and confirm they pass.** Render-check both pages at 390 px and 1280 px.
- [ ] **Step 5: Commit** — `feat: switch amounts between US and metric`

### Task 7 (FE): Keep the screen awake in cook mode (item 8)

**Files:**
- Create: `src/app/core/wake-lock.ts`, `src/app/core/wake-lock.spec.ts`
- Modify: `src/app/pages/cook-mode/cook-mode.component.ts`. Replace `requestWakeLock` and `releaseWakeLock`.

**Interfaces:**
- Produces: `export class ScreenWakeLock { constructor(nav: { wakeLock?: WakeLock }, doc: Document); acquire(): Promise<void>; release(): void }`.
  - `acquire` stores the sentinel and listens for its `release` event, which nulls it.
  - `acquire` adds one `visibilitychange` listener that calls `acquire` again when `doc.visibilityState === 'visible'` and no sentinel is held.
  - `release` removes the listener and releases the sentinel. Every call is try/catch-silent.
  - Cook mode: `new ScreenWakeLock(navigator, inject(DOCUMENT))`. Call `acquire()` in the constructor and `release()` in `DestroyRef.onDestroy`.

- [ ] **Step 1: Write the failing tests.** Use a fake `nav.wakeLock.request` spy returning a fake sentinel, and a real `document` with `spyOnProperty(document, 'visibilityState')`.
  - `acquires on start`.
  - `does nothing where wakeLock is missing`.
  - `swallows a rejected request`.
  - `re-acquires when the page becomes visible after the lock was released`.
  - `does not re-acquire while a lock is held`.
  - `stops listening and releases on release()`. After `release()`, a visibility change does not call `request`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**, then wire it into cook mode.
- [ ] **Step 4: Run** `wake-lock.spec.ts` and `cook-mode.component.spec.ts`. Expected: pass.
- [ ] **Step 5: Commit** — `feat(cook): re-acquire the wake lock when the page comes back`

### Task 8 (FE): Ingredient chips under cook-mode steps (item 9)

**Files:**
- Create: `src/app/core/step-ingredients.ts`, `src/app/core/step-ingredients.spec.ts`
- Modify: `src/app/core/aisle.ts`. Export `containsWord`.
- Modify: `src/app/pages/cook-mode/cook-mode.component.{ts,html,scss}`, `cook-mode.component.spec.ts`

**Interfaces:**
- Consumes: `ingredientHead`, `stripDescriptors`, `singular`, `ingredientKey` (Task 3); `amountText` (Task 6); `containsWord` (aisle.ts).
- Produces:
  - `export function ingredientsInStep(step: string, ingredients: readonly Ingredient[]): Ingredient[]`
  - `CookModeComponent.stepChips: Signal<string[]>`. Each chip is `amountText(qty, unit, 1, prefs.units())`, plus a space, plus the stripped head; or the head alone for `null` qty.

Matching:

```text
haystack = step.toLowerCase()
for each ingredient in order:
  head = stripDescriptors(ingredientHead(name)); words = head.split(' ')
  skip if head.length < 3, words.length > 4, or head === 'water'
  key = ingredientKey(name)
  match if containsWord(haystack, p) for any p in {head, key, key + 's', key + 'es'}
```

`FlatStep` gains `ingredients: Ingredient[]`: the owner's list, which is the component's for a component step and the parent's for a parent step.

- [ ] **Step 1: Write the failing tests**
  - `finds "onions" for a "large onion" ingredient`.
  - `does not match "oil" against "olive oil"`. The step says "Heat the oil"; expect `[]`.
  - `does not match inside a word` ("scallion" vs "scallions" is fine, "pea" vs "peach" is not).
  - `returns each ingredient once, in list order`.
  - `skips water`.
  - Cook mode: `shows a Uses list under a step that names an ingredient`. The fixture is `'Simmer the stock for 20 minutes.'`; expect a chip `2 cup stock`.
  - Cook mode: `shows nothing under a step that names none`.
  - Cook mode: `uses the component's ingredients for a component step`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - Markup: `<ul class="step-uses" aria-label="Uses">` under `.step-text`, with a `label`-styled "Uses:" lead-in and chip `li`s.
- [ ] **Step 4: Run them and confirm they pass.** Render-check cook mode at 390 px and 1280 px.
- [ ] **Step 5: Commit** — `feat(cook): show the amounts a step uses`

### Task 9 (FE): "Surprise me" (item 11)

**Files:**
- Modify: `src/app/core/stores/recipe.store.ts`
- Modify: `src/app/pages/library/library.component.{ts,html,scss}`
- Test: `stores.spec.ts`, `library.component.spec.ts`

**Interfaces:**
- Produces:
  - `RecipeStore.surprise(rand: () => number = Math.random): Recipe | null`. Picks from `results()` with `!r.component`, using index `Math.floor(rand() * n)`.
  - `LibraryComponent.surprise(): void` navigates to `['/recipes', slug]`.

- [ ] **Step 1: Write the failing tests**
  - `picks from the filtered results` (with `rand = () => 0.99`, the last candidate).
  - `never picks a component`.
  - `returns null when nothing matches`.
  - Library: `disables Surprise me with no results`.
  - Library: `navigates to the picked recipe`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Add a `btn-ghost` "Surprise me" button (icon `casino`) in `.controls` after Favorites.
- [ ] **Step 4: Run them and confirm they pass.**
- [ ] **Step 5: Commit** — `feat(library): surprise me`

### Task 10 (FE): "What can I make with…" (item 12)

**Files:**
- Create: `src/app/core/pantry.ts`, `src/app/core/pantry.spec.ts`
- Modify: `src/app/core/stores/recipe.store.ts`
- Modify: `src/app/pages/library/library.component.{ts,html,scss}`
- Test: `stores.spec.ts`, `library.component.spec.ts`

**Interfaces:**
- Consumes: `ingredientKey` (Task 3) and `containsWord`.
- Produces:
  - `export const PANTRY_STAPLES: ReadonlySet<string>`. Keys: `salt`, `kosher salt`, `sea salt`, `pepper`, `black pepper`, `ground black pepper`, `salt and pepper`, `water`, `oil`, `olive oil`, `vegetable oil`, `cooking spray`, `sugar`, `flour`, `all purpose flour`, `all-purpose flour`, `baking soda`, `baking powder`.
  - `export interface Coverage { covered: number; total: number; ratio: number }`
  - `export function parseHave(text: string): string[]`. Splits on `/[,;\n]|\band\b/`, applies `ingredientKey` to each part, drops empties, dedupes.
  - `export function coverageOf(ingredients: readonly Ingredient[], have: readonly string[]): Coverage | null`.
    - Null when no ingredient is a non-staple.
    - An ingredient is covered when `containsWord(key, h) || containsWord(h, key)` for some `h`.
  - `export function compareCoverage(a: { title: string; coverage: Coverage }, b: same): number`. Orders by ratio desc, then covered desc, then total asc, then `title.localeCompare`.
  - `RecipeStore.mode: WritableSignal<'search' | 'have'>`, default `'search'`.
  - `RecipeStore.coverage: Signal<ReadonlyMap<string, Coverage>>`.
  - In `'have'` mode with a non-empty `parseHave(query())`, `results` behaves as follows:
    - Facets, gaps, cookbooks and favorites filter as usual. The text match is skipped and components are dropped.
    - Each parent's coverage is computed over its own ingredients plus its components'.
    - Recipes with `covered === 0` or null coverage are dropped. The rest are sorted with `compareCoverage`.
  - `reset()` returns `mode` to `'search'`.

- [ ] **Step 1: Write the failing tests**
  - `parseHave splits "Chicken, rice and broccoli" into chicken, rice, broccoli`.
  - `coverageOf ignores staples in the total`.
  - `counts "chicken" as covering "chicken breasts"`.
  - `returns null for a recipe of only staples`.
  - Store: `ranks by covered share in have mode`.
  - Store: `drops recipes with no coverage and all components`.
  - Store: `still applies facets in have mode`.
  - Store: `counts a parent's component ingredients`.
  - Library: `switches the placeholder and shows "Uses 2 of 3" on cards in have mode`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**
  - A "What can I make?" toggle button (`aria-pressed`) beside the search input.
  - Placeholder in have mode: `List what you have: chicken, rice, broccoli`.
  - The card meta gains `Uses {{covered}} of {{total}}` in have mode.
- [ ] **Step 4: Run them and confirm they pass.** Render-check at 390 px and 1280 px.
- [ ] **Step 5: Commit** — `feat(library): what can I make with what I have`

### Task 11 (API): `POST /import/photo` via Claude (item 13, server)

**Files:**
- Modify: `package.json`, `package-lock.json`. Add `@anthropic-ai/sdk`, pinned exact.
- Create: `import/read-photo.js`
- Modify: `routes/import.js`
- Test: `test/import.photo.test.js` (reader and prepare), `test/import.routes.test.js` (route)
- Modify: `docs/import-api.md`

**Interfaces:**
- Produces from `import/read-photo.js`:
  - `PHOTO_TYPES`: `['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']`
  - `MAX_PHOTO_BYTES`: `10 * 1024 * 1024`
  - `MODEL`: `'claude-sonnet-5-5'`
  - `class PhotoReadError extends Error { constructor(code, reason) }`. Codes: `'UNREADABLE' | 'REFUSED' | 'TRUNCATED' | 'NO_KEY' | 'AUTH' | 'BUSY' | 'TIMEOUT' | 'UPSTREAM'`.
  - `async function preparePhoto(buffer) → { data: string /* base64 */, mediaType: 'image/jpeg' }`. Uses `sharp(buffer).rotate().resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()`. Any sharp error, including an undecodable HEIC, becomes `PhotoReadError('UNREADABLE')`.
  - `async function readRecipePhoto(buffer, { client, prepare = preparePhoto } = {}) → preview | null`.
    - `client` defaults to a lazily built `new Anthropic({ timeout: 60_000 })`.
    - Throws `NO_KEY` when no client is passed and `process.env.ANTHROPIC_API_KEY` is empty.
- Route deps: `importRouter({ fetchPage, extractRecipe, readPhoto = readRecipePhoto })`.

The exact SDK call, per the claude-api skill:

```js
const Anthropic = require('@anthropic-ai/sdk');

const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: PHOTO_RECIPE_SCHEMA } },
    messages: [
        {
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
                { type: 'text', text: 'Transcribe the recipe in this photo.' },
            ],
        },
    ],
});
```

- Do not send `thinking` or `temperature`. Sonnet 5.5 runs adaptive thinking by default and rejects `{type:'disabled'}`, `budget_tokens` and non-default sampling.
- Check `response.stop_reason` before reading content:
  - `'refusal'` becomes `REFUSED`.
  - `'max_tokens'` becomes `TRUNCATED`.
- Otherwise, take the first `content` block with `type === 'text'` and `JSON.parse` it. Validate the result with a zod 4 schema that mirrors `PHOTO_RECIPE_SCHEMA`; a validation failure becomes `UPSTREAM`.

`PHOTO_RECIPE_SCHEMA`: every property is required and `additionalProperties: false` applies at every level.

```text
{ found: boolean, title: string, description: string, servings: integer (0 = not stated),
  time: string ('' = not stated),
  ingredientGroups: [{ name: string ('' = the recipe's own list), lines: string[] }],
  steps: string[] }
```

`SYSTEM_PROMPT`:

> You transcribe recipes from photographs of recipe cards, cookbook pages and handwritten notes. Copy the wording as written, including spelling and abbreviations such as "c." or "T."; never invent a title, quantity or step that is not in the photo. One ingredient per line, as written. If the card has headed ingredient lists ("For the sauce"), put each under its heading. If there is no recipe in the photo, set found to false and leave the rest empty.

Mapping to the preview: return null when `!found`, or when `title` and every ingredient line are empty. Otherwise return:

```text
{ sourceUrl: '', title, description,
  ...(servings > 0 && { servings }), ...(time && { time }),
  ingredientGroups: groups.map(g => ({ name: g.name || null, lines })), steps }
```

Every string passes through `clean` from `import/extract.js`.

SDK error mapping, most specific first:
- `Anthropic.AuthenticationError` becomes `AUTH`.
- `Anthropic.RateLimitError` becomes `BUSY`.
- `Anthropic.APIConnectionError` becomes `TIMEOUT`. It is a subclass of `APIError` in the TS SDK, so check it before `APIError`.
- `Anthropic.APIError` becomes `UPSTREAM`.

Log only `status` and `type`, never the image or the body.

Route `POST /photo`, in order `requireLocalWrite`, then `photoUpload`, then the handler:
- `photoUpload` wraps `multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 }, fileFilter }).single('photo')`.
  - `LIMIT_FILE_SIZE` answers 413 `'That photo is over 10 MB.'`
  - A type outside `PHOTO_TYPES` answers 415 `'Use a JPEG, PNG, WebP or HEIC photo.'`
  - No file answers 400 `'Attach a photo.'`
- New `MESSAGES`, with these statuses:
  - `NO_PHOTO_RECIPE` (422): `"Couldn't find a recipe in that photo."`. Also used for `REFUSED`.
  - `UNREADABLE` (415): `"That photo couldn't be read. Try a JPEG or PNG."`
  - `NO_KEY` (503): `"Photo import needs ANTHROPIC_API_KEY in the API's .env."`
  - `AUTH` (503): `'The photo reader rejected the API key.'`
  - `BUSY` (503): `'The photo reader is busy. Try again in a minute.'`
  - `TIMEOUT` (504): `'The photo reader took too long to answer.'`
  - `UPSTREAM` and `TRUNCATED` (502): `'The photo reader gave an answer that could not be used.'`

- [ ] **Step 1: Add the SDK**

Run: `npm view @anthropic-ai/sdk version`. Then `npm install --save-exact @anthropic-ai/sdk@<that version>`.

Then check the CommonJS export:
`node -e "const A=require('@anthropic-ai/sdk'); console.log(typeof A, typeof A.RateLimitError, typeof A.APIConnectionError)"`
Expected: `function function function`. If the first is `object`, use `require('@anthropic-ai/sdk').default` everywhere and note it in the file.

- [ ] **Step 2: Write the failing tests**

`test/import.photo.test.js`, with a fake `client = { beta: { messages: { create: jest.fn() } } }` and `prepare = async () => ({ data: 'AAAA', mediaType: 'image/jpeg' })`:
- `sends one base64 JPEG image block to claude-sonnet-5-5 with a JSON schema`. Assert on `create.mock.calls[0][0]`:
  - `.model` is `'claude-sonnet-5-5'`
  - `content[0]` is `{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }`
  - `.output_config.format.type` is `'json_schema'`
  - `.fallbacks` is `'default'`
  - `.betas` is `['server-side-fallback-2026-07-01']`
  - `.thinking` is `undefined`
- `maps the answer to the preview shape`: `sourceUrl ''`, unnamed group `name: null`, `servings` omitted when 0.
- `returns null when found is false`.
- `throws REFUSED on a refusal stop reason, without reading content`.
- `throws TRUNCATED on max_tokens`.
- `throws UPSTREAM on JSON that fails the schema`.
- `maps SDK errors`. Build the errors with `Object.create(Anthropic.RateLimitError.prototype)` and the equivalents. Expect `AUTH`, `BUSY`, `TIMEOUT` and `UPSTREAM`, in that order.
- `throws NO_KEY with no key and no client`. Save and restore `process.env.ANTHROPIC_API_KEY`.
- `preparePhoto downsizes to a 1568px JPEG`. Input is `sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#ffffff' } }).png().toBuffer()`; expect `mediaType` `'image/jpeg'` and metadata width `1568`.
- `preparePhoto throws UNREADABLE on garbage bytes`.

`test/import.routes.test.js`, a new `describe('POST /import/photo')` using `.attach('photo', buffer, { filename: 'card.jpg', contentType: 'image/jpeg' })` and a stub `readPhoto`:
- `returns the preview` (200).
- `403s without the key, and never calls the reader`.
- `400s with no file`.
- `413s over 10 MB`. Send `Buffer.alloc(MAX_PHOTO_BYTES + 1)`.
- `415s a GIF`.
- `422s when the reader finds nothing`.
- `maps each PhotoReadError code to its status and fixed message`.
- `has no other routes` (extend the existing test).

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx jest test/import.photo.test.js test/import.routes.test.js`
Expected: FAIL.

- [ ] **Step 4: Implement** `import/read-photo.js` and the route.

- [ ] **Step 5: Run the API suite**

Run: `npx jest`
Expected: all pass, 0 failed.

- [ ] **Step 6: Document.** Add a `POST /import/photo` section to `docs/import-api.md`. Cover the limits, the statuses, that it needs `ANTHROPIC_API_KEY` in `.env` (Sam adds it), and the HEIC caveat.

- [ ] **Step 7: Commit** — `feat(import): read a recipe from a photo with Claude`

### Task 12 (FE): "From a photo" tab (item 13, client)

**Files:**
- Modify: `src/app/core/import-client.ts` and `import-client.spec.ts`
- Modify: `src/app/core/write-error.ts` and `write-error.spec.ts`
- Modify: `src/app/pages/create-recipe/create-recipe.component.{ts,html,scss}` and `create-recipe.component.spec.ts`

**Interfaces:**
- Produces:
  - `ImportClient.previewPhoto(file: File): Promise<ImportPreview>`. Sends `POST ${apiBase}/import/photo` with `FormData` field `photo`.
  - `export const PHOTO_TYPES` and `export const MAX_PHOTO_BYTES = 10 * 1024 * 1024`, in `import-client.ts`.
  - `export function photoProblem(file: File): string`. Returns `''` when the file is fine.
    - Over the size limit: `'That photo is over 10 MB.'`
    - Wrong type: `'Use a JPEG, PNG, WebP or HEIC photo.'`
    - A file with an empty `type` and a `.heic` or `.heif` name counts as HEIC.
  - `describeWriteError` relays the body message for 413 and 415, as it does for 422.
  - `Tab` gains `'photo'`. `CreateRecipeComponent.importPhoto(files: FileList | null): Promise<void>` uses the same flow as `importFromUrl`: the `importing` flag, then `applyPreview`, then the manual tab and a notice. A 404 gives the same "isn't switched on" notice.

- [ ] **Step 1: Write the failing tests**
  - Client: `posts the file as multipart field photo`. Use `HttpTestingController`; the request body is a `FormData` whose `.get('photo')` is the file.
  - `photoProblem` flags oversize, flags GIF, and accepts a nameless-type `card.HEIC`.
  - `describeWriteError` relays a 413 message and a 415 message.
  - Component: `fills the form from a photo and switches to Manual`.
  - Component: `refuses a GIF before calling the API`.
  - Component: `shows the not-switched-on notice on 404`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**
  - The tab label is "From a photo".
  - The panel has a hint ("Handwritten cards work. The photo is read by Claude on the local recipe server; nothing is saved until you press Save.") and `<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif">`, plus an "Importing…" state.
- [ ] **Step 4: Run them and confirm they pass.** Render-check the tab at 390 px.
- [ ] **Step 5: Commit** — `feat(create): import a recipe from a photo`

### Task 13 (FE): Bookmarklet and `?url=` auto-import (item 14)

**Files:**
- Modify: `src/app/pages/create-recipe/create-recipe.component.{ts,html,scss}` and its spec.

**Interfaces:**
- Produces:
  - `readonly url = input<string | undefined>(undefined)`. Bound from the query param by `withComponentInputBinding`.
  - `export const BOOKMARKLET_HREF = "javascript:location.href='http://localhost:4200/cookbook/recipes/new?url='+encodeURIComponent(location.href)"`
  - `protected readonly bookmarklet = inject(DomSanitizer).bypassSecurityTrustUrl(BOOKMARKLET_HREF)`
- Behaviour, as an effect in add mode only (`slug_()` undefined):
  - An http(s) `url` that has not been handled yet sets `tab('url')` and `importUrl(url)`, calls `importFromUrl()`, and then runs `router.navigate([], { queryParams: { url: null }, queryParamsHandling: 'merge', replaceUrl: true })`.
  - Any other value is ignored.

- [ ] **Step 1: Write the failing tests**
  - `imports once from ?url=`. `previewRecipe` is called once with the url, and the tab ends on manual.
  - `ignores a non-http url` (`javascript:alert(1)`).
  - `ignores ?url= in edit mode`.
  - `renders a bookmarklet link whose href starts with javascript:location.href=` (not `unsafe:`).
  - `clicking the bookmarklet in the app does nothing` (`defaultPrevented`).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** The link reads "Add to Sam's Recipes". The hint reads: "Drag this to your bookmarks bar. On any recipe page, click it to import that page here."
- [ ] **Step 4: Run them and confirm they pass.**
- [ ] **Step 5: Commit** — `feat(create): bookmarklet and ?url= auto-import`

### Task 14 (FE): Print view (item 16)

**Files:**
- Modify: `src/app/pages/recipe-detail/recipe-detail.component.{ts,html,scss}` and its spec.
- Modify: `src/app/app.component.scss` (hide `.site-header` in print), `src/styles.scss` (`@page { margin: 1.5cm; }` and the print body background `var(--paper)`).

**Interfaces:**
- Produces: `RecipeDetailComponent.print(): void`, which calls `inject(DOCUMENT).defaultView?.print()`.

- [ ] **Step 1: Write the failing test** — `calls window.print from the Print button` (`spyOn(window, 'print')`).
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement**
  - Add a `btn-ghost` Print button (icon `print`) in `.actions`.
  - Under `@media print`, hide: `.hero`, `.actions`, `.back`, the stepper buttons, `.rail-note .link-button`, `.gap-note`, the unit toggle, and the checkbox boxes (keep the labels).
  - `.columns` becomes a two-column grid under `@media print and (min-width: 15cm)`.
  - `li { break-inside: avoid; }`
- [ ] **Step 4: Run the spec, then render-check print.**
  - Serve on 4320 and open a recipe in Playwright.
  - Run `browser_emulate_media` with `media: 'print'`, then screenshot at 794 px (A4 width). Expect: no header, no photo, no buttons, and two columns.
  - Hand the screenshot to Sam.
- [ ] **Step 5: Commit** — `feat(detail): print a recipe`

---

# Phase B

### Task 15 (API): Device gate and `POST /device/verify`

**Files:**
- Modify: `middleware/require-local-write.js`. Extract `isLocalWrite(req): boolean`; `requireLocalWrite` keeps its behaviour.
- Create: `middleware/require-device.js`, `routes/device.js`
- Modify: `index.js`. Mount `app.use('/device', deviceRouter())` after `cors()`.
- Test: `test/require-device.test.js`, `test/device.routes.test.js`, `test/index.wiring.test.js`, `test/require-local-write.test.js` (add an `isLocalWrite` case)
- Create: `docs/device-api.md`

**Interfaces:**
- Produces:
  - `createDeviceGate({ getKey = () => process.env.RECIPES_DEVICE_KEY, maxFailures = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) → { middleware(req, res, next), reset() }`
  - Module default: `const deviceGate = createDeviceGate(); const requireDevice = deviceGate.middleware;`. Every device route uses this one shared instance, so failures count together.
  - `deviceRouter({ gate = requireDevice } = {})`: `POST /verify` passes through the gate and answers 204.

Gate algorithm:

```text
if isLocalWrite(req) → next()
origin = req.get('origin'); if !origin || !ALLOWED_ORIGINS.includes(origin) → 403
expected = getKey(); if not a non-empty string → 403          (fail closed)
if windowStart !== null && now() - windowStart >= windowMs → failures = 0, windowStart = null
if failures >= maxFailures → 429 { message: 'Too many attempts. Try again later.' },
                             Retry-After: ceil((windowStart + windowMs - now()) / 1000)
provided = req.get('x-device-key'); if missing/empty → 403 (not counted)
if !keyMatches(provided, expected) → failures++, windowStart ??= now(); 403
next()
```

Reuse `keyMatches`: export it from `require-local-write.js`. It is constant-time over SHA-256. The 403 body is `{ message: 'Writes are not permitted.' }`.

- [ ] **Step 1: Write the failing tests**
  - `lets a local write through with no device key`.
  - `allows https://shinkhouse.github.io with the right key`.
  - `refuses no Origin, a foreign Origin, and an unset or empty RECIPES_DEVICE_KEY`.
  - `does not count a missing header`.
  - `locks out after 10 wrong keys with 429 and Retry-After`. Use a fake `now`.
  - `refuses even the right key while locked out`.
  - `unlocks after the window`.
  - Route: `POST /device/verify answers 204 with the key and 403 without`.
  - `ALLOWED_ORIGINS includes https://shinkhouse.github.io`.
  - Wiring: `mounts /device after the cors middleware`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx jest`. Expected: all pass.
- [ ] **Step 5: Document.** In `docs/device-api.md`, cover the gate rules, the lockout trade-off, and that Sam sets `RECIPES_DEVICE_KEY` himself in `.env` and on Heroku. The doc never includes a value.
- [ ] **Step 6: Commit** — `feat(api): device passcode gate for writes from the live site`

### Task 16 (FE): `DeviceStore` and "Unlock this device"

**Files:**
- Create: `src/app/core/stores/device.store.ts` and its spec.
- Create: `src/app/device-unlock/device-unlock.component.{ts,html,scss,spec.ts}`
- Modify: `src/app/core/stores/recipe.store.ts`, `src/app/core/write-error.ts`
- Modify: `src/app/app.component.{ts,html,scss}`. Add a `<footer class="site-footer">`, hidden in cook mode.

**Interfaces:**
- Produces:
  - `export type UnlockResult = 'ok' | 'wrong' | 'locked-out' | 'unreachable';`
  - `DeviceStore.unlocked: Signal<boolean>`. Storage key `'cookbook.deviceKey'`.
  - `DeviceStore.unlock(passcode: string): Promise<UnlockResult>`.
    - Sends `POST ${apiBase}/device/verify` with header `x-device-key`.
    - 204 stores the passcode and gives `'ok'`.
    - 403 gives `'wrong'`, 429 gives `'locked-out'`, and anything else gives `'unreachable'`.
    - A blank passcode gives `'wrong'` without a request.
  - `DeviceStore.lock(): void`
  - `DeviceStore.headers(): Record<string, string>`. Returns `{ 'x-device-key': key }`, or `{}` when locked.
  - `RecipeStore.canSave = computed(() => this.writable || this.device.unlocked())`. `RecipeStore` injects `DeviceStore`; `DeviceStore` injects only `HttpClient` and `Storage`.
  - `export function describeDeviceError(err: unknown): string`:
    - 403: `"This device isn't unlocked any more. Unlock it again from the footer."`
    - 429: `'Too many wrong passcodes. Try again in 15 minutes.'`
    - Status 0 or 502–504: `"Couldn't reach the recipe server."`
    - Otherwise: `'Saving failed. Nothing was changed.'`
  - `DeviceUnlockComponent`: shown only when `!recipes.writable`.
    - Locked: a link-button "Unlock this device" opens an inline form with a password field, "Unlock" and "Cancel".
    - The form's messages are: `"That passcode didn't work."`, `'Too many tries. Wait 15 minutes and try again.'` and `"Couldn't reach the recipe server."`
    - Unlocked: "This device can save · Lock".

- [ ] **Step 1: Write the failing tests** (`HttpTestingController` for the store).
  - `stores the passcode on 204 and reports ok`.
  - `reports wrong on 403 and stores nothing`.
  - `reports locked-out on 429`.
  - `sends the header only once unlocked`.
  - `lock() forgets the passcode`.
  - `canSave is true in a writable build without unlock, and follows unlock in a read-only build`. Set the fake repository's `writable = false`.
  - Component: `is absent in a writable build`.
  - Component: `unlocks, then shows Lock`.
  - Component: `shows the wrong-passcode message`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Footer styles use `--text-small` and `--ink-4`.
- [ ] **Step 4: Run them and confirm they pass.** Render-check the footer at 390 px with a `production` build: `ng build --configuration production` served from `dist`, or a test-only override of `writable`.
- [ ] **Step 5: Commit** — `feat: unlock this device to save from the live site`

### Task 17 (API): `POST /recipes/:slug/notes` (item 6, server)

**Files:**
- Modify: `recipes.repository.js`, `test/fake-recipe-repository.js`, `routes/recipes.js`
- Test: `test/recipes.repository.test.js` (use the jest.fn collection pattern at `:116`), `test/recipes.routes.device.test.js` (new)
- Modify: `docs/recipes-api.md`

**Interfaces:**
- Consumes (Task 15): `requireDevice`.
- Produces:
  - `repository.appendNote(slug, note) → recipe | null`. Runs `collection().findOneAndUpdate({ _id: slug, archived: { $ne: true } }, { $push: { notes: note } }, { returnDocument: 'after' })`, then `toRecipe(result.value)`. Driver 5.6 returns a ModifyResult, so read `.value`.
  - `recipesRouter(repository, { gate = requireDevice, now = () => new Date() } = {})`
  - `POST /:slug/notes`, body `{ note }`:
    - Trimmed, it must be a string of 1 to 2000 characters, or the answer is 400 `'note must be 1 to 2000 characters.'`
    - Success is 200 with the recipe. An unknown or archived recipe is 404.

- [ ] **Step 1: Write the failing tests**
  - Repository: `appendNote pushes to notes on a non-archived recipe and maps the result`. Assert the filter, the update and the options.
  - Repository: `appendNote returns null when nothing matched`.
  - Route: `appends a trimmed note with a device key from the live site`. Set Origin `https://shinkhouse.github.io` and `x-device-key`.
  - Route: `400s a blank or 2001-character note`.
  - Route: `404s an archived recipe`.
  - Route: `403s with no key`.
  - Route: `keeps the full edit surface local-only`. A PUT `/recipes/:slug` from the live origin with only `x-device-key` is 403.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx jest`. Expected: all pass.
- [ ] **Step 5: Document** in a "Device endpoints" section. **Commit** — `feat(api): append a note from an unlocked device`

### Task 18 (FE): Quick notes on the detail page (item 6, client)

**Files:**
- Modify: `src/app/core/recipe-repository.ts`, `src/app/core/testing/fake-repositories.ts`, `src/app/core/stores/recipe.store.ts`
- Modify: `src/app/pages/recipe-detail/recipe-detail.component.{ts,html,scss}`
- Test: `recipe-repository.spec.ts`, `stores.spec.ts`, `recipe-detail.component.spec.ts`

**Interfaces:**
- Consumes (Task 16): `DeviceStore.headers()`, `DeviceStore.lock()`, `RecipeStore.canSave`, `describeDeviceError`.
- Produces:
  - `abstract addNote(slug: string, note: string): Promise<Recipe | null>`. The HTTP version sends `POST ${url}/${slug}/notes` with `{ headers: device.headers() }`; a 404 gives null. The fake appends.
  - `RecipeStore.addNote(slug: string, note: string): Promise<boolean>`.
    - It trims first; a blank note gives false without a request.
    - On success it replaces the record with the server's copy.
    - On a 403 it calls `device.lock()` and rethrows.
- Detail page:
  - The Notes section renders when `r.notes.length > 0 || canSave()`.
  - When `canSave()`, it holds a labelled textarea "Add a note" and an "Add note" button, disabled while empty or saving.
  - On success the field clears. An error shows `describeDeviceError`.

- [ ] **Step 1: Write the failing tests**
  - Repository: `sends the device header with a note`.
  - Store: `appends and replaces the record`.
  - Store: `ignores a blank note`.
  - Store: `locks the device on 403`.
  - Detail: `hides the note field without unlock on a read-only build`.
  - Detail: `adds a note and shows it`.
  - Detail: `shows the error and keeps the text on failure`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass.** Render-check at 390 px.
- [ ] **Step 5: Commit** — `feat(detail): add a quick note from the kitchen`

### Task 19 (API): `POST /recipes/:slug/cooked` and `lastCooked` (item 5, server)

**Files:**
- Modify: `recipes.repository.js`, `test/fake-recipe-repository.js`, `routes/recipes.js`, `recipes.validation.js`
- Test: `test/recipes.repository.test.js`, `test/recipes.routes.device.test.js`, `test/recipes.validation.test.js`, `test/recipes.routes.write.test.js`
- Modify: `docs/recipes-api.md`

**Interfaces:**
- Produces:
  - `repository.markCooked(slug, isoDate) → recipe | null`. Uses `findOneAndUpdate({ _id: slug, archived: { $ne: true } }, { $inc: { cooked: 1 }, $set: { lastCooked: isoDate } }, { returnDocument: 'after' })`.
  - `POST /:slug/cooked` passes through `gate` and calls `markCooked(slug, now().toISOString())`. It answers 200 with the recipe or 404, and ignores any body.
  - Validation: `'lastCooked'` joins `RECIPE_FIELDS` after `'cooked'`. When present, it must be a string of at most 40 characters for which `Date.parse` is not NaN; otherwise 400 `'lastCooked must be an ISO date string when present.'`

- [ ] **Step 1: Write the failing tests**
  - Repository: `markCooked increments cooked and stamps lastCooked`.
  - Route: `marks cooked with the injected clock` (`now = () => new Date('2026-11-02T18:00:00Z')`).
  - Route: `ignores a client-sent lastCooked`.
  - Route: `404s an unknown slug`.
  - Validation: `rejects a non-date lastCooked`.
  - Write route: `round-trips lastCooked through a PUT`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx jest`. Expected: all pass.
- [ ] **Step 5: Document. Commit** — `feat(api): mark a recipe cooked from an unlocked device`

### Task 20 (FE): Mark as cooked in cook mode and on the detail page (item 5, client)

**Files:**
- Modify: `src/app/core/model/recipes.model.ts` (add `lastCooked?: string`, documented as "ISO timestamp, stamped by the server")
- Modify: `recipe-repository.ts`, `fake-repositories.ts`, `recipe.store.ts`
- Modify: the cook-mode and recipe-detail components and their specs.

**Interfaces:**
- Produces:
  - `abstract markCooked(slug: string): Promise<Recipe | null>`. The HTTP version sends `POST ${url}/${slug}/cooked` with `{}` and the device headers. The fake increments `cooked` and sets `lastCooked` to `new Date().toISOString()`.
  - `RecipeStore.markCooked(slug: string): Promise<boolean>`, with the same replace and 403-lock rules as `addNote`.
  - Cook mode:
    - `next()` on the last step sets `confirmingCooked` to true when `canSave()`; otherwise it navigates as today.
    - The panel copy is "Mark as cooked?", with buttons "Mark as cooked" and "Not this time". On failure it shows the error and a "Leave anyway" button.
    - Methods: `confirmCooked(): Promise<void>` and `skipCooked(): void`. Both end in `router.navigate(['/recipes', slug])`.
  - Detail page:
    - A "Mark as cooked" button (`canSave()` only) opens an inline confirm: "Cooked it today?", with "Yes" and "Cancel".
    - The rail adds "Last cooked" with `{{ r.lastCooked | date: 'mediumDate' }}` when present.

- [ ] **Step 1: Write the failing tests**
  - Cook mode: `asks before marking when Finished is pressed on an unlocked device`.
  - Cook mode: `marks cooked and returns to the recipe`. The fake repository's count is +1 and `router.navigate` is called.
  - Cook mode: `Not this time leaves without writing`.
  - Cook mode: `Finished leaves straight away when the device cannot save`.
  - Cook mode: `stays on the confirm with the reason when the write fails`.
  - Detail: `marks cooked after Yes and shows the new count and date`.
  - Detail: `hides Mark as cooked when the device cannot save`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass.** Render-check the cook-mode confirm at 390 px.
- [ ] **Step 5: Commit** — `feat: mark a recipe cooked when you finish it`

### Task 21 (FE): "Not cooked lately" sort (item 10)

**Files:**
- Modify: `src/app/core/stores/recipe.store.ts`, the library component (`ts`, `html`, `scss`), `stores.spec.ts`, `library.component.spec.ts`

**Interfaces:**
- Produces:
  - `export type LibrarySort = 'default' | 'stale';`
  - `RecipeStore.sort: WritableSignal<LibrarySort>`. `reset()` leaves it alone, because it is a view preference, not a filter.
  - `export function compareStale(a: Recipe, b: Recipe): number`:

```text
rank(r) = r.lastCooked ? 1 : r.cooked > 0 ? 0 : 2
by rank asc; within rank 1 by lastCooked asc (string compare of ISO is chronological); then title.localeCompare
```

  - `results` sorts by `compareStale` when `sort() === 'stale'` and `mode() === 'search'`.
  - Library: a labelled `<select>` "Sort", with "Library order" and "Not cooked lately", beside the result count.

- [ ] **Step 1: Write the failing tests**
  - `orders cooked-but-undated, then oldest first, then never cooked`.
  - `keeps library order by default`.
  - `ignores the sort in have mode`.
  - Library: `changes the order from the Sort select`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass.**
- [ ] **Step 5: Commit** — `feat(library): sort by not cooked lately`

### Task 22 (API): `PUT /recipes/:slug/favorite`

**Files:**
- Modify: `recipes.repository.js`, `test/fake-recipe-repository.js`, `routes/recipes.js`, `recipes.validation.js`, and the tests as in Task 19.
- Modify: `docs/recipes-api.md`

**Interfaces:**
- Produces:
  - `repository.setFavorite(slug, favorite) → recipe | null`. Runs `$set: { favorite }` with the same filter and options as `markCooked`.
  - `PUT /:slug/favorite`, body `{ favorite: boolean }`, gated. Otherwise 400 `'favorite must be a boolean.'` Answers 200 or 404.
  - Validation: `'favorite'` joins `RECIPE_FIELDS`. When present it must be a boolean; otherwise 400 `'favorite must be a boolean when present.'`

- [ ] **Step 1: Write the failing tests**
  - `sets and clears favorite`.
  - `400s a string "true"`.
  - `404s an archived recipe`.
  - `round-trips favorite through a PUT`.
  - Repository: `setFavorite sets the flag`.
- [ ] **Step 2: Run them and confirm they fail.** **Step 3: Implement.** **Step 4: Run** `npx jest`; expect all pass.
- [ ] **Step 5: Document. Commit** — `feat(api): favorites live on the recipe`

### Task 23 (FE): Favorites sync and one-time migration

**Files:**
- Modify: `src/app/core/model/recipes.model.ts` (add `favorite?: boolean`)
- Modify: `recipe-repository.ts`, `fake-repositories.ts`, `recipe.store.ts`, `prefs.store.ts`
- Create: `src/app/core/favorites-migration.ts` and its spec.
- Modify: `app.component.ts` (run the migration), and the library and detail templates and components.
- Test: rewrite the PrefsStore favorites tests in `stores.spec.ts` to cover `legacyFavs` and `clearLegacyFavs`.

**Interfaces:**
- Produces:
  - `abstract setFavorite(slug: string, favorite: boolean): Promise<Recipe | null>`. The HTTP version sends `PUT ${url}/${slug}/favorite`.
  - On `RecipeStore`:
    - `isFav(slug): boolean` is `bySlug(slug)?.favorite === true`.
    - `toggleFav(slug): Promise<boolean>`
    - `setFavorite(slug, favorite): Promise<boolean>`, with the same replace and 403-lock rules.
    - `favCount: Signal<number>`
    - `results` uses `r.favorite` for `favsOnly`.
  - On `PrefsStore`:
    - Remove `favs`, `favCount`, `isFav` and `toggleFav`.
    - Add `legacyFavs(): string[] | null`. It returns the stored `cookbook.favs`, or null when nothing has ever been stored; there is no `FAV_SEED` fallback.
    - Add `clearLegacyFavs(): void`
    - Add `favsMigrated(): boolean` and `markFavsMigrated(): void`, on key `'cookbook.favsMigrated'`.
  - `@Injectable({ providedIn: 'root' }) class FavoritesMigration { run(): Promise<number> }`. It returns the number of favorites pushed:

```text
if prefs.favsMigrated() or !recipes.canSave() or a run is in flight → return 0
await recipes.whenLoaded(); if status !== 'ready' → return 0
stored = prefs.legacyFavs()
local = stored ?? (recipes.favCount() === 0 ? [...FAV_SEED] : [])
todo = local.filter(slug => recipes.bySlug(slug) && !recipes.isFav(slug))
for each slug: await recipes.setFavorite(slug, true)   // any throw → return pushed so far, flag NOT set
prefs.markFavsMigrated(); if stored !== null → prefs.clearLegacyFavs(); return todo.length
```

  - `AppComponent` runs an effect: when `recipes.canSave()` and `recipes.status() === 'ready'`, it calls `untracked(() => void migration.run())`.
  - Library and detail:
    - With `canSave()`, the star toggle calls `recipes.toggleFav`. On failure, the detail page shows `describeDeviceError`; the library card restores state silently.
    - Without it, a favorite shows a static `star` icon with `aria-label="Favorite"`, and a non-favorite shows nothing.

- [ ] **Step 1: Write the failing tests**
  - Migration: `pushes stored favorites once and sets the flag`.
  - Migration: `pushes FAV_SEED only when the server has no favorites and nothing is stored`.
  - Migration: `pushes nothing from a device with no stored list once the server has favorites`.
  - Migration: `skips slugs already favorite or unknown`.
  - Migration: `retries next time when a push fails` (`failNext`). The flag stays unset and the stored list is kept.
  - Migration: `does nothing on a locked read-only device`.
  - Store: `toggles favorite through the repository`.
  - Store: `filters favsOnly by the server flag`.
  - Library: `shows a static star, not a button, on a locked device`.
  - Detail: `toggles favorite on an unlocked device`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - Check whether `FAV_SEED` is still used anywhere besides the migration and the mock spec: `grep -rn FAV_SEED src`. Remove any leftover use.
- [ ] **Step 4: Run the full suite.**
  - Run `npx ng test --watch=false --browsers=ChromeHeadless` in the background.
  - Expected: 0 failures.
- [ ] **Step 5: Commit** — `feat: favorites sync to the recipe and migrate once per device`

---

## Hand-off notes for Sam (after Task 23)

- **API `.env`:** add `ANTHROPIC_API_KEY=` (photo import) and `RECIPES_DEVICE_KEY=` (passcode) locally.
- **Heroku:** set `RECIPES_DEVICE_KEY` with `heroku config:set`. Leave `RECIPE_IMPORT_ENABLED` and `ANTHROPIC_API_KEY` unset there.
- **Merging:** merge the API before deploying the frontend. The live site's unlock calls `/device/verify`, which does not exist until Heroku deploys the API.
- **Nothing has been pushed.**
