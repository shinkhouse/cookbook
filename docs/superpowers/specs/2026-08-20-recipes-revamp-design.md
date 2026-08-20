# Sam's Recipes — Revamp Design

**Date:** 2026-08-20
**Branch:** `feat/revamp` (from `ng21-migration`)
**Source of truth for visuals:** design handoff + 12 screenshots in `~/Downloads/screens/`

## 1. What this is

A revamp of the existing cookbook app: a new visual system, two new screens (cook
mode, shopping list), a rebuilt create flow, and one codebase serving both mobile
and desktop through fluid layout rather than separate builds.

The app currently has four screens on Angular 21 with NgModule-based lazy routes,
14 recipes of mock data, and ingredients stored as flat strings. The revamp keeps
the recipe data, restructures the ingredient shape, and replaces everything above it.

### Approved decisions

| Decision | Choice |
|---|---|
| Angular Material | Keep, themed through `--mat-sys-*` tokens |
| Sequencing | All five screens in one pass, committed per screen |
| Ingredient migration | Build the parser first, use it to migrate, hand-correct misses |

### Non-goals

Explicitly out of scope, taken from the handoff's own "not yet built" list:

- Merging duplicate ingredients across recipes with unit conversion
- Manual one-off shopping-list items
- Real list sharing (the Share button will be present but inert)
- Live cross-origin URL fetching — the URL tab parses pasted HTML/JSON-LD if
  given it, but does not fetch
- Server-side anything. No backend; persistence is `localStorage`
- Pagination/virtualization of the library grid (noted for "hundreds of recipes",
  not needed at 15)

## 2. Architecture

### 2.1 Components

Standalone components throughout, with `loadComponent` routes replacing the four
lazy NgModules. Signals for all component state.

The create flow is the reason this matters most: four tabs sharing one editable
draft is substantially simpler as a signal than as a module plus a service.

### 2.2 State — three stores

| Store | Holds | Persisted |
|---|---|---|
| `RecipeStore` | recipe collection, derived tag list, search + filter | no |
| `ListStore` | `cart` (recipe slugs), `bought` (item keys) | `localStorage` |

A `bought` key is `` `${slug}:${ingredientIndex}` ``. It must be scoped per recipe,
not per ingredient name — two recipes both needing garlic are two separate rows
(merging is out of scope), so checking one must not check the other.

| `PrefsStore` | `favs` (slugs), layout preference | `localStorage` |

Ephemeral, held locally in the owning component and deliberately **not** persisted:
search text, active tag filter, servings override, ingredient check state,
cook-mode step index, running timers.

`localStorage` access goes through a single injectable wrapper so it can be faked
in tests and so a quota/private-mode failure degrades to in-memory rather than
throwing.

### 2.3 Routing

```
/                        library
/recipes/:slug           detail
/recipes/:slug/cook      cook mode — child of detail, not a top-level destination
/recipes/new             create
/list                    shopping list
/recipe/:id              redirect → /recipes/:slug
/search                  removed; search is inline in the library
**                       redirect → /
```

Navigation model: global nav offers only **All recipes** and **Shopping list**. A
recipe is reached by tapping a card. Cook mode is entered from a recipe with
"Start cooking" and exits back to that same recipe.

`baseHref` stays `/cookbook/` so the existing GitHub Pages deploy keeps working.

### 2.4 Material component map

**Keep:** `mat-icon`; `mat-checkbox` (this is what satisfies the handoff's
accessibility note about real checkbox inputs); `mat-form-field` / `mat-input`
for the create flow; `mat-menu` for the mobile drawer.

**Hand-roll:** cards, tag pills, servings stepper, the whole of cook mode,
aisle-grouped list rows, the file dropzone.

**Drop:** `mat-grid-list`. The library grid is
`repeat(auto-fill, minmax(268px, 1fr))`, which CSS Grid does natively.

## 3. Visual system

**Revised 2026-08-20** after review of the first build. The original direction —
cream paper, a serif display face, a green accent — was rejected as reading like
a generic template rather than a choice. Replaced with navy on white, set
entirely in Figtree. Reference: the Blue Apron web screens.

