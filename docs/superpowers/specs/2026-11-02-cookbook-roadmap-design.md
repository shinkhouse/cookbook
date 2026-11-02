# Cookbook Roadmap: Design

**Date:** 2026-11-02
**Repos:** `cookbook` (Angular 21 frontend) and `api.samuelhinkhouse.com` (Express 4 API), both on `feat/cookbook-roadmap`.
**Plan:** `docs/superpowers/plans/2026-11-02-cookbook-roadmap.md`

## Intent

Sam cooks from his phone or tablet, on the live site, and authors on his laptop against localhost. This roadmap makes the app better at both. It adds kitchen features to the read path: unit switching, step chips, a wake lock, print, random pick and "what can I make". It adds authoring and shopping conveniences on localhost: merged list rows, manual list items, a cookbook facet, photo import and a bookmarklet. Last, it adds a narrow, passcode-gated write path from the live site: notes, mark as cooked, and favorites.

## Goals

- Every item in the approved list ships except item 4 (Share).
- The frontend suite ends with 0 failures (460 pass and 2 fail today). The API suite stays green (318 pass today).
- The live site stays read-only for everything except the three device writes: notes, mark cooked and favorite.

## Non-goals

- Sharing the shopping list (item 4).
- Cookbook management UI: create, rename and delete.
- Per-person data. The site has one user, so favorites, counts and notes are shared site-wide.
- An undo for "mark as cooked" on the server. A confirm stands in for it.
- Converting units inside step text, or on the shopping list.
- Showing the shopping list on the live site. Its controls stay local-only, as they are today.

## Constraints

- Never read, print, source or commit `.env`. To check that a key exists, use `grep -c '^KEY=' path` only.
- Ports 3152, 4200, 4300 and 4310 belong to other processes. Checks use 3153 and 4320.
- Don't change git identity. Don't write to the real database during checks. Don't push.
- Frontend style: 2-space indent in TS and HTML, single quotes, and 4-space SCSS where the file uses it. Use the `--text-*` and colour tokens; no hard-coded colours. Match the codebase's doc-comment voice.
- API style: CommonJS and 4-space indent. Error bodies are fixed strings that never echo driver, fetch or SDK messages.
- `ANTHROPIC_API_KEY` and `RECIPES_DEVICE_KEY` are absent from the API's `.env` today. Sam adds them himself: the first locally, the second locally and on Heroku.

## Decisions

### Owner calls (Sam)

- Do everything except item 4 (Share).
- Times cooked, last cooked and favorites come last, in Phase B, because they need writes from the phone.

### Controller calls (from `decisions.md`, binding)

- Build order is Phase A (1, 2, 3, 7, 8, 9, 11, 12, 13, 14, 15, 16), then Phase B (device unlock, 6, 5, 10, favorites sync).
- Unlock uses a `RECIPES_DEVICE_KEY` passcode, sent as `x-device-key` only to the narrow device endpoints. The key is compared in constant time, and failed attempts are rate-limited.
- Photo import uses `claude-sonnet-5-5` through the Anthropic SDK. It sits behind `RECIPE_IMPORT_ENABLED` and `requireLocalWrite`, and accepts jpeg, png, heic and webp up to 10 MB.
- The rest of the item-level rules are in `decisions.md` and restated per item below.

### Planner calls (made while writing this; not in `decisions.md`)

- **Merged list rows** keep the existing per-source bought keys (`slug:i`, `parent>component:i`). A merged row counts as bought when every source key is bought, and checking it sets or clears all of them. The row's own key is `name:<ingredientKey>`.
- **Unit pref** defaults to `'us'`. Only units from the other system convert, so US recipes render as written.
- **Cook mode** shows amounts as written. It has no servings scaler, so "scaled" in item 9 means unit-converted only.
- **Step chips** match against the step's owner's ingredients: the component's for a component step, the parent's for a parent step.
- **Manual list items** go in a trailing "Other" group. They never merge with recipe rows. A repeat name, compared case-insensitively, is ignored.
- **"What can I make"** is a mode of the search box. Facets and the favorites filter still apply in it. Component recipes are excluded, and a parent's coverage includes its components' ingredients.
- **"Haven't cooked in a while"** orders recipes as follows:
  - First, recipes that have been cooked but have no date.
  - Then, recipes by `lastCooked`, oldest first.
  - Last, recipes that have never been cooked.
- **`lastCooked`** is stamped by the server as a full ISO timestamp. The client never sends it.
- **Mark as cooked** uses a confirm in both places, because the server has no undo.
- **The rate limit** is site-wide: 10 failed passcodes in 15 minutes locks the device endpoints with a 429 until the window ends. It is site-wide rather than per-IP because Heroku's router hides client IPs unless `trust proxy` is set, and changing that global setting is out of scope. The trade-off is that someone could lock Sam out for 15 minutes; with one user, that is acceptable.
- **Device endpoints also accept the local write gate** (a localhost Origin plus `x-api-key`), so the dev proxy works with no unlock. The unlock entry is hidden in writable builds.
- **A 403 on a device write** clears the stored passcode, so the device locks again.
- **Favorites migration** runs once per device, setting `cookbook.favsMigrated` when it finishes:
  - Its source is the device's explicitly stored `cookbook.favs`.
  - The `FAV_SEED` fallback is pushed only when the server has no favorites at all. This stops a fresh phone from re-adding favorites Sam removed elsewhere.
