# API-Backed Repositories Design

Moves both collections — recipes and cookbooks — off `localStorage` and onto
`api.samuelhinkhouse.com`, which becomes their only source of truth.

Follows on from `api.samuelhinkhouse.com`'s
`docs/superpowers/specs/2026-10-05-recipes-api-design.md`, whose §8 named this
work and left three questions for it to answer. All three are answered below,
along with a fourth that §8 did not anticipate and which shapes more of the
design than any of them.

## 1. What this is for

The cookbook app holds 72 recipes, 58 of them imported from the family
cookbook. They currently live in each browser's `localStorage`, which means the
collection is not really one collection: it is a separate copy per device, and
the deployed site at `shinkhouse.github.io/cookbook` shows whatever was bundled
at build time rather than what has actually been written.

The recipes API already exists and already holds all 72 records. This spec is
what makes the app read them.

**Success looks like:** the deployed site renders the live collection from
Mongo, and editing a recipe at `localhost:4200` changes what the deployed site
shows on its next load, with no rebuild and no deploy.

## 2. The constraint that shapes everything: writes are localhost-only

`middleware/require-local-write.js` requires **both** a `localhost:*` `Origin`
and an `x-api-key` matching `RECIPES_WRITE_KEY`. `shinkhouse.github.io` is in
the CORS allowlist, so it can read, but it is deliberately not in
`LOCALHOST_ORIGINS`, so it cannot write. The middleware's own comment says
stopping the deployed site from writing "is its real job."

That is not an obstacle to work around. It is the security model, and this spec
adopts it rather than weakening it:

- **The deployed app is read-only.** Create, edit and delete are absent there,
  not merely disabled-looking.
- **Authoring happens at `localhost:4200`.**
- **The write key never enters a browser bundle.** See §6.

The alternative — allowing the gh-pages origin and shipping the key in the
bundle — was considered and rejected. A key in public JavaScript is not a key,
and the recipes collection would be world-writable in practice.

## 3. The three questions from the API spec's §8

**What the library shows during the first fetch.** A skeleton. No bundled seed,
no cached copy. `RecipeStore` currently paints the bundled `Recipes` array
synchronously so the library never flashes empty; that array stops being the
first paint and the app shows an explicit loading state until the API answers.
This costs a visible wait on a cold load, and buys never rendering a recipe
that is not actually in the collection.

**What happens to a write when the API is unreachable.** Nothing is applied.
The store awaits the API's confirmation before touching its signal, so the
screen can never show an edit that Mongo did not accept. The create form stays
open with an error rather than navigating away; this replaces today's
fire-and-forget `persist()`.

**Whether `localStorage` stays as an offline cache.** It does not. For recipes
and cookbooks there is exactly one source of truth and it is the API.
`localStorage` remains in use for preferences — favourites, the shopping list —
through the untouched `Storage` wrapper, `PrefsStore` and `ListStore`.

## 4. Scope: both collections move

`CookbookRepository` was built as a seam parallel to `RecipeRepository`
precisely so the two could move independently. They are nonetheless both moving
in this spec, because leaving cookbooks in `localStorage` would split the model
across two kinds of storage: a recipe's `cookbooks` ids would be durable and
shared while the names those ids resolve to would be per-browser. The deployed
site would show recipes filed into cookbooks it cannot name.

This means API work precedes frontend work. See §5.

### Deleting a cookbook leaves dangling ids

Membership lives on the recipe (`Recipe.cookbooks`), so deleting a cookbook
would — under the current `stripCookbook` — rewrite every recipe filed in it.
With per-recipe endpoints that is N requests that can half-succeed, leaving the
collection in a state nothing asked for.

Instead: **deleting a cookbook deletes one document and touches no recipes.**
Readers skip cookbook ids that match no cookbook, which the UI effectively does
already by deriving names from `CookbookStore`. `RecipeStore.stripCookbook` is
deleted.

Two consequences, both accepted:

- Stale ids accumulate on recipes. They are inert — an id nothing resolves is
  rendered as nothing.
- Re-creating a cookbook with a previously-used id silently re-adopts the
  recipes that were filed in the old one. Acceptable at this scale, where
  cookbook ids are chosen by hand and number in the single digits.