### 3.1 Tokens

Defined once as CSS custom properties on `:root`, then mapped onto Material's
`--mat-sys-*` system tokens so Material components inherit them.

Surfaces are deliberately **cool** greys, not cream. The only warm colour in the
system is `ember`, and it is spent on one thing.

| Token | Hex | Use | On `surface` |
|-------|-----|-----|--------------|
| `paper` | `#FFFFFF` | Page | — |
| `surface` | `#F7F8FA` | Cards, panels | — |
| `surface-sunk` | `#F0F2F6` | Wells, inputs on a card | — |
| `navy` | `#1B3A6B` | Primary actions, section heads, step numbers | 10.60 |
| `navy-deep` | `#142B4F` | Hover, footer band, cook-mode ground | 13.28 |
| `navy-tint` | `#EDF1F8` | Badges, notes panel, on-list state | — |
| `navy-tint-edge` | `#D8E1F0` | Border for the above | — |
| `ink` | `#16202E` | Headings, primary text | 15.44 |
| `ink-2` | `#3D4A5C` | Body copy | 8.47 |
| `ink-3` | `#5A6878` | Secondary copy, placeholders | 5.36 |
| `ink-4` | `#667383` | Small-caps labels, captions | 4.55 |
| `ink-5` | `#8B97A6` | Struck-through rows only, always with `line-through` | 3.28 |
| `rule` | `#E2E6ED` | Hairlines | — |
| `rule-strong` | `#C8D0DC` | Button borders, dashed dropzones | — |
| `ember` | `#C95028` | The single primary action on a screen | white on it: 4.50 |
| `ember-deep` | `#A8401E` | Hover on ember | — |

Every value carrying text was measured against WCAG AA before landing. `ink-4`
and `ember` were both darkened from their first draft to clear 4.5:1 — `ember`
specifically so white button labels pass on it.

Cook mode is not a separate palette. It is the same navy taken to its dark end,
so it reads as the same product with the lights turned down: bg `#101F38`,
surface `#172B4A`, rule `#24395C`, accent `#7FA8E0` (5.77), text `#EEF2F8`
(12.56).

### 3.2 Type

**Figtree throughout.** One family, self-hosted via `@fontsource` (weights 400,
400 italic, 500, 600, 700, 800; latin subset). No CDN.

With a single family, the three type roles that used to need three faces come
from weight, case and tracking instead:

- **Display** — 800, `letter-spacing: -0.028em`, `line-height: 1.06`. At display
  sizes the weight carries the personality, since there is no second family.
- **Section title** — 800, uppercase, `letter-spacing: 0.055em`, navy. Always
  paired with a lowercase italic kicker above it (`.section-kicker`). This pair
  is the page's structural signature and appears above every major section.
- **Body** — 400 / 500, `line-height: 1.62`.
- **Data label** (`.label`) — 700, uppercase, `letter-spacing: 0.15em`, 10.5px.
  Replaces what IBM Plex Mono used to do.
- **Figures** (`.tnum`) — `font-variant-numeric: tabular-nums`. This is what
  lets amount columns align without a monospace family.
- **Italic** — reserved for credit lines and section kickers, where it carries
  meaning rather than decoration.

Fluid display sizes: library H1 `clamp(38px, 6vw, 62px)`; detail H1
`clamp(32px, 5vw, 52px)`; cook step `clamp(27px, 3.6vw, 40px)`.

### 3.3 Shape, spacing, motion

- Radii: `6px` cards and panels, `999px` buttons and chips, `3px` checkboxes.
- Borders first, with two soft shadows (`--shadow-card`, `--shadow-lift`) for the
  cards and panels that need to lift off the white.
- Section padding `clamp(24px, 5vw, 64px)`; gutters `clamp(16px, 4vw, 40px)`;
  grid gaps `clamp(18px, 2.4vw, 28px)`.
- Motion: `fadeUp` 0.28s on cards, 0.16s drawer, 0.25s cook progress-bar width.
  All motion respects `prefers-reduced-motion`.

