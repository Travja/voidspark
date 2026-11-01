# VoidSpark

A production planner for **Oddsparks**. Recipes, items, and icons come from the
[Oddsparks Wiki](https://oddsparks.wiki.gg), including the 1.0 content: copper, geodes,
greenhouses, the Arboretum, and the metal sparks. It started from the PirateSpark calculator.

- **Target output rates.** Ask for items per second, minute, or hour. A target can also be a
  number of machines, as in PirateSpark.
- **Spark crews.** Machines normally run with two sparks, and their speeds add up (Stumpy 1×,
  Crafty 1.5×, Handy 2.5×). The default crew is 2 Crafty. You can change it, and override it
  for each workstation type.
- **Branching production tree.** Shows which machine makes each item, how many you need, and
  what feeds what. Fuel edges are dashed. Production loops (coal fuelling coal furnaces, aether
  shards feeding the miasma → raw aether → shard chain) appear as "loops back" leaves.
- **Recipe choices.** Pick between recipes, or mark any material as supplied externally,
  directly in the tree.
- **Byproducts.** Recipes with several outputs (Plant Extractor, Geode Breaker…) are credited
  for all of them. A material that byproducts already cover needs no machines of its own, and
  extra output shows up as surplus. Random outputs count at their expected value.
- **Machines view.** Totals per workstation, rounded up, with load %. Each line shows what it
  consumes and what it feeds.
- **Inputs & cost.** Raw inputs needed, and the material cost to build every machine.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # solver tests (vitest)
npm run check      # svelte-check type checking
npm run build      # static site into build/
npm run import:wiki  # refresh src/lib/data/oddsparks.json and icons from the wiki
```

The importer writes [docs/wiki-import-report.md](docs/wiki-import-report.md), listing every
judgement call: conflicting wiki entries, excluded buildings, and default recipes. It needs
network access to `oddsparks.wiki.gg`. Behind an HTTPS proxy, run it with
`NODE_USE_ENV_PROXY=1`.

Built with SvelteKit 2 and Svelte 5 (runes) using `@sveltejs/adapter-static`. The app is a
single client-rendered page (`ssr = false`, `prerender = true`) because the plan is kept in
localStorage. To publish to GitHub Pages at `/voidspark/`:

```bash
BASE_PATH=/voidspark npm run build   # then publish build/ (it includes .nojekyll)
```

## How the numbers work

`src/lib/engine/solver.ts`:

- crafts/min per machine = `60 × crewSpeed / buildTime`. `buildTime` is the wiki's `duration`:
  seconds per craft with one Stumpy. PirateSpark's `120 × speed / buildTime` is the same
  formula with two identical sparks per machine. See
  [docs/wiki-recipe-audit.md](docs/wiki-recipe-audit.md).
- Supply-limited stations are capped. The Miasma Collector runs at most 7.5 crafts/min.
- A fuelled machine burns the chosen fuel's per-minute amount from the game data.
- The unknowns are crafts/min per recipe. Each recipe is tied to the material it runs for,
  and that material's net production (every recipe's outputs, minus inputs and fuel) must
  meet its demand. That's a linear system, so loops (coal fuelling coal, Fertiliser
  Enrichment, the aether apple ↔ seed cycle) need no special handling. When byproducts cover
  a material, its own recipe is switched off. When one recipe is chosen for two of its
  outputs, the more demanding output drives it.
- The tree splits each material's production between the branches that consume it. A loop is
  credited to the highest node in the tree that it returns to. Tests check that the branch
  totals add up to the global totals. The 1.0 graph is dense, so the tree is built
  breadth-first with a size limit.

## Layout

| Path | What |
| --- | --- |
| `src/routes/+page.svelte` | The app page: targets, settings, tabs |
| `src/lib/state.svelte.ts` | Reactive app state (`$state`), persisted to localStorage |
| `src/lib/engine/data.ts` | Typed access to game data, plus facts the JSON lacks (spark-powered stations) |
| `src/lib/engine/solver.ts` | Rates, machine counts, loops, trees, station and cost summaries. Framework-free |
| `src/lib/components/` | Tree, machines, inputs views, and recipe/spark/material pickers |
| `src/lib/data/oddsparks.json` | Game data imported from the wiki (generated, don't hand-edit) |
| `scripts/import-wiki.mjs` | The wiki importer, including its overrides (excluded buildings, caps, defaults) |
| `src/lib/assets/img/` | Icons: PirateSpark's originals plus new ones from the wiki |
| `legacy/piratespark/` | Recovered original calculator source, for reference |

## Known gaps

- Temperature (heaters/coolers) isn't modelled. "Overclocked" recipes come in as alternates.
- Greenhouse and Arboretum recipes have growth `cycles` that the wiki doesn't explain, so they
  are treated as ordinary recipes and tagged "≈ growth".
- The Ancient Printer/Generator/Greenhouse, Tailor's Tent, Aetheric Converter Feeder, and the
  shrines are left out. They are fixed ruins, cosmetic, or one-off repairs.
- The wiki is missing region categories for most 1.0 items (they're grouped under
  Miscellaneous) and a build cost for the Spark Workshop.