- **HEIC** is converted to JPEG on the server with sharp, because Claude does not accept HEIC. If sharp's build cannot decode it, the answer is 415 with a sentence saying so. Every photo is re-encoded as JPEG with a 1568 px long edge before it is sent, which keeps it under the API's per-image size limit.
- **Photo upload** is multipart: field `photo`, read with multer's memory storage. A base64 JSON body would hit the 100 kb body-parser limit.
- **The bookmarklet** clears `?url=` with `replaceUrl` after the import starts, so a reload does not import again.

## Behaviour by item

### 1. Merged shopping list
- Rows merge on `ingredientKey(name)`, which is computed in these steps:
  - Take the text before the first comma.
  - Drop parentheticals and lowercase it.
  - Drop the leading descriptors small, medium, large, fresh, chopped, diced, minced and sliced.
  - Make the last word singular.
- Amounts are summed per bucket: volume, weight, count (no unit), and each other unit string taken exactly.
  - When every entry in a bucket has the same unit, the sum stays in that unit.
  - When units differ, the bucket converts through `units.ts` into the system of the first US entry, or metric if there is none.
  - Buckets render in first-seen order, joined with " + ". For example: "2 + 1 cup".
  - "To taste" (`qty: null`) entries add nothing. If every entry is to taste, the amount is blank.
- A merged row shows its distinct source recipe titles when more than one recipe is on the list.
- Removing a recipe drops its keys by prefix, as today. A row whose remaining sources are all still bought stays checked. Adding a recipe whose item merges into a checked row unchecks that row, because the new source is not bought.
- Edge case: an ingredient with an empty key keeps its own per-source row.

### 2. Cookbook facet
- A "Cookbook" facet appears first in the facet bar when `CookbookStore` holds two or more cookbooks; otherwise it is hidden. Option labels are cookbook names.
- Selections are OR within the facet and AND with the other facets. A recipe filed in no cookbook matches no option.
- Cookbook ids are compared as-is, not lowercased.

### 3. Manual list items
- An "Add an item" field on the list page adds an item on Enter or with the button. Blank input is ignored. Names are trimmed and capped at 200 characters.
- Items persist in `cookbook.extras`. Each can be checked and removed.
- Items count toward the progress figures. "Uncheck all" unchecks them too.
- A list holding only manual items is not empty.

### 7. US and metric units
- A "US | Metric" toggle sits by the servings stepper on the detail page and in the cook-mode ingredients panel. The choice persists in `cookbook.units`.
- Only these units convert: tsp, tbsp, cup, pint, quart, gallon, ml, l, oz, lb, g and kg. Count items, "pinch", "can", and qualified units such as "small can" stay as written.
- US results are rounded to kitchen fractions: eighths and thirds. Metric results are rounded to steps:
  - ml: 0.5 under 10, 5 under 100, and 10 from 100 up.
  - g: 0.5 under 10, 1 under 100, and 5 from 100 up.
  - l and kg: 0.05.
- The unit chosen is the one that reads naturally, using these thresholds:
  - US volume: cup from ¼ cup, tbsp from 1 tbsp, otherwise tsp.
  - US weight: lb from 1 lb, otherwise oz.
  - Metric: l or kg from 1000.

### 8. Wake lock
- Cook mode holds a screen wake lock. It is acquired again when the page becomes visible, and released when cook mode is left.
- Where the API is unsupported or the request fails, nothing happens.

### 9. Ingredients in cook-mode steps
- Under the step text, a "Uses:" chip list names each ingredient the step mentions, with its amount converted to the unit pref. Each chip reads like "1 onion" or "2 tbsp olive oil".
- Matching is conservative:
  - The step must contain the descriptor-stripped head of the name, or its singular or plural, as a whole word.
  - Heads under 3 characters, heads over 4 words, and "water" never match.
- Each ingredient appears once, in list order. A step that matches nothing shows no chip list.

### 11. Surprise me
- A "Surprise me" button in the library picks a random recipe from the current results, excluding components, and opens it.
- It is disabled when there are no candidates.

### 12. What can I make
- A "What can I make?" toggle switches the search box to ingredient mode. The placeholder reads "List what you have: chicken, rice, broccoli".
- The input is split on commas, semicolons, new lines and " and ". Each term is normalised with `ingredientKey`.
- Coverage is measured over the recipe's non-staple ingredients. The staples are salt, pepper and their variants, water, oils, cooking spray, sugar, flour, baking soda and baking powder.
  - An ingredient is covered when its key contains a term as a whole word, or a term contains its key.