### 3.4 Signature devices

Three devices carry the identity, and they are used consistently rather than
decoratively:

1. **Kicker over uppercase title.** Every major section is introduced by a
   lowercase italic phrase over a letterspaced uppercase navy heading —
   *what you need* / **INGREDIENTS**, *step by step* / **METHOD**,
   *from the cook* / **NOTES**.
2. **The two-column amount.** Ingredient rows set the amount right-aligned in a
   fixed 62px column with tabular figures, so quantities stack in a line down
   the list the way a printed recipe card sets them. Used identically on the
   detail page, in cook mode and on the shopping list. A long unit such as
   "1 small can" wraps within the column rather than pushing the name.
3. **The times-cooked count.** In a cookbook kept over years, how often a recipe
   actually got made is the honest measure of it, so that figure gets display
   type: the library header sets the most-cooked count at `clamp(46px, 5vw, 62px)`
   in navy.

`ember` appears once per screen at most — "Start cooking" on the detail page. Cook
mode's "Next step" deliberately stays blue: it is a navigation control pressed
many times, not a hero action, and making it loud would spend the accent's
meaning.

### 3.5 Layout

Fluid, not breakpoint-driven. Two-column regions are `flex-wrap` with
`flex: 2 1 420px` / `flex: 1 1 280px` so they stack naturally. Max content width
1280px library, 1140px detail/cook/create, 1000px shopping list. The detail hero
is full-bleed; only the body copy is measured.

**One** real JS breakpoint: `760px`, below which the header nav collapses to the
hamburger drawer. Everything else is CSS.

Touch targets 44px minimum, 48px in cook mode and on shopping-list rows.

## 4. Data model

```ts
type Aisle = 'produce' | 'meat' | 'seafood' | 'dairy' | 'pantry';

// Storage key vs display label — these differ and the mapping is explicit:
//   produce → "Produce"   meat → "Meat"   seafood → "Fish counter"
//   dairy   → "Dairy"     pantry → "Pantry"
// Display order in the shopping list follows that same sequence.

type Ingredient = {
  qty: number | null;   // null = "to taste"
  unit: string;         // "" for countables
  name: string;
  aisle: Aisle;
};

type Recipe = {
  slug: string;
  title: string;
  subtitle?: string;    // credit line, rendered italic
  tags: string[];
  time: string;         // display string, e.g. "20–30 min"
  servings: number;     // base yield for scaling
  cooked: number;       // times-cooked counter
  blurb: string;        // card copy
  desc: string;         // detail copy
  ingredients: Ingredient[];
  steps: string[];
  notes: string[];
  photo?: string;
};
```

### 4.1 Migration from the current shape

The existing model differs in ways that need explicit handling:

| Current | Target | Action |
|---|---|---|
| `ingredients: string[]` | `Ingredient[]` | Parse all 136 lines, hand-correct, assign aisles |
| `cookTime: string` (`"20 to 30 minutes"`) | `time: string` (`"20–30 min"`) | Rewrite to display form |
| `description` | `desc` + `blurb` | `desc` from existing; author a shorter `blurb` per recipe |
| — | `cooked: number` | New. Seed with plausible values; Grandma's Spaghetti is 41 per the design |
| `servings?: number` | `servings: number` (required) | Fill any missing with a sensible default |
| `favorite?: boolean` | moves to `PrefsStore.favs` | Seed `favs` from existing flags, drop the field |
| `authors`, `calories`, `urls`, `equipment` | — | Dropped; unused by any screen in the new design |

Tag pills are **derived from recipe data**, not hardcoded — so they will read
`Pasta`, `Italian`, `Dinner`, `Beef` etc. from the real 14 recipes rather than the
handoff's illustrative `Family` / `Sheet Pan` set. Display is title-cased from the
stored lowercase values.

Real `coverImage` URLs are kept as `photo`. The striped placeholder renders only
where `photo` is absent.

## 5. Pure-logic kernel

