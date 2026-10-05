/**
 * THROWAWAY. One-time export of the bundled recipe collection to JSON, for
 * seeding api.samuelhinkhouse.com's cookbook.recipes collection.
 *
 * Not part of the app and not referenced by any build. Delete it once the
 * collection lives in Mongo.
 *
 * Uses the esbuild already in node_modules (a transitive dependency of
 * @angular/build) to turn the TypeScript seed data into something Node can
 * require. The seed chain — recipes.mock -> imported-recipes, recipes.model,
 * cookbooks.model, aisle — imports nothing from Angular, so the bundle is clean.
 *
 * Run from the cookbook repo root:
 *     node scripts/export-recipes-seed.cjs
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const esbuild = require('esbuild');

const OUT = path.join(os.tmpdir(), 'cookbook-recipes-seed-bundle.cjs');

esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', 'src', 'app', 'core', 'mock', 'recipes.mock.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: OUT,
});

const { Recipes } = require(OUT);

if (!Array.isArray(Recipes) || Recipes.length === 0) {
    throw new Error('Expected a non-empty Recipes array.');
}

const target = process.argv[2];
if (!target) {
    throw new Error('Usage: node scripts/export-recipes-seed.cjs <output.json>');
}

fs.writeFileSync(target, JSON.stringify(Recipes, null, 2) + '\n');
console.log(`Wrote ${Recipes.length} recipes to ${target}`);
