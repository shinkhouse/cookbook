# URL Import, Editing and Embedded Recipes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** On localhost, Sam can import a recipe from a URL into the editable create form, edit any published recipe, and nest sub-recipes ("For the sauce") inside a parent recipe.

**Architecture:**
- The API gains an SSRF-hardened `POST /import/preview`, built on the MIT TypeScript `recipe-scrapers` package.
- The API's recipe validation gains three fields: `sourceUrl`, `components` and `component`.
- In the Angular app, the create form becomes a shared editor for three modes: new, import and edit.
- Embedded recipes are ordinary recipe documents with `component: true`, referenced from the parent's `components` list.

**Tech Stack:**
- API: Express 4 on Node 22, CommonJS, Jest and supertest.
- `recipe-scrapers`, an ESM package, loaded with `await import()`.
- `cheerio` and `zod`, both peers of `recipe-scrapers`.
- Frontend: Angular 21 with signals, Karma/Jasmine and Angular Material.

**Decisions (Sam approved the direction; these specifics are controller calls):**
- **Local only:**
  - The import endpoint and every write sit behind `requireLocalWrite`, which requires a localhost Origin and the key.
  - The import router is mounted only when `RECIPE_IMPORT_ENABLED=true`.
  - Edit and import UI render only when the store is `writable`, which is dev builds only.
- **Edit before publish:** an import never saves by itself. It fills the form, and only Save writes. Saving is publishing.
- **`sourceUrl`:** optional. If present, it must be an http(s) URL string. The recipe page shows a "Source" link when it is set.
- **Embedded recipes:**
  - A sub-recipe is a full recipe document with `component: true`.
  - The parent carries `components: [{ slug, label? }]`, ordered.
  - `component` recipes are hidden from the library, search and facets, but `bySlug` resolves them.
  - The parent page shows each component as a titled section, with its ingredients and steps.
  - The parent's servings scale applies to its components.
  - Adding the parent to the shopping list includes component ingredients.
  - Cook mode runs component steps first, each labelled with the component's title, and then the parent's own steps.
  - Archiving a parent does not touch its components.
  - Components are one level deep. A component cannot itself have components; validation rejects it.
- **Import mapping:**
  - The first, unnamed ingredient group becomes the parent's ingredients.
  - Each named group becomes a component draft, titled after the group's name, holding its ingredient lines. Its steps start empty and Sam fills them in the editor.
  - Ingredient lines go through the app's existing `parseIngredient`.

## Global Constraints

- **API repo:** `/Users/shinkhouse/Documents/Development-Projects/api.samuelhinkhouse.com`, branch `main`.
  - Work on a new branch, `feat/import-edit-components`, from `main`.
  - CommonJS, 4-space indent.
  - Response bodies never carry `_id`, and error bodies never echo driver or fetch messages.
- **Frontend repo:** `/Users/shinkhouse/Documents/Development-Projects/cookbook`. Work on `feat/import-edit-components`, created from `main` (`53a3802`).
  - 2-space indent in TS; match each file's existing indent in templates and SCSS.
- No new hard-coded colours. Respect `prefers-reduced-motion`.
- **Never stop, or bind to, ports 4200, 4300, 4310 or 3152.** They belong to other processes. Use 3153/4320 for checks, and kill only PIDs you start.
- Never print `.env` or the key. Never commit `.env`.
- **Known pre-existing frontend failures:** exactly 2 (`recipes.mock.spec` "leaves the imported recipes their steps" and `recipe-health.spec` "finds the three recipes with no method"). Any other failure is a regression.
- No pushes. Sam merges.

## Review Focus

