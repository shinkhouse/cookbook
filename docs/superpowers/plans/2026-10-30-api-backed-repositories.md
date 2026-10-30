# API-Backed Repositories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cookbook app reads recipes and cookbooks from `api.samuelhinkhouse.com` instead of `localStorage`, writes through the API at `localhost:4200`, and is read-only everywhere else.

**Architecture:** The two existing seams (`RecipeRepository`, `CookbookRepository`) change from whole-collection `load/save` to per-record `list/create/update/remove` plus `writable`, and get `HttpClient` implementations. The local implementations are deleted; in-memory fakes replace them in tests. Stores start empty, expose `status`, and apply a write to their signal only after the API confirms it. In development the Angular dev server proxies `/api/*` to the API and adds the write key, so the key never enters a bundle.

**Tech Stack:** Angular 21 (standalone, zoneless, signals), `@angular/common/http` (`provideHttpClient`, `HttpTestingController`), Karma + Jasmine (`npx ng test --watch=false --browsers=ChromeHeadless`), `@angular/build:dev-server` proxy.

**Spec:** `docs/superpowers/specs/2026-10-08-api-backed-repositories-design.md` §3, §4, §6, §7, §8. The API side (its §5) is done on `api.samuelhinkhouse.com`'s `feat/cookbooks-api`.

## Global Constraints

- Branch `feat/api-backed-repositories`. Work stays unpushed and unmerged.
- The write key never appears in any file under `src/`, `environment*.ts`, or any built artifact. It reaches the API only via the dev-server proxy reading `process.env.RECIPES_WRITE_KEY`.
- `environment.apiBase` is `/api` in development and `https://api.samuelhinkhouse.com` in production.
- `writable` is `!environment.production`.
- `null` / `false` from a repository mean "no such record"; every other failure **throws**. Stores never swallow a failed write.
- A store's signal changes only after the repository call resolves. A rejected write leaves the signal exactly as it was.
- No `localStorage` for recipes or cookbooks. `Storage`, `PrefsStore` and `ListStore` keep using it for favourites and the shopping list, untouched.
- Deleting a cookbook touches no recipes. `RecipeStore.stripCookbook` and `RecipeStore.resetToSeed` are deleted.
- The proxy forwards with `changeOrigin: false`, so the API sees `Origin: http://localhost:4200`.
- Port 4200 and port 3152 belong to Sam's running dev servers. Verification steps must not stop them. Use 4300 for `ng serve` and 3153 for the API.
- 2-space indentation and single quotes, matching the existing `src/`.

## Review Focus

1. **A write the API rejects (403 because the key is unset, 409, 500, network down)** must leave the list unchanged and show an error. It must not show a recipe that was never saved. (Task 3 store test; Task 4 component test.)
2. **Deep-linking to `/recipes/:slug` or `/recipes/:slug/cook` while the first fetch is in flight** must show loading, not "not found". (Task 5.)
3. **The API returning a malformed record** (no `ingredients` array, no `slug`) must not crash a screen on render. The repository drops it, as the local repository did. (Task 3 repository test.)
4. **The deployed build offering "Add recipe"** when every write would 403. The controls must be absent, and a typed `/recipes/new` URL must redirect home. (Task 4.)
5. **A slug taken since the page loaded** (409) is a real error with a readable message, never a silent retry or a suffixed duplicate. (Task 3 store test; Task 4 `describeWriteError` test.)

## Known pre-existing failures

At `041daca` the suite is 274 passed, 4 failed. All four are drift between the bundled mock data and tests that expect specific recipes to lack a method:

- `recipes.mock.spec` "leaves the imported recipes their steps"
- `recipe-health.spec` "finds the three recipes with no method"
- `stores.spec` "filters by a gap"
- `stores.spec` "counts each gap"

