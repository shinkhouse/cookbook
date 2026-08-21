# Multiple Cookbooks — Data Model Design

**Date:** 2026-08-21
**Status:** approved, not yet implemented
**Supersedes:** §4 of `2026-08-20-recipes-revamp-design.md` (data model), and its
§2.2 store table (three stores becomes four)

## 1. What this is

The recipe collection is currently one flat list. This adds a `Cookbook` entity
and a many-to-many relation between cookbooks and recipes, so the collection can
eventually hold Sam's cookbook alongside Bob's and Grandma's.

**This is a model-layer change only.** No screen changes, no cookbook picker, no
new routes. The eventual UI is a pooled all-recipes library with cookbook as
another filter facet, and that intent shapes the model choices below — but none
of it is built here.

### Approved decisions

1. Membership lives **on the recipe**, as `Recipe.cookbooks: string[]`. `Cookbook`
   is a metadata-only record.
2. All 72 existing recipes go into **one** cookbook to start.
3. A recipe **may belong to zero cookbooks**. Membership is optional.
4. Deleting a cookbook drops its memberships and leaves the recipes alone.

### Non-goals

- Any UI: no picker, no cookbook facet, no cookbook management screen.
- Per-cookbook recipe ordering. Rejected with approach B (§2).
- Per-membership metadata — date added, a note scoped to one cookbook. Rejected
  with approach C (§2).
- Cookbook owners as first-class records. The name carries the attribution
  ("Grandma's Cookbook") until something needs more.
- Sharing, permissions, multi-user. This is a personal app.

## 2. Data model

`core/model/cookbooks.model.ts` — new:

```ts
export interface Cookbook {
  /** Stable key that Recipe.cookbooks references. Slug-style. */
  id: string;
  /** Display name, e.g. "Grandma's Cookbook". */
  name: string;
  /** Optional one-line description, for a future cookbook picker. */
  description?: string;
}
```

Deliberately absent, per YAGNI, all additive later: `owner` (the name already
carries it), a cover photo, `createdAt`.

`Recipe` gains one field:

```ts
/**
 * Ids of the cookbooks this recipe appears in. Empty is legal — an unfiled
 * recipe still belongs to you, and still shows in the pooled library.
 */
cookbooks: string[];
```

Required rather than optional. An optional array pushes `r.cookbooks ?? []` into
every consumer; instead the repository normalizes at the boundary (§4) so the
field is always present above it. `RecipeTemplate` gets `cookbooks: []` — a
recipe from the create flow starts unfiled, and pre-selecting a cookbook there is
a UI decision for later.

### Why on the recipe

Three shapes were considered.

| | Shape | Verdict |
|---|---|---|
| A | `Recipe.cookbooks: string[]` | **Chosen** |
| B | `Cookbook.recipeSlugs: string[]` | Rejected |
| C | `Membership { cookbookId, slug }` join collection | Rejected |

A wins on reuse. The target UI is a pooled library with cookbook as a facet,
which makes cookbook behave exactly like a tag at read time — and `core/facets.ts`
is already built for string arrays on a recipe, with OR-within/AND-across
selection semantics. A also keeps one write path and one persisted collection, and
it maps cleanly onto the eventual MongoDB move as an indexed array field queried
with `$in`.

A's costs, both acceptable: "what is in Grandma's cookbook" is a scan across all
recipes, which is irrelevant at 72 records and indexable later; and there is no
home for per-cookbook ordering.

B is the better shape only if per-cookbook ordering is wanted, and it costs an
inverted index in the store plus a second collection to keep in sync — a deleted
recipe leaves dangling slugs behind without a sweep. C is the textbook answer and
the only one with room for per-membership fields, but it means three collections
and a join on every read for a personal app with no per-membership data in sight.
Both remain reachable from A without a rewrite.

## 3. Seed data

`CuratedRecipes` (14) and `ImportedRecipes` (58) become `Omit<Recipe, 'cookbooks'>[]`
— they are *source* data, unfiled by nature. Filing happens at the single existing
export point in `recipes.mock.ts`:

```ts
export const DEFAULT_COOKBOOK_ID = 'sams-cookbook';

export const Recipes: Recipe[] = fileInto(DEFAULT_COOKBOOK_ID, [
  ...CuratedRecipes,
  ...ImportedRecipes,
]);
```

where `fileInto` is a pure helper that returns new records rather than mutating
its input:

```ts
function fileInto(id: string, sources: readonly Omit<Recipe, 'cookbooks'>[]): Recipe[];
```

This keeps the diff off all 72 recipe literals. It is also the one line to change
when the collection does get split by source:

```ts
export const Recipes: Recipe[] = [
  ...fileInto('sams-cookbook', CuratedRecipes),
  ...fileInto('family-cookbook', ImportedRecipes),
];
```

The cookbook seed is a single record:

```ts
export const CookbookSeed: Cookbook[] = [
  { id: DEFAULT_COOKBOOK_ID, name: "Sam's Cookbook" },
];
```

## 4. Persistence and migration

A `CookbookRepository` seam mirroring `RecipeRepository` exactly: abstract class
with `load()`, `save()` and `durable`; a `LocalCookbookRepository` on key
`cookbook.cookbooks`; a `provideLocalCookbooks()` provider one-liner. Same
reasoning as the existing seam — when the data moves to the MongoDB-backed
`api.samuelhinkhouse.com`, only a second implementation is needed.

Seeding follows the null-sentinel rule already used for recipes and favourites:
the seed applies only when nothing has been stored, so deleting every cookbook
does not silently undo itself on the next load.