1. **SSRF:** a URL resolving to `127.0.0.1`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`, `::1`, `fc00::/7` or `fe80::/10` must be refused. So must a public URL that redirects to one of those, a non-http(s) scheme, a body over 3 MB, a response slower than 10 s, and a non-HTML content type. (Task A2)
2. **Partial save:**
   - When saving a parent with new components, a component that fails to save must stop the save before the parent is written.
   - Components already saved stay as hidden `component` recipes.
   - The form stays open with the error.
   - Retrying must not duplicate components that already exist; on retry, reuse slugs that are already saved. (Task F3)
3. **Editing never changes the slug:** a PUT whose body slug differs is a 400 (existing API rule). The editor locks the slug. (Task F2)
4. **A component whose parent is archived, or that no parent references, never appears in the library.** A parent whose component slug no longer resolves still renders, skipping the missing component. (Task F1, F4)
5. **Cook mode with components:** the step count, the progress bar, "Step n of m", the one-timer-per-step keys and the jump list all cover the combined component + parent step sequence. (Task F4)

---

### Task A1: API: validate `sourceUrl`, `components`, `component`

**Files:**
- `recipes.validation.js`
- `test/recipes.validation.test.js`
- `test/recipes.routes.write.test.js`
- `docs/recipes-api.md`

**Interfaces:**
- Produces three new optional recipe fields, all in `RECIPE_FIELDS`:
  - `sourceUrl`: string, an `http:` or `https:` URL, at most 2048 characters.
  - `component`: boolean.
  - `components`: array of `{ slug: non-empty string, label?: string }`, at most 20. Other keys are dropped. No duplicate slugs. It must not include the recipe's own slug.
- A recipe with `component: true` and a non-empty `components` is rejected with 400 `'A component recipe cannot contain components.'`.

**Steps:**
1. Write failing validation tests for each rule. Exact messages:
   - `'sourceUrl must be an http(s) URL when present.'`
   - `'component must be a boolean when present.'`
   - `'components must be an array of { slug, label? } when present.'`
   - `'components must not repeat a slug.'`
   - `'A recipe cannot contain itself.'`
   - The nesting message above.
2. Implement them.
3. Write a route test: a PUT round-trips all three fields.
4. Update the docs.
5. Commit: `feat: recipes carry a source URL and embedded components`.

### Task A2: API: `POST /import/preview`

**Files:**
- `import/fetch-page.js`: the SSRF-safe fetcher.
- `import/extract.js`: `recipe-scrapers` → response shape.
- `routes/import.js`
- `index.js`: mount `/import` after `cors()`, only when `process.env.RECIPE_IMPORT_ENABLED === 'true'`.
- Tests:
  - `test/import.fetch.test.js`: a local `http` server for oversize, slow, redirect and content-type cases; mock `dns.lookup` for private-IP cases.
  - `test/import.extract.test.js`: fixture HTML with schema.org JSON-LD, including `HowToSection` and ingredient groups.
  - `test/import.routes.test.js`
  - Wiring test update.
- `docs/import-api.md`
- `package.json`: pin `recipe-scrapers` (3.5.0), `cheerio` and `zod`, at the versions it peers with.

**Interfaces:**
- `POST /import/preview`, body `{ url }`, protected by `requireLocalWrite`.
- 200 response:

  ```
  {
    sourceUrl,
    title,
    description,
    servings?,
    time?,
    image?,
    tags?,
    ingredientGroups: [{ name: string|null, lines: string[] }],
    steps: string[]
  }
  ```

  All strings are tag-stripped and trimmed.
- 400 for a bad or blocked URL: `'That address can\'t be imported.'`
- 422 when no recipe is found: `'No recipe found on that page.'`
- 502 for upstream failure or block: `'The site didn\'t return the page. Paste the page source instead.'`
- 504 on timeout: `'The site took too long to respond.'`

**Fetcher rules** (Review Focus 1):
- `http:`/`https:` only.
- Resolve DNS in the agent's `lookup` hook, and reject private, loopback, link-local and unique-local IPv4/IPv6 addresses, so the checked IP is the one connected to.
- Follow at most 5 redirects manually, re-validating each hop.
- 10 s total timeout.
- 3 MB body cap: abort when exceeded.
- Require a `text/html` or `application/xhtml+xml` content type.
- Send a browser-like `User-Agent` and `Accept-Language: en`.
- Use Node's built-in `http`/`https`, or `undici` if already present. Don't add an HTTP client dependency unless needed.

**Extraction:**
- Call `scrapeRecipe(html, url, { safeParse: true })` from `recipe-scrapers` via dynamic import.
- Map its result to the response:
  - Ingredient groups come from the library's grouped ingredients when present; otherwise one `{ name: null, lines }` group.
  - Steps come from the instructions list.
  - Yields are parsed to a number, and so on.
- If the library finds nothing, return 422.

**Steps:**
1. Write failing tests for every fetcher rule and mapping.
2. Implement.
3. Add the route tests (gate, 400/422/502/504, the happy path with a stubbed fetcher).
4. Write the wiring test: `/import` is mounted only when the flag is set.
5. Commit: `feat: preview a recipe from a URL, locally only`.
6. Note for Sam: add `RECIPE_IMPORT_ENABLED=true` to the local API `.env`. The agent must not edit `.env`.

### Task F1: Frontend model, store and shopping list for components

**Files:**
- `core/model/recipes.model.ts`
- `core/recipe-repository.ts`: keep `isRecipe` tolerant of the new fields.
- `core/stores/recipe.store.ts`
- `core/stores/list.store.ts`
- Specs.

**Interfaces:**
- `Recipe` gains `sourceUrl?: string`, `component?: boolean` and `components?: { slug: string; label?: string }[]`.
- `RecipeStore`:
  - The library, search, facets and counts exclude `component` recipes, as well as archived ones.
  - `bySlug` still resolves components.
  - New: `componentsOf(slug): { label: string; recipe: Recipe }[]`. It is ordered, skips unresolved or archived components, and the label falls back to the component's title.
- `ListStore`: adding a parent includes its components' ingredients, scaled the same way. Use the existing grouping rules.

**Steps:** write the specs first (Review Focus 4), implement, run the full suite, commit `feat: recipes can embed other recipes`.

### Task F2: Edit an existing recipe

**Files:**
- `app.routes.ts`: `recipes/:slug/edit`, with `canMatch` writable, the same as `recipes/new`, and a title resolver.
- The recipe-detail page: an "Edit" button, writable only, next to Archive.
- The create-recipe component: an edit mode, plus specs.

**Behaviour:**
- Edit mode loads the recipe by slug into the form (after `whenLoaded`) and shows the slug read-only.
- The heading reads "Edit recipe".
- Save calls `RecipeStore.update` and navigates to the recipe.
- Errors are shown via `describeWriteError`, and the form stays open.
- Fields not on the form (`cooked`, `photo`, `archived`, `sourceUrl`, `components`) are preserved.
- An unknown slug shows not-found.

**Steps:** specs first (Review Focus 3), implement, commit `feat: edit a published recipe`.

### Task F3: Import from URL and the embedded-recipe editor

**Files:**
- `core/import-client.ts`: `previewRecipe(url): Promise<ImportPreview>` over `HttpClient` to `${apiBase}/import/preview`. Errors surface via `describeWriteError`; extend it with the 422, 502 and 504 messages, using the API's `message` when present.
- The create-recipe component:
  - The URL tab gets a URL input and an "Import" button with a pending state. The existing paste-HTML path stays as the fallback.
  - The editor gets a "Sections" area for components, each with a title plus its own ingredients and steps editors (reuse the existing row editors).
  - Specs.

**Behaviour:**
- Import fills title, description, servings, time, photo, tags and steps, plus ingredients from the unnamed group, all via `parseIngredient`.
- Each named group becomes a component draft.
- `sourceUrl` is set.
- In edit mode, the recipe's existing components load as editable sections too.
- **Save order:**
  1. Each new component is created with `component: true`, slug = `${parentSlug}-${slugify(section title)}`, via the store's unique-slug rule. Existing components are updated.
  2. Then the parent is created or updated with `components: [{ slug, label }]`.
  - On a component failure, stop before the parent and show the error.
  - Remember the slugs already saved in the component's state, so a retry updates them rather than creating duplicates (Review Focus 2).
- The recipe page shows "Source" (a link, `rel="noopener"`, opening in a new tab) when `sourceUrl` is set.

**Steps:** specs first (import fill mapping, component drafts, save order, partial-failure retry without duplicates, edit loads components), implement, commit `feat: import a recipe from a URL and edit its sections`.

### Task F4: Show components on the recipe page and in cook mode

**Files:**
- The recipe-detail component: render the parent's own ingredients, then one titled section per component (label → heading, ingredients, steps), all scaled by the parent's servings factor. The ingredient check state covers component ingredients too.
- The cook-mode component: the step sequence is component steps (each labelled with the component label) followed by the parent's steps. The ingredients panel lists the parent's and the components' ingredients, grouped by component.
- Specs.

**Behaviour:**
- Cook mode uses one flat step list throughout (Review Focus 5): "Step n of m" counts all steps, timers are keyed by the flat index, the jump list shows component labels as small headers, and the progress bar runs across the whole list.
- A missing component is skipped.

**Steps:** specs first, implement, commit `feat: show embedded recipes on the page and in cook mode`.

### Task V: End-to-end check (no code)

1. Run the API from `feat/import-edit-components` on 3153 with `RECIPE_IMPORT_ENABLED=true PORT=3153`, and the frontend on 4320 with `API_TARGET=http://localhost:3153`.
2. Verify the import preview through the proxy against a public recipe URL that has ingredient groups, e.g. a serious eats or bbc good food recipe. Read-only; nothing is saved.
3. Render check with Playwright:
   - The import fills the form with sections.
   - The edit page loads an existing recipe.
   - A seeded test is **not** run against Atlas.
4. Composition rendering is covered by specs. Skip any write to the real database; Sam will do the first real import himself.