Four dependency-free modules in `core/`. These carry the actual risk in this
project and get built test-first.

### 5.1 `scale.ts`

`factor = chosen / base`. Every ingredient `qty` multiplies by it.

Rendering: nearest vulgar fraction from ⅛ ¼ ⅓ ⅜ ½ ⅝ ⅔ ¾ within tolerance `0.04`,
including mixed numbers (`1½`); otherwise 2 decimals with trailing zeros trimmed.
`qty: null` renders as no amount at all ("to taste").

Label reads "as written" at factor 1, else "scaled ×1.5".

**Scales amounts only. Never step text** — a step saying "add half the butter"
stays untouched.

### 5.2 `ingredient-parser.ts`

`string → { qty, unit, name }`.

Must handle, from the real data: `"1/2 hamburger"` (bare fraction),
`"2 tablespoons dried onion"` (long unit), `"1 small can tomato paste"`
(qualifier between qty and unit), `"can of tomato juice"` (no qty),
`" 1 tablespoon chili powder"` (leading whitespace), unicode fractions, and
`"to taste"` → `qty: null`.

Ranges (`"2-3 cloves garlic"`) resolve to the **upper bound** — you buy 3, not 2 —
matching the rule `timer.ts` uses for durations, so the two are not surprising in
different directions.

Unit names normalize to a canonical short form (`tablespoons`/`tbsp.` → `tbsp`).
Unrecognized leading words stay part of `name` rather than being guessed at as units.

### 5.3 `aisle.ts`

`name → Aisle` via a keyword lookup table, defaulting to `pantry`. Longest-match
wins so "chicken broth" resolves to pantry, not meat. Exposes an override so the
create-flow editor can correct it.

### 5.4 `timer.ts`

`string → duration | null`. Beyond the prototype's `/(\d+)\s*minute/i`: matches
hours, and for ranges (`"20–25 minutes"`, both hyphen and en-dash) **uses the
upper bound**. Returns the first match in a step.

## 6. Screens

### 6.1 Library — `/`

- Header stat block showing the most-cooked recipe.
- Search matching title, tags, **and ingredient names** — the ingredient match is
  the point of the feature. Debounced 150ms.
- Tag pills, single-select, "All" default, derived from data.
- Favorites toggle; star button overlaid on each card photo.
- Card actions: **Cook this** (straight into cook mode) and **+ List** /
  **✓ On list** toggle.
- Grid `repeat(auto-fill, minmax(268px, 1fr))`.
- Empty state: "Nothing matches that yet."

### 6.2 Detail — `/recipes/:slug`

- Full-bleed hero band, `height: clamp(180px, 32vw, 340px)`.
- Title, optional italic credit line, description, then a metadata rail:
  duration, servings stepper, times cooked.
- Servings scaler per §5.1.
- Ingredients tap-to-check — strikethrough plus filled box. Per-recipe, ephemeral.
- Layout toggle: "Side by side" (sticky ingredient card, `top: 92px`) vs
  "Single column" (68ch measure). **Persisted** in `PrefsStore`.
- Notes panel renders only when notes exist.
- Actions: Start cooking (primary), Add to list, favorite.

### 6.3 Cook mode — `/recipes/:slug/cook`

- Dark full-screen view; one step at `clamp(28px, 3.6vw, 40px)`, progress bar,
  "Step n of m".
- Back / **Next step**; the final step's button reads "Done cooking" and returns
  to the recipe.
- Jump list of all steps below, current highlighted, tap to jump.
- Ingredient sidebar sharing the detail page's check state and scale factor.
- Auto timers per §5.4: a match adds "Start N min timer"; countdown renders `m:ss`
  in the header. Multiple concurrent timers allowed. At zero: a sound plus a
  notification if permission has been granted.
- **Screen wake lock** requested on entry (`navigator.wakeLock.request('screen')`),
  released on exit, feature-detected and silently skipped where unsupported.

### 6.4 Add recipe — `/recipes/new`

Four tabs over one shared editable draft. **Nothing saves until confirmed.**

