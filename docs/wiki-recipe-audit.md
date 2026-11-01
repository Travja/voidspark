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
| Craft time | `buildTime / 2` seconds per spark | `buildTime` seconds with one Stumpy. The [template docs](https://oddsparks.wiki.gg/wiki/Template:Recipe) say "duration uses the single stumpy rate in seconds (60/rate)". All 16 explicit `per minute` values on the wiki equal `60 / duration`. **Every PirateSpark rate was 2× too high.** |
| Spark speed | One spark per station | Crews of up to 2 sparks. Speeds add up: Stumpy 1, Crafty 1.5, Handy 2.5 (from the template's calculator buttons). The Furnace infobox lists "2 x 1 Spark" slots. |
| Handy Spark | Missing | Added, at 2.5× speed |
| Miasma Collector | Not spark-powered | Spark-powered, capped at 7.5 crafts/min by miasma supply ([Miasma Collector](https://oddsparks.wiki.gg/wiki/Miasma_Collector): 15 miasma/min, "production is capped to 8 seconds") |
| Green Paint | Black Paint + Yellow Paint | Blue Paint + Yellow Paint |
| Quartz from Limestone | Drill | Furnace (still fuelled) |

### Confirmed unchanged

- Fuel burn rates: all 12 match the item infobox `burnrate` values.
- The second "Raw Distillation" entry (4 shards) belongs to the Aetheric Distiller **Shrine**, a
  different building. The regular distiller makes 6.

## Not modelled yet (1.0 content)

- **100 recipes** use buildings or items we don't have.
  - 14 new buildings: Aetheric Collider, Aetheric Converter Feeder, Ancient Generator,
    Ancient Greenhouse, Ancient Printer, Arboretum, Geode Breaker, Greenhouse, Ore Miner,
    Plant Extractor, Spark Workshop, Tailor's Tent, Crafty Spark Shrine, and the Aetheric
    Distiller Shrine.
  - 44 new items: the copper chain, geodes, stellar/frozen materials, corrupted/grey aether,
    the Drilly, Scrubby, Freezing, and Burning sparks, and more.
- **3 new alternates** for existing items: Stumpy Spark at the Spark Workstation, Slashy Spark
  at the Spark Workbench, and Coral at the Stonecutter.
- **New mechanics** the solver doesn't model:
  - 24 recipes have multiple outputs, and 6 have randomised outputs.
  - 133 recipes list a `temperature`. Heaters and coolers speed up some stations, e.g.
    "Overclocked Wood Harvesting" at 1.33 s.