- Recipes with no coverage are dropped. The rest are ranked by covered share, then covered count, then fewest ingredients, then title.
- Each card shows "Uses 3 of 5". The sort control has no effect in this mode.

### 13. Import from a photo (local)
- `POST /import/photo` is a multipart request with a `photo` field. It is gated by `requireLocalWrite`, which runs before the upload is read, and mounted only with `RECIPE_IMPORT_ENABLED=true`.
- The answers are:
  - 200 with the `/import/preview` shape. `sourceUrl` is `''` and there is no `image`.
  - 400: no file.
  - 413: over 10 MB.
  - 415: wrong type, or a HEIC that can't be decoded.
  - 422: no recipe in the photo, or the model declined.
  - 502: a truncated answer, or another API error.
  - 503: no key configured, a rejected key, or a rate limit.
  - 504: timeout or connection failure.
- The prompt asks for a faithful transcription, spelling included. Handwritten cards are the main case.
- On the frontend, a "From a photo" tab offers a file picker with the same type and size limits checked first. Its result fills the editable form exactly as the URL import does.

### 14. Bookmarklet
- `recipes/new?url=<http(s) url>` switches to the URL tab and imports once. A non-http value is ignored.
- The URL tab shows a draggable "Add to Sam's Recipes" link with this href: `javascript:location.href='http://localhost:4200/cookbook/recipes/new?url='+encodeURIComponent(location.href)`. The href is bypass-sanitised, because Angular otherwise prefixes it `unsafe:`. Clicking the link in-app does nothing.

### 15. The two failing specs
- All 72 recipes now carry steps. The three that once had none have since been written up.
- Both specs are rewritten to state that truth: every imported recipe has steps, and the collection has no method gaps.
- `needsMethod` stays covered by the existing synthetic test in `gapsOf`.

### 16. Print
- A Print button on the detail page calls `window.print()`.
- In the print stylesheet:
  - The site header, the hero photo, the actions, the back link, the stepper buttons, the gap note and the checkbox chrome are hidden.
  - Ingredients and steps sit side by side when the page is at least 15 cm wide.
  - List items avoid page breaks inside them.

### Phase B: device writes from the live site

- **Unlock:**
  - A footer link, "Unlock this device", appears only in read-only builds. It asks for the passcode and verifies it with `POST /device/verify`.
  - On success the passcode is stored in `cookbook.deviceKey`. The footer then reads "This device can save" and offers "Lock".
  - The error messages are: wrong passcode "That passcode didn't work."; 429 "Too many tries. Wait 15 minutes and try again."; anything else "Couldn't reach the recipe server."
- **Gate (`requireDevice`):**
  - The local write gate passes the request straight through.
  - Otherwise, the Origin must be in `ALLOWED_ORIGINS`, and `RECIPES_DEVICE_KEY` must be set, or the request fails closed with 403.
  - A lockout answers 429 with `Retry-After`.
  - A missing header is a 403 that is not counted. A wrong key is a 403 that is counted.
- **CORS:** the production origin `https://shinkhouse.github.io` is already allowed, and `cors()` reflects `x-device-key` in preflights. No CORS change is needed; a test pins this.
- **Without unlock:** the add-note form, the Mark as cooked controls and the favorite toggles are hidden. A favorite shows as a static star.
- **6. Notes:**
  - `POST /recipes/:slug/notes {note}` appends a note with `$push`. The note is trimmed and must be 1 to 2000 characters, or the answer is 400.
  - Archived or unknown recipes answer 404.
  - The detail page shows an add-note field under Notes. The Notes section renders when there are notes or when this device can save.
- **5. Mark as cooked:**
  - `POST /recipes/:slug/cooked` runs `$inc cooked` and `$set lastCooked` (now, as ISO), and returns the recipe.
  - In cook mode, Finished on a device that can save first asks "Mark as cooked?" with two answers, "Mark as cooked" and "Not this time". Both leave for the recipe. A failure stays on the confirm, shows the reason and offers "Leave anyway".
  - On the detail page, a "Mark as cooked" button asks for the same confirm inline.
  - The detail rail shows "Last cooked" with a medium date when the recipe has one.
- **10. Sort:** a library sort control offers "Library order" and "Not cooked lately", in the order given under Planner calls.
- **Favorites:**
  - `PUT /recipes/:slug/favorite {favorite: boolean}` sets the flag.
  - `favorite` lives on the recipe, and `RecipeStore` owns `isFav` and `toggleFav`. `PrefsStore` keeps only the legacy list, for the migration.
  - Migration follows the rules under Planner calls. The flag is set only when every push succeeds.
- **Validation:** `lastCooked` (an ISO string) and `favorite` (a boolean) join `RECIPE_FIELDS`. Without them, a local edit's PUT would erase both.