## 5. Part one: the cookbooks resource on the API

Four new files in `api.samuelhinkhouse.com`, each mirroring its recipes
counterpart in structure, naming and error handling:

| New file | Mirrors |
|---|---|
| `cookbooks.validation.js` | `recipes.validation.js` |
| `cookbooks.repository.js` | `recipes.repository.js` |
| `routes/cookbooks.js` | `routes/recipes.js` |
| `seed/cookbooks.seed.json` | `seed/recipes.seed.json` |
| `scripts/seed-cookbooks.js` | `scripts/seed-recipes.js` |

Endpoints are the same five shapes, with `requireLocalWrite` on `POST`, `PUT`
and `DELETE`, mounted in `index.js` after `cors()` exactly as `/recipes` is.
`validateCookbook` accepts `id` and `name` as non-empty strings and
`description` as an optional string, and acts as the field allowlist for the
seed script the same way `validateRecipe` does.

Two deliberate departures from the recipes resource:

- **No `order` field.** Recipes needed one because the library shows the
  fourteen curated recipes before the family import, and Mongo guarantees no
  ordering without an explicit sort. Cookbooks have no curated order worth
  preserving, so `list()` sorts by `name`. That is deterministic, needs no
  stored field, and cannot drift out of step with anything.
- **`DELETE /cookbooks/:id` does not touch the recipes collection**, per §4.

The cookbook id becomes Mongo's `_id`, as the recipe slug does, and is stripped
on the way out so the wire shape is exactly the `Cookbook` interface.

Cookbook writes are guarded by the existing `requireLocalWrite` middleware
unchanged, which means they are gated on `RECIPES_WRITE_KEY`. The name is now
narrower than the thing it protects, but one key guarding one API is the right
shape: a second variable would be two secrets to deploy and keep in step for no
gain. Renaming it is a separate, optional tidy-up.

### The seed is incomplete by nature

`seed/cookbooks.seed.json` can only contain `CookbookSeed` — the single
`sams-cookbook` entry compiled into the app. Cookbooks created in a running
browser live in that browser's `localStorage`, and no script run on the server
can see them. Any such cookbooks must be re-created through the UI at
`localhost:4200` after cutover. This is worth checking before the swap, because
once `CookbookRepository` points at the API the local copies become
unreachable.

### Branching

The new work branches from `feat/recipes-api`, **not** from `main`. It depends
on `allowed-origins.js`, `middleware/require-local-write.js` and the `handle()`
wrapper in `routes/recipes.js`, none of which have been merged. Suggested name:
`feat/cookbooks-api`.

### Open question, outside this spec's control

`feat/recipes-api` is unmerged and unpushed, and this spec assumes
`https://api.samuelhinkhouse.com` will serve `/recipes` and `/cookbooks` to the
deployed site. How that host is deployed, and whether it terminates TLS, has not
been verified. The frontend's production read path depends on it.

## 6. Part two: the seams become per-recipe

```ts
export abstract class RecipeRepository {
  abstract list(): Promise<Recipe[]>;
  abstract create(recipe: Recipe): Promise<Recipe>;
  abstract update(recipe: Recipe): Promise<Recipe | null>;
  abstract remove(slug: string): Promise<boolean>;
  abstract readonly writable: boolean;
}
```

`CookbookRepository` takes the identical shape over `Cookbook`, keyed on `id`.

**`durable` becomes `writable`.** "Will this write outlive the tab" stops being
an interesting question once there is no `localStorage` path; "may this client
write at all" starts being one, because the answer is genuinely no on the
deployed site.

**`null` and `false` mean "no such record"; failures throw.** Folding a lost
network call into the same `false` that means "unknown slug" would leave the
store unable to tell a legitimate no-op from a write that vanished. Callers
catch.

**`LocalRecipeRepository` and `LocalCookbookRepository` are deleted**, not kept
alongside the HTTP implementations. §3 chose a single source of truth; a second
persistent implementation would only be a way for the two to drift. In-memory
fakes replace them for tests.

### The write key never enters the browser

