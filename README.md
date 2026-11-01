# VoidSpark

A production planner for **Oddsparks**, built on the data and model of the PirateSpark calculator.

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
```

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
- Each material's recipe gives a "per unit of output" cost in inputs and fuel. Total
  production `G` for target demand `d` solves `(I − A)·G = d`, so loops need no special
  handling. If a loop consumes at least as much as it produces, you get an error instead of
  a plan.
- The tree splits each material's production between the branches that consume it. A loop is
  credited to the highest node in the tree that it returns to. Tests check that the branch
  totals add up to the global totals.

## Layout

| Path | What |
| --- | --- |
| `src/routes/+page.svelte` | The app page: targets, settings, tabs |
| `src/lib/state.svelte.ts` | Reactive app state (`$state`), persisted to localStorage |
| `src/lib/engine/data.ts` | Typed access to game data, plus facts the JSON lacks (spark-powered stations) |
| `src/lib/engine/solver.ts` | Rates, machine counts, loops, trees, station and cost summaries. Framework-free |
| `src/lib/components/` | Tree, machines, inputs views, and recipe/spark/material pickers |
| `src/lib/data/oddsparks_0_2.json` | Game data recovered from PirateSpark (game version 0.2.3) |
| `src/lib/assets/img/` | Material and workstation icons recovered from PirateSpark |
| `legacy/piratespark/` | Recovered original calculator source, for reference |

## Known gaps

- The data covers the original 56 recipes, checked against the wiki on 2026-11-01. About 100
  1.0 recipes (copper, geodes, greenhouses…) aren't included yet. See
  [docs/wiki-recipe-audit.md](docs/wiki-recipe-audit.md).
- Recipes are treated as single-output. Byproducts and randomised outputs aren't credited.
- Temperature (heaters/coolers) isn't modelled.