### Migrating the stored recipes

72 recipes are already in `localStorage` under `cookbook.recipes` with no
`cookbooks` field. `LocalRecipeRepository.load()` normalizes each record on the
way out: a recipe whose `cookbooks` is not an array gets `[DEFAULT_COOKBOOK_ID]`.
Idempotent, so it needs no version key — matching the style already in that file.

Order matters and is unchanged from today: the existing `isRecipe` guard filters
first, then the survivors are normalized. `isRecipe` stays a gate on the fields
the screens would throw on (`slug`, `title`, `ingredients`, `steps`) and does not
grow a `cookbooks` check — a missing `cookbooks` is the normal migration case, not
a malformed record, so rejecting on it would discard all 72 stored recipes.

**Load-bearing subtlety.** Backfilling to `[DEFAULT_COOKBOOK_ID]` rather than `[]`
is safe *only* because `save()` always writes `cookbooks` explicitly, so a recipe
deliberately unfiled persists as `[]` and stays unfiled. If the field were ever
omitted on write, unfiling would silently undo itself on the next load. A test
pins this (§6).

## 5. Stores

`ListStore` already injects `RecipeStore`, so `RecipeStore` is the base other
stores build on. `CookbookStore` follows that direction:

```
PrefsStore ← RecipeStore ← ListStore
                        ← CookbookStore → CookbookRepository
```

### `CookbookStore` — new

Mirrors `RecipeStore`'s shape: a synchronous seed so nothing paints empty, then
the repository's answer replaces it.

| Member | Purpose |
|---|---|
| `cookbooks` | The collection |
| `byId(id)` | Lookup |
| `add(cookbook)` | Returns the id actually used, suffixed to stay unique |
| `rename(id, name)` | |
| `remove(id)` | Removes the cookbook **and** calls `recipes.stripCookbook(id)` |
| `recipesIn(id)`, `countIn(id)` | Derived from `RecipeStore` |

`CookbookStore` injects `RecipeStore` and not the reverse, because deleting a
cookbook is the one operation that must touch both collections, so it belongs in
the store that can see both. This keeps `RecipeStore` entirely ignorant of
cookbooks — it treats `cookbooks` as an opaque `string[]`, exactly as it already
treats `tags`.

### `RecipeStore` additions

All cookbook-agnostic:

- `addToCookbook(slug, id)` / `removeFromCookbook(slug, id)` — idempotent, so
  adding twice cannot produce a duplicate id
- `stripCookbook(id)` — drops an id from every recipe. Named for what it does
  mechanically rather than `onCookbookDeleted`, so it reads as a plain collection
  operation and needs no knowledge of why it was called
- `inCookbook(id)` — filter helper

Each mutation persists through the existing `persist()`.

### Explicitly not added

A `selectedCookbooks` filter signal feeding `results`. Nothing reads it until the
UI exists, and it is a two-line addition then.

For that day: `Facet.kind` is already a `'tag' | 'gap'` union, so cookbook slots
in as a third kind. Its own kind rather than reusing tags, because cookbook
options need a name lookup where tags are title-cased.

## 6. Testing

TDD, against the existing karma setup.

| Spec | Cases |
|---|---|
| `recipe-repository.spec.ts` | stored recipe with no `cookbooks` loads as `[DEFAULT_COOKBOOK_ID]`; a stored `[]` survives as `[]`; a non-array `cookbooks` is normalized rather than reaching the screens |
| `cookbook-repository.spec.ts` (new) | seed applies on empty; null sentinel means an emptied collection stays empty; save/load round-trip |
| `stores.spec.ts` | membership add/remove is idempotent; `remove(id)` strips memberships without deleting recipes; `add` suffixes a colliding id |
| `recipes.mock.spec.ts` | all 72 seeded recipes carry the default cookbook; `fileInto` does not mutate its input |

## 7. Risks

**A stale `cookbook.recipes` written by an older build.** Nothing writes recipes
without `cookbooks` after this lands, but the normalizer in §4 runs on every load
regardless, so a downgrade-then-upgrade cycle self-heals.

**Dangling ids if `stripCookbook` is bypassed.** Any future path that deletes a
cookbook without going through `CookbookStore.remove` leaves recipes carrying an
unknown id. Consequence is cosmetic — an unresolvable id is skipped when names
are looked up — but the fix is to keep cookbook deletion behind that one method.

**§2.2 of the revamp spec goes stale.** It says three stores. Updating that table
is part of this work, not a follow-up.

## 8. Files touched

New:

- `src/app/core/model/cookbooks.model.ts`
- `src/app/core/cookbook-repository.ts`
- `src/app/core/cookbook-repository.spec.ts`
- `src/app/core/stores/cookbook.store.ts`

Modified:

- `src/app/core/model/recipes.model.ts` — the `cookbooks` field, `RecipeTemplate`
- `src/app/core/mock/recipes.mock.ts` — `fileInto`, `DEFAULT_COOKBOOK_ID`, source types
- `src/app/core/mock/imported-recipes.ts` — source type only
- `src/app/core/recipe-repository.ts` — normalize on load (`isRecipe` unchanged, per §4)
- `src/app/core/stores/recipe.store.ts` — membership operations
- `src/app/app.config.ts` — `provideLocalCookbooks()`
- `src/app/core/recipe-repository.spec.ts`, `stores.spec.ts`, `mock/recipes.mock.spec.ts`
- `docs/superpowers/specs/2026-08-20-recipes-revamp-design.md` — §2.2, §4
