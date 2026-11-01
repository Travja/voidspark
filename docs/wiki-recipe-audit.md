# Recipe audit against the Oddsparks Wiki (2026-11-01)

Source: [oddsparks.wiki.gg](https://oddsparks.wiki.gg). I read the wikitext of all 132 pages
that use `Template:Recipe` through the MediaWiki API, and compared the 174 distinct recipes
against `src/lib/data/oddsparks_0_2.json`. Wiki content is CC BY-SA.

## Result for our 56 recipes

All 56 recipes are on the wiki. Ingredients, amounts, and outputs match, except for the two data
errors below. The wiki's `duration` equals our `buildTime` for every recipe.

### Fixed

| What | Was (PirateSpark) | Now (wiki) |
| --- | --- | --- |
| Craft time | `120 × speed / buildTime` crafts/min: an implicit crew of two identical sparks | `60 × crewSpeed / buildTime`. `buildTime` is seconds with one Stumpy: the [template docs](https://oddsparks.wiki.gg/wiki/Template:Recipe) say "duration uses the single stumpy rate in seconds (60/rate)", and all 16 explicit `per minute` values on the wiki equal `60 / duration`. With the default crew of two sparks this gives the same rates as PirateSpark. |
| Spark speed | One spark type, always doubled | Crews of 1 or 2 sparks, so mixed crews (Stumpy + Crafty) work. Speeds add up: Stumpy 1, Crafty 1.5, Handy 2.5 (from the template's calculator buttons). The Furnace infobox lists "2 x 1 Spark" slots. Machines normally run with two sparks, so the default crew is 2 Crafty, which is PirateSpark's default. |
| Handy Spark | Missing | Added, at 2.5× speed |
| Miasma Collector | Not spark-powered | Spark-powered, capped at 7.5 crafts/min by miasma supply ([Miasma Collector](https://oddsparks.wiki.gg/wiki/Miasma_Collector): 15 miasma/min, "production is capped to 8 seconds") |
| Green Paint | Black Paint + Yellow Paint | Blue Paint + Yellow Paint |
| Quartz from Limestone | Drill | Furnace (still fuelled) |

### Confirmed unchanged

- Fuel burn rates: all 12 match the item infobox `burnrate` values.
- The second "Raw Distillation" entry (4 shards) belongs to the Aetheric Distiller **Shrine**, a
  different building. The regular distiller makes 6.

## 1.0 content

Imported on 2026-11-01 by `scripts/import-wiki.mjs`: 110 recipes, 102 items, 21 workstations.
See [wiki-import-report.md](wiki-import-report.md) for how each conflicting or excluded wiki
entry was handled. The solver credits multi-output and randomised recipes. Temperature isn't
modelled, and growth `cycles` are approximate.