Task 3 rewrites the two `stores.spec` cases against explicit fixtures, which fixes them. The other two are out of scope and should still fail identically after every task. Any *other* failure is a regression.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/environments/environment.ts`, `environment.prod.ts` (modify) | Add `apiBase`. |
| `proxy.conf.js` (create) | `/api` → API target, adds `x-api-key` from env. |
| `angular.json` (modify) | `serve.configurations.development.proxyConfig`. |
| `src/app/app.config.ts` (modify) | `provideHttpClient(withFetch())`, swap to Http providers. |
| `src/app/core/cookbook-repository.ts` (rewrite) | New contract + `HttpCookbookRepository` + `provideHttpCookbooks`. |
| `src/app/core/recipe-repository.ts` (rewrite) | New contract + `HttpRecipeRepository` + `provideHttpRecipes`. Keeps `isRecipe` / `withCookbooks`. |
| `src/app/core/testing/fake-repositories.ts` (create) | `FakeRecipeRepository`, `FakeCookbookRepository`, `provideFakeRecipes`, `provideFakeCookbooks`. |
| `src/app/core/stores/recipe.store.ts`, `cookbook.store.ts` (modify) | Async writes, `status`, `load()`, `whenLoaded()`. |
| `src/app/core/write-error.ts` (create) | `describeWriteError(err)` → user-facing sentence. |
| `src/app/app.routes.ts` (modify) | Title resolver awaits load; `canMatch` writable guard on `recipes/new`. |
| `src/app/app.component.*` (modify) | Hide "Add recipe" links when not writable. |
| `src/app/pages/create-recipe/*` (modify) | Pending and error states on save. |
| `src/app/pages/library/*`, `recipe-detail/*`, `cook-mode/*` (modify) | Loading and error states. |

---

### Task 1: HTTP plumbing and the dev proxy

**Files:**
- Modify: `src/environments/environment.ts`, `src/environments/environment.prod.ts`
- Create: `proxy.conf.js`
- Modify: `angular.json` (the `serve` target's `development` configuration)
- Modify: `src/app/app.config.ts` (add `provideHttpClient(withFetch())`; leave the `provideLocal*` lines alone)

**Interfaces:**
- Produces: `environment.apiBase: string` and `environment.production: boolean`. Tasks 2 and 3 build URLs as `` `${environment.apiBase}/recipes` ``. `HttpClient` is injectable app-wide.

- [ ] **Step 1: Add `apiBase`** — `'/api'` in `environment.ts`, `'https://api.samuelhinkhouse.com'` in `environment.prod.ts`. No trailing slash.

- [ ] **Step 2: Write `proxy.conf.js`** (CommonJS, `module.exports`):
  - One entry for `/api`.
  - `target`: `process.env.API_TARGET || 'http://localhost:3152'`.
  - `changeOrigin: false`.
  - `pathRewrite: { '^/api': '' }`.
  - `headers: { 'x-api-key': key }` only when `process.env.RECIPES_WRITE_KEY` is non-empty.
  - When the key is empty, log one `console.warn` saying writes will be refused with 403 and naming `RECIPES_WRITE_KEY`. Do not log the key.
  - Add a header comment explaining why the key lives here: spec §6, "The write key never enters the browser".

- [ ] **Step 3: Wire it.** Add `"proxyConfig": "proxy.conf.js"` to `serve.configurations.development` only.

- [ ] **Step 4: Add `provideHttpClient(withFetch())`** to `appConfig.providers`.

- [ ] **Step 5: Verify the build and the existing suite**

Run: `npx ng build --configuration development`
Expected: success.

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: 274 passed, the same 4 known failures.

- [ ] **Step 6: Verify the proxy against Sam's running API on 3152 (read-only)**

```bash
npx ng serve --port 4300 > "$TMPDIR/ng4300.log" 2>&1 &
PID=$!
# wait until the log shows "Local:" (poll up to 60 s), then:
curl -s http://localhost:4300/api/recipes | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))"
kill $PID
```

Expected: `72`. Kill only `$PID`.

- [ ] **Step 7: Commit**

```bash
git add src/environments proxy.conf.js angular.json src/app/app.config.ts
git commit -m "feat: proxy /api to the recipes API in development, adding the write key"
```

---

### Task 2: Cookbooks move to the API

**Files:**
- Rewrite: `src/app/core/cookbook-repository.ts`
- Create: `src/app/core/testing/fake-repositories.ts` (cookbook half)
- Modify: `src/app/core/stores/cookbook.store.ts`
- Modify: `src/app/app.config.ts` (`provideLocalCookbooks()` → `provideHttpCookbooks()`)
- Rewrite: `src/app/core/cookbook-repository.spec.ts`
- Modify: `src/app/core/stores/stores.spec.ts` (the `CookbookStore` describe, and every `provideLocalCookbooks` import)

**Interfaces:**
- Consumes: `environment.apiBase` (Task 1).
- Produces:

```ts
export abstract class CookbookRepository {
  abstract list(): Promise<Cookbook[]>;
  abstract create(cookbook: Cookbook): Promise<Cookbook>;
  abstract update(cookbook: Cookbook): Promise<Cookbook | null>; // null = 404
  abstract remove(id: string): Promise<boolean>;                 // false = 404
  abstract readonly writable: boolean;
}
export class HttpCookbookRepository extends CookbookRepository { /* providedIn root */ }
export const provideHttpCookbooks: () => Provider;