- **Paste text** (default). Live parse: first line → title; `Ingredients` and
  `Steps|Directions|Instructions` headings switch sections; `-`, `*`, `•`, `1.`
  prefixes stripped. Before any heading, lines starting with a digit or bullet are
  ingredients, the rest steps.
- **Markdown file** — drop `.md` / `.txt`, or a folder for bulk import.
  Front-matter supplies title, servings, tags.
- **From a URL** — parses pasted schema.org `Recipe` JSON-LD, falling back to text
  parsing. Does not fetch (see non-goals).
- **Manual** — the long form as fallback.

Right column is a sticky draft preview with a parse-status badge:
`Waiting` → `Check the split` → `Parsed cleanly`. Save recipe / Copy JSON.

Amounts normalize to `Ingredient` at import so scaling and the shopping list work
on imported recipes. Aisle is inferred with a manual override in the editor.

### 6.5 Shopping list — `/list`

- Aggregates ingredients from every recipe on the list, grouped by aisle:
  Produce, Meat, Fish counter, Dairy, Pantry. Grid
  `repeat(auto-fill, minmax(260px, 1fr))`.
- Each row shows amount, name, and the source recipe beneath.
- Check off to buy; "Uncheck all"; recipe chips at top with × to remove a recipe
  and all its items.
- Duplicate ingredients across recipes appear as separate rows — merging is
  explicitly out of scope and is the highest-value follow-up.

## 7. Accessibility

Finishing the items the prototype left open:

- Real `<input type="checkbox">` via `mat-checkbox` on every check row.
- Focus trapping in the mobile drawer, restoring focus to the trigger on close;
  `Esc` closes.
- Cook mode announces step changes through a polite live region.
- `2px` accent focus outline on all interactive elements, not only inputs.
- Colour pairs verified against WCAG AA: `ink-4` on `paper` and `accent` on
  `paper` are the two at risk and will be measured, with tokens adjusted if they
  fail rather than shipped unverified.
- All motion behind `prefers-reduced-motion`.

## 8. Testing

Test-first on the kernel, because that is where correctness actually lives:

- `scale.ts` — fraction boundaries either side of the 0.04 tolerance, mixed
  numbers, null qty, factor 1 identity.
- `ingredient-parser.ts` — every one of the 136 real lines as a corpus, plus the
  awkward cases in §5.2.
- `aisle.ts` — longest-match precedence, the "chicken broth" class of trap.
- `timer.ts` — ranges with both dash characters, hours, no-match.

Component tests cover behaviour, not scaffolding: search matches an ingredient
name; the servings stepper rescales; removing a recipe chip drops its list items;
the last cook step returns to the recipe.

The suite currently stands at 13 passing. That exact count will **not** hold —
`recipe.component` and `create-recipe` are being replaced outright, so their specs
go with them. The standing requirement is that the suite is green at every commit
and that total coverage rises rather than falls; kernel tests should more than
replace what the retired component specs covered.

### Files being deleted

`pages/search/` (search is inline in the library now, and the page is an
untracked scaffold that was never finished), and the old `pages/recipe/`,
`pages/recipes/`, `pages/create-recipe/` modules once their replacements land.
`app.module.ts` and `app-routing.module.ts` go when the app moves to standalone
bootstrap.

## 9. Risks

1. **The reference build is missing.** `Sams Recipes.dc.html` is not on this
   machine — only the Math Facts ones. Interaction details not visible in the 12
   screenshots (drawer motion, parse-badge transitions, timer states) are being
   inferred from the written spec. Adding the file to the repo would settle them.
2. **Material theming is unproven at this fidelity.** `--mat-sys-*` mapping should
   handle colour and type, but pill radii and hairline borders on Material
   primitives may still need per-component overrides. First real test is the
   create flow's form fields.
3. **Parser accuracy on 136 lines.** Expect misses; every parsed result gets
   reviewed by hand before it lands as seed data.
4. **`blurb` copy does not exist.** 15 short card strings need authoring. Drafting
   them from each `desc`, flagged for your review rather than silently invented.
