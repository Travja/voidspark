# VoidSpark

A production planner for **Oddsparks**, built on the data and model of the PirateSpark calculator.

- **Target output rates.** Ask for items per second, minute, or hour. A target can also be a
  number of machines, as in PirateSpark.
- **Spark types.** Set a default spark (Stumpy 100% or Crafty 150%) and override it for each
  workstation type. The miasma collector isn't spark-driven, so spark speed doesn't affect it.
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
npm run build      # type-check + production build into dist/
```

`vite.config.ts` uses a relative `base`, so `dist/` can be published to the `gh-pages` branch
as-is.

## How the numbers work

`src/engine/solver.ts`:

- crafts/min per machine = `120 × sparkSpeed / buildTime`. This is PirateSpark's model:
  one spark at 100% does 2 work units per second.
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
| `src/engine/data.ts` | Typed access to game data, plus facts the JSON lacks (spark-powered stations) |
| `src/engine/solver.ts` | Rates, machine counts, loops, trees, station and cost summaries |
| `src/components/` | Tree, machines, inputs views, and recipe/spark/material pickers |
| `src/data/oddsparks_0_2.json` | Game data recovered from PirateSpark (game version 0.2.3) |
| `src/assets/img/` | Material and workstation icons recovered from PirateSpark |
| `legacy/piratespark/` | Recovered original calculator source, for reference |

## Known gaps

- The game data is from **0.2.3**. Recipes, build times, and fuel values may have changed since.
  Edit `src/data/oddsparks_0_2.json` to update them.
- Recipes are treated as single-output. Byproducts aren't credited.
- Spark speeds are Stumpy 100% and Crafty 150%, from PirateSpark's data.