// core/testing/fake-repositories.ts
export class FakeCookbookRepository extends CookbookRepository {
  constructor(seed?: Cookbook[]);          // default: CookbookSeed
  writable: boolean;                       // default true, settable
  failNext(error: unknown): void;          // next call of any method rejects with it
}
export function provideFakeCookbooks(fake?: FakeCookbookRepository): Provider[];
// → [{ provide: CookbookRepository, useValue: fake ?? new FakeCookbookRepository() }]
// Tests that need failNext before the store loads construct the fake first and pass it in.

// CookbookStore
readonly status: Signal<'loading' | 'ready' | 'error'>;
readonly writable: boolean;
load(): Promise<void>;                     // sets status; never rejects
whenLoaded(): Promise<void>;               // resolves when status leaves 'loading'
add(cookbook: Cookbook): Promise<string>;  // id used; throws on failure
rename(id: string, name: string): Promise<boolean>;
remove(id: string): Promise<boolean>;      // does NOT call RecipeStore
```

`isCookbook` stays and filters `list()` results.

- [ ] **Step 1: Rewrite `cookbook-repository.spec.ts`** against `HttpCookbookRepository`, using `provideHttpClient()`, `provideHttpClientTesting()` and `HttpTestingController`:
  - `list()` → GET `/api/cookbooks`. Flushing `[{id:'a',name:'A'},{id:'',name:'x'},{name:'no id'}]` resolves to `[{id:'a',name:'A'}]`.
  - `create(c)` → POST `/api/cookbooks` with body `c`. Resolves to the response.
  - `update(c)` → PUT `/api/cookbooks/${c.id}`. A 404 flush resolves `null`.
  - `remove(id)` → DELETE `/api/cookbooks/${id}`. 204 → `true`, 404 → `false`.
  - A 500 on `list()` **rejects**. A 409 on `create` rejects with an error whose `status` is 409.
  - The id is URL-encoded: `remove('a b')` hits `/api/cookbooks/a%20b`.
  - `writable` is `true` under the test (development) environment.
  - `httpMock.verify()` in `afterEach`.

- [ ] **Step 2: Run it and see it fail** (`npx ng test --watch=false --browsers=ChromeHeadless --include='**/cookbook-repository.spec.ts'`). It fails to compile because `HttpCookbookRepository` doesn't exist.

- [ ] **Step 3: Implement** the contract, `HttpCookbookRepository` (`firstValueFrom`, catching `HttpErrorResponse` with `status === 404` only on `update` and `remove`) and `provideHttpCookbooks`. Delete `LocalCookbookRepository` and `provideLocalCookbooks`. Then write the cookbook half of `fake-repositories.ts`.

- [ ] **Step 4: Rewrite `CookbookStore`.**
  - `_cookbooks` starts as `[]`.
  - The constructor calls `void this.load()`.
  - Writes `await` the repository, then update the signal.
  - `remove` no longer calls `recipes.stripCookbook`.
  - `writable` mirrors `repo.writable`.
  - Update the class doc comment: deletion no longer cascades (spec §4).

- [ ] **Step 5: Update the `CookbookStore` tests in `stores.spec.ts`** to use `provideFakeCookbooks()` and `await store.whenLoaded()`. Add these tests:
  - `status` goes `'loading'` → `'ready'`.
  - With `failNext` set before injection, `status` ends `'error'`, and calling `load()` again recovers to `'ready'`.
  - `add` with `failNext(new Error('x'))` rejects, and `cookbooks()` is unchanged (Review Focus 1).
  - `remove('sams-cookbook')` leaves every recipe's `cookbooks` array untouched (spec §4).
  - Delete the test asserting the old cascade.

- [ ] **Step 6: Swap the provider** in `app.config.ts` to `provideHttpCookbooks()`.

- [ ] **Step 7: Run the full suite.** Expected: only the 4 known failures.

- [ ] **Step 8: Commit**

```bash
git add -A src/app/core src/app/app.config.ts
git commit -m "feat: read and write cookbooks through the API

