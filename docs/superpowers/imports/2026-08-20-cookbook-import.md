# Family cookbook import — review notes

**Date:** 2026-08-20  
**Source:** `Hinkhouse_Stokes Family Cookbook.docx` (Google Docs export, revised 09/21/2025)  
**Scripts:** `2026-08-20-docx-extract.py`, then `2026-08-20-cookbook-import.js`

## Why the .docx and not the .md

Three exports were available. The `.md` is unusable as a source: markdown tables
cannot contain newlines, so the export collapsed every ingredient of a recipe
into one unbroken string — `MAKES 2 CUPS 3 medium Roma tomatoes (12 oz/342 g),
cored and left whole ¼ medium white onion...`. Splitting that is guesswork.

In the `.docx` each ingredient is still its own `<w:p>` inside the table cell, so
the line structure survives. Every recipe is one table:

```
row 0      title
row 1      subtitle or attribution   (optional)
row 2      "Image"                   (placeholder, skipped)
last row   ingredients | steps       (two cells)
```

## What landed

- **58 recipes imported**, 744 ingredients.
- **6 skipped as duplicates** of the hand-curated set: Marry Me Chicken, Grandma’s Spaghetti, Chicken Taco Baked Sweet Potatoes, Grandma's Chili, Spicy Shrimp Pasta in Tomato Cream Sauce, Baked Chicken Parmesan.
  The curated versions have photos, blurbs and times-cooked counts, so they win.
- **2 skipped** as empty "Recipe Template" stubs.

## Judgement calls, all reversible

- **Servings defaulted to 4 on 54 of 58.** The source states servings for only a
  handful. Nothing else in the app depends on it being right, but the scaler does.
- **2 yields moved to notes** rather than read as servings: `MAKES 2 CUPS` is a
  volume, not a head count.
- **3 run-together lines split** where the source document had lost its own
  paragraph breaks.
- **3 wrapped lines rejoined** — a parenthetical weight that had wrapped onto
  its own paragraph, e.g. `(12 oz/342 g), cored and left whole`.
- **Titles re-cased.** The source mixes full capitals with sentence case. CSS
  cannot fix this — `text-transform: capitalize` never lowercases — so it is done
  in the data, with small words kept small (`Coq au Vin`, `Pico de Gallo`).
- **Tags inferred conservatively** from the title and the parsed ingredients:
  cuisine only when the title names it, protein from ingredient names with broth
  and stock excluded so a beef dish is not tagged chicken. 6 recipes are
  untagged; the collection wants a proper tagging pass.

## Left empty rather than invented

`time`, `blurb`, `desc`, `photo` and `cooked`. The source carries none of them.
The detail page omits the duration rail and the library card omits the time when
they are empty, so nothing renders as a blank.

## Known residue

Five ingredient names still open with a measure, e.g. `3oz. packages ramen
noodles`. These are correct: the quantity is a *count* and the measure is the
package size. They are pinned in `recipes.mock.spec.ts` so a real regression
still fails the build.

The source is OCR'd from magazine scans, so step prose contains typos —
`SERVINOS`, `boltom`, `lurn`, `DO ANEADI`. These are reproduced faithfully rather
than guessed at.

## Ingredient sub-groups

12 recipes have ingredient lists that are really several lists. `Ingredient`
gained an optional `group` field for these; the detail page renders it as a
subheading. Groups found:

- Pan-Seared Lake Trout — CREAMY CELERIAC AND CARROT PUREE
- Pan-Seared Lake Trout — GRILLED CORN AND BELL PEPPER SUCCOTASH
- Pan-Seared Lake Trout — PAN-SEARED LAKE TROUT
- Chicken Andouille Gumbo w Rice — BRAISED CHICKEN
- Chicken Andouille Gumbo w Rice — RICE
- Traditional Dan Dan Noodles — Topping
- Mr. Xie's Dandan Noodles — Beef topping
- Gong Bao (Kung Pao) Chicken with Peanuts — Marinade
- Gong Bao (Kung Pao) Chicken with Peanuts — Sauce
- Pad Thai — Pad Thai sauce
- Cowboy Caviar — DRESSING
- Verde Chicken Enchiladas — Chicken
- Verde Chicken Enchiladas — Enchiladas
- Verde Chicken Enchiladas — Salsa
- Korean Barbecue-Style Meatballs — Glaze
- Cuban Mojo Pork Tenderloin — Marinade
- Cuban Mojo Pork Tenderloin — Pork
- Szechuan Beef & Green Beans with Ribeye Steak — Beef Marinade
- Szechuan Beef & Green Beans with Ribeye Steak — Stir-Fry
- Szechuan Beef & Green Beans with Ribeye Steak — Szechuan Sauce
- Spicy Pork Bulgogi — Marinade