Rather than placing `RECIPES_WRITE_KEY` in `environment.ts` — which is
committed, and which is compiled into the bundle regardless — the Angular dev
server proxies it.

A `proxy.conf.js` (the JavaScript form, so it can execute) forwards `/api/*` to
`http://localhost:3152` and sets the `x-api-key` header from `process.env` in
`onProxyReq`, with `changeOrigin: false` so the forwarded `Origin` remains
`http://localhost:4200` — already in `LOCALHOST_ORIGINS`.

```
dev   browser → /api/recipes → dev-server proxy (adds key) → localhost:3152
prod  browser → https://api.samuelhinkhouse.com/recipes     (read-only)
```

Three things follow. The key exists only in the developer's shell environment
and never in any built artifact. CORS is not involved in development at all,
because the browser sees same-origin requests. And `environment.apiBase` is
simply `/api` in development and the full origin in production.

`writable` is `!environment.production`. A production build served from a laptop
is therefore read-only, which is correct: the proxy that supplies the key is not
running either.

`angular.json`'s `serve` target has no `proxyConfig` today and gains one.
`provideHttpClient()` is likewise absent from `app.config.ts` and gains an
entry.

## 7. Store and screen changes

`RecipeStore` starts empty and tracks its own load:

```ts
private readonly _recipes = signal<readonly Recipe[]>([]);
readonly status = signal<'loading' | 'ready' | 'error'>('loading');
```

`add`, `remove` and `update` become `async`, awaiting the repository before
updating the signal. `addToCookbook` and `removeFromCookbook` follow, since both
delegate to `update`. `uniqueSlug` stays client-side as the first line of
defence; a `409` from the API is surfaced as a real error rather than silently
retried.

Two methods are deleted outright:

- `stripCookbook`, per §4.
- `resetToSeed`, because no screen calls it — only a spec does — and "the seed"
  stops being a meaningful concept once the API is the source of truth.

`CookbookStore` takes the same treatment. Its `remove` no longer calls into
`RecipeStore`, which removes the only place one store *wrote* through another —
the direction that made a cookbook delete a multi-recipe operation. The two
read-only uses stay: `recipesIn` and `recipeCount` still derive from
`RecipeStore`, as the 2026-08-21 design intended.

Screens needing a loading state:

| Screen | What changes |
|---|---|
| library | Skeleton cards while `status === 'loading'`; an error state with a retry |
| recipe-detail | Must distinguish loading from unknown slug — today a deep link during load would render a false "not found" |
| cook-mode | Same deep-link problem, same fix |
| shopping-list | Derives through `ListStore`, so it inherits the empty-while-loading state |
| create-recipe | Pending state on save; stays open and shows the error when the write fails |

Every screen that offers create, edit or delete reads `writable` and omits those
controls when it is false.

## 8. Testing

`recipe-repository.spec.ts` and `stores.spec.ts` both assume synchronous store
writes against a `localStorage`-backed repository. Their write-path assertions
are rewritten against the in-memory fakes and `await`ed. This is the single
largest chunk of work in the spec and it is not avoidable — the contract they
test is precisely what changes.

New coverage:

- The HTTP repositories, against `HttpTestingController`: URL shapes, that
  `list()` maps the response, that a non-2xx rejects rather than resolving
  empty.
- The store's status transitions: `loading → ready`, and `loading → error` when
  the first fetch fails.
- That a rejected write leaves the signal untouched — the core guarantee of §3.

On the API side, the cookbooks resource gets the same five test files the
recipes resource has.

## 9. What this spec does not do

- **No authentication.** The deployed site stays read-only. Letting it write
  needs a real login on the API, which is its own design.
- **No offline support.** A failed read is an error state, not a cached render.
- **No migration of browser-local data.** Recipes already live in Mongo via the
  seed. Locally-created cookbooks do not, and are re-created by hand (§5).
- **No pagination.** `GET /recipes` is unpaginated by design and the app
  continues to filter client-side.
- **No separate Mongo project.** Recipes and cookbooks share the `cookbook`
  database alongside the existing `a2round` data. Splitting them into their own
  project is a known future task and explicitly out of scope here.