Deleting a cookbook no longer strips its id from recipes; readers skip
ids that resolve to nothing (spec §4)."
```

---

### Task 3: Recipes move to the API

**Files:**
- Rewrite: `src/app/core/recipe-repository.ts`
- Modify: `src/app/core/testing/fake-repositories.ts` (recipe half)
- Modify: `src/app/core/stores/recipe.store.ts`
- Modify: `src/app/app.config.ts` (`provideLocalRecipes()` → `provideHttpRecipes()`)
- Modify: `src/app/pages/create-recipe/create-recipe.component.ts`. This change only lets it compile: `save()` becomes `async` and awaits `add`, and the bulk-import loop awaits each `add`. Task 4 adds the UX.
- Rewrite: `src/app/core/recipe-repository.spec.ts`
- Modify: `src/app/core/stores/stores.spec.ts` (`RecipeStore`, membership and `ListStore` describes)

**Interfaces:**
- Consumes: `environment.apiBase` (Task 1). `CookbookStore` no longer calls `stripCookbook` (Task 2).
- Produces:

```ts
export abstract class RecipeRepository {
  abstract list(): Promise<Recipe[]>;
  abstract create(recipe: Recipe): Promise<Recipe>;
  abstract update(recipe: Recipe): Promise<Recipe | null>;
  abstract remove(slug: string): Promise<boolean>;
  abstract readonly writable: boolean;
}
export class HttpRecipeRepository extends RecipeRepository {}
export const provideHttpRecipes: () => Provider;

export class FakeRecipeRepository extends RecipeRepository {
  constructor(seed?: Recipe[]);   // default: Recipes (bundled mock)
  writable: boolean;
  failNext(error: unknown): void;
}
export function provideFakeRecipes(fake?: FakeRecipeRepository): Provider[]; // same pattern as cookbooks

// RecipeStore — same shape as CookbookStore's lifecycle
readonly status: Signal<'loading' | 'ready' | 'error'>;
readonly writable: boolean;
load(): Promise<void>;
whenLoaded(): Promise<void>;
add(recipe: Recipe): Promise<string>;
remove(slug: string): Promise<boolean>;
update(recipe: Recipe): Promise<boolean>;
addToCookbook(slug: string, cookbookId: string): Promise<boolean>;
removeFromCookbook(slug: string, cookbookId: string): Promise<boolean>;
```

`list()` keeps the existing `isRecipe` filter and `withCookbooks` backfill.

- [ ] **Step 1: Rewrite `recipe-repository.spec.ts`** as in Task 2 Step 1, with slugs and `/api/recipes`. Also:
  - A flushed record without `ingredients` is dropped (Review Focus 3).
  - A record without `cookbooks` comes back filed in `DEFAULT_COOKBOOK_ID`.
  - A record with `cookbooks: []` stays `[]`.

- [ ] **Step 2: Run it and see it fail.**

- [ ] **Step 3: Implement** the contract, `HttpRecipeRepository` and `provideHttpRecipes`. Delete `LocalRecipeRepository` and `provideLocalRecipes`. Then write the recipe half of the fakes.

- [ ] **Step 4: Rewrite `RecipeStore`'s collection half.**
  - `_recipes` starts as `[]`.
  - Add `status`, `load()` and `whenLoaded()`.
  - `add` computes `uniqueSlug`, awaits `repo.create`, then prepends the returned recipe. A 409 propagates unchanged; don't retry with another suffix.
  - `update` and `remove` await the repository before touching the signal.
  - Delete `stripCookbook`, `resetToSeed` and `persist`.
  - Remove the `Recipes` import if nothing else uses it.
  - Search and filter code is untouched.

- [ ] **Step 5: Update `create-recipe.component.ts`** so it compiles (see Files). Navigation happens only after `add` resolves.

- [ ] **Step 6: Update `stores.spec.ts`.**
  - Every `provideLocalRecipes()` becomes `provideFakeRecipes()`, and every test that reads data first does `await store.whenLoaded()`.
  - Rewrite "filters by a gap" and "counts each gap" to seed the fake with three explicit fixture recipes, each missing one of method, steps or photo, and assert against those. They no longer depend on the bundled data.
  - Add these tests:
    - Status transitions, the same as Task 2.
    - `add` with `failNext(Object.assign(new Error('conflict'), { status: 409 }))` rejects with that error and leaves `recipes()` unchanged (Review Focus 1, 5).
    - `addToCookbook` failing leaves the recipe's `cookbooks` unchanged.
  - Delete the `resetToSeed` and `stripCookbook` tests.
  - Move the "RecipeStore persistence" tests from the old repository spec into `stores.spec.ts`. They become fake-backed and drop the "fresh injection" half.

- [ ] **Step 7: Swap the provider** to `provideHttpRecipes()`.

- [ ] **Step 8: Run the full suite.** Expected: 2 known failures only (`recipes.mock.spec`, `recipe-health.spec`).

- [ ] **Step 9: Commit**

```bash
git add -A src/app
git commit -m "feat: read and write recipes through the API

The store starts empty and applies a write only once the API has
accepted it. stripCookbook and resetToSeed are gone."
```

---

### Task 4: Read-only outside development, and an honest create flow

**Files:**
- Create: `src/app/core/write-error.ts`, `src/app/core/write-error.spec.ts`
- Modify: `src/app/app.routes.ts` (`canMatch` on `recipes/new`)
- Modify: `src/app/app.component.html`, `app.component.ts`
- Modify: `src/app/pages/create-recipe/create-recipe.component.ts`, `.html`
- Test: `src/app/pages/create-recipe/create-recipe.component.spec.ts` (create)

**Interfaces:**
- Consumes: `RecipeStore.writable`, `RecipeStore.add` (Task 3).
- Produces: `describeWriteError(err: unknown): string`. Task 5 reuses it for load errors.

- [ ] **Step 1: Test `describeWriteError`.** Exact copy:
  - `status: 0` → `"Couldn't reach the recipe server. Is it running?"`
  - 403 → `"The recipe server refused the write. Is RECIPES_WRITE_KEY set where you ran ng serve?"`
  - 409 → `"A recipe with that name already exists. Change the title and try again."`
  - 400 with `error.message: 'steps must be an array.'` → `"The recipe server rejected it: steps must be an array."`
  - Anything else → `"Saving failed. Nothing was changed."`

  Accept both `HttpErrorResponse` and plain objects with `status`.

- [ ] **Step 2: Implement it; run the spec green.**

- [ ] **Step 3: Gate creation.**
  - In `app.routes.ts`, give `recipes/new` the guard `canMatch: [() => inject(RecipeStore).writable || inject(Router).createUrlTree(['/'])]`.
  - In `app.component.html`, wrap both "Add recipe" links (menu item at line 27, button at line 42) in `@if (writable)`, with `writable` taken from `RecipeStore`.

- [ ] **Step 4: Create-flow component test** (`TestBed` with `provideFakeRecipes(new FakeRecipeRepository([]))`, `provideRouter([])`):
  - A save while `add` is pending disables the save button and shows "Saving…".
  - When the fake's `failNext` is a 409, the page stays on the route (no `navigate` call; spy on `Router.navigate`), the draft is intact, and the notice shows the 409 sentence.
  - When the save succeeds, `navigate` is called with `['/recipes', slug]`.

- [ ] **Step 5: Implement.**
  - Add a `saving` signal.
  - `save()` sets `saving` and awaits `add`. On success it navigates. On failure it sets `notice` to `describeWriteError(err)`, and `saving` resets in `finally`.
  - The button is `[disabled]="!canSave() || saving()"`, and its label reads `Saving…` while saving.
  - Bulk import counts failures and, when there are any, ends with `notice` = `"Saved N of M. The rest failed: <describeWriteError(first)>"`.

- [ ] **Step 6: Run the full suite.** Expected: the 2 known failures only.

- [ ] **Step 7: Commit** — `feat: hide authoring outside development and keep failed saves on screen`.

---

### Task 5: Loading and error states

**Files:**
- Modify: `src/app/app.routes.ts` (`recipeTitle` awaits `whenLoaded()`)
- Modify: `src/app/pages/library/library.component.ts`, `.html`, `.scss`
- Modify: `src/app/pages/recipe-detail/recipe-detail.component.ts`, `.html`
- Modify: `src/app/pages/cook-mode/cook-mode.component.ts`, `.html`
- Test: `src/app/pages/page-states.spec.ts` (create)

**Interfaces:**
- Consumes: `RecipeStore.status`, `load()`, `whenLoaded()` (Task 3).

- [ ] **Step 1: Write the render tests** in `page-states.spec.ts`. Each one uses a `FakeRecipeRepository` whose `list()` is held open by a deferred promise the test resolves, then calls `fixture.detectChanges()` and asserts on `fixture.nativeElement` text and selectors:
  - Library while loading renders `[data-state="loading"]` with 6 skeleton cards and no "No recipes match" text.
  - Library after a rejected load renders `[data-state="error"]` with a `Try again` button. Clicking it calls `load()`, and resolving it shows the cards.
  - Recipe detail with `fixture.componentRef.setInput('slug', 'grandmas-spaghetti')` while loading shows `[data-state="loading"]` and not the not-found copy. After resolving it shows the recipe title (Review Focus 2).
  - Recipe detail with an unknown slug after resolving shows the existing not-found branch.
  - Cook mode: the same two cases as recipe detail.
  - `recipeTitle` resolver: called during loading, it resolves to the recipe's title once the load completes, not to `"Sam's Recipes"`.

- [ ] **Step 2: Run and see them fail.**

- [ ] **Step 3: Implement.**
  - Library: `@switch (status())` with `loading` → skeleton grid (6 `.card.skeleton`, `aria-busy="true"`, CSS shimmer using existing tokens); `error` → message plus `Try again`; `ready` → current content.
  - Detail and cook mode: replace `@if (recipe(); as r) { … } @else { not-found }` with `@if (recipe(); as r) { … } @else if (status() === 'loading') { <p data-state="loading" aria-busy="true">Loading…</p> } @else { not-found }`.
  - Resolver: make the inner function `async` and `await inject(RecipeStore).whenLoaded()` before looking up the slug. Capture the injected store before the `await`, because `inject` is only valid synchronously.

- [ ] **Step 4: Run the full suite.** Expected: the 2 known failures only.

- [ ] **Step 5: Commit** — `feat: show loading and error states while the collection is fetched`.

---

### Task 6: End-to-end check against the real API

No new code unless the check finds a defect. If it does, fix it in a separate commit with a test.

- [ ] **Step 1: Start the API from `feat/cookbooks-api` on 3153**, killing only its own PID afterwards:

  ```bash
  cd ../api.samuelhinkhouse.com && PORT=3153 node index.js > "$TMPDIR/api3153.log" 2>&1 &
  ```

  Never print `.env`.

- [ ] **Step 2: Start the frontend on 4300**, proxying to it. Load `RECIPES_WRITE_KEY` from the API's `.env` into the environment without echoing it:

  ```bash
  set -a; . ../api.samuelhinkhouse.com/.env; set +a
  API_TARGET=http://localhost:3153 npx ng serve --port 4300 &
  ```

- [ ] **Step 3: Reads through the proxy.**
  - `curl -s localhost:4300/api/recipes` → 72 records.
  - `curl -s localhost:4300/api/cookbooks` → `[{"id":"sams-cookbook","name":"Sam's Cookbook"}]`.

- [ ] **Step 4: Writes through the proxy.** The browser's origin, 4300, is not in the API's `LOCALHOST_ORIGINS`, so simulate the 4200 browser with an explicit header. Create, then delete, a throwaway cookbook:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4300/api/cookbooks -H 'Origin: http://localhost:4200' -H 'Content-Type: application/json' -d '{"id":"zz-proxy-check","name":"Proxy check"}'
  curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:4300/api/cookbooks/zz-proxy-check -H 'Origin: http://localhost:4200'
  ```

  Expected: `201` then `204`. The same POST without the key in the environment must give `403`.

- [ ] **Step 5: Render check with Playwright** at `http://localhost:4300`. Screenshot each of these to the scratchpad:
  - The library, showing 72 cards.
  - A cold deep link to `/recipes/grandmas-spaghetti`, showing the title, not "not found".
  - `/recipes/new`, showing the form.

  The production read-only behaviour is covered by Task 4's tests, not here. A production build has no proxy and would hit the undeployed API.

- [ ] **Step 6: Stop only the PIDs started here.** Record the results in the task report.

---

## Done when

- The full suite passes except `recipes.mock.spec` and `recipe-health.spec` (pre-existing data drift).
- At `localhost:4200`, with Sam's API restarted on `feat/cookbooks-api` and `RECIPES_WRITE_KEY` exported in the `ng serve` shell, the library shows the 72 Mongo recipes, and adding a recipe persists it to Mongo.
- No file under `src/` mentions the key.

## What this plan does not do

- No deploy. The production build reads `https://api.samuelhinkhouse.com`, which serves neither `/recipes` nor `/cookbooks` until both API branches are merged and deployed. **Do not run `npm run deploy` before that**, or the live site will show the error state.
- No edit or delete UI. No screen offers them today. The store methods exist and are tested.
- No migration of browser-local cookbooks (spec §5).
