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
  what feeds what. Fuel edges are dashed. An input that would loop back up its own chain is
  marked "supply separately".
- **Recipe choices.** Pick between recipes, or mark any material as supplied externally,
  directly in the tree.
- **One-way production lines.** Every line flows from raw inputs toward its target and never
  loops back. Extra outputs from multi-output recipes (Plant Extractor, Geode Breaker…) are
  listed as surplus. They aren't fed back into earlier machines or into other lines, so belts
  don't cross back over the build. Random outputs count at their expected value.
- **Build plan.** A diagram of what to build. Each card is a group of machines running one
  recipe ("2 × Sawbench, Sawn Timber, 89% busy"). Arrows show which group feeds which, with
  the item and rate on each arrow. Raw inputs are on the left and targets on the right. Hover
  a card to trace its connections, and click it for details and its crew and recipe pickers.
  Totals per workstation sit above the diagram. On phones it runs top to bottom (raw inputs at
  the top, targets at the bottom). There's an Across/Down toggle.
- **Staffing.** How many sparks it takes to crew every machine, by spark type, with a button to
  add them as a target. Sparks are crafted too.
- **Item search.** Pick targets from a searchable list grouped by region, with icons.
- **Sites to claim.** Buildings that must sit on a world site (Logger on a Giant Tree, Drill on a
  Giant Rock, Miasma Collector on a Noxious Coral, Ore Miner on a Giant Ore Deposit, Spark
  Workbench and Workstation on an Ancient Base and Support, Arboretum on an Aetheric Fissure,
  Spark Workshop on an Ancient Foundation) need one site per machine. Miasma is made by the
  coral itself (15/min each, per the wiki), so it is counted as coral, not as a raw input.
- **What I have.** Enter the sites you've claimed, items you have coming in, or machines you've
  built ("2 × Noxious Coral"), and it shows the most your targets can make and which one runs out
  first. **Make the most** sets the targets to that. Production scales linearly, so this is exact:
  2 corals make at most 7.5 Refined Aether/min. A plan that needs more than you have is flagged.
- **Undo and redo** for every change to your plans (targets, recipes, crews, limits, checklist).
  Quick edits like typing a number count as one step. On a phone the buttons float in the corner;
  on a computer, Ctrl/⌘+Z and Ctrl/⌘+Shift+Z work too.
- **Inputs & cost.** Raw inputs needed, and the material cost to build every machine.
- **Saved plans and share links.** Keep several named plans and switch between them. **Share**
  sends a link that opens the plan for whoever follows it. The plan is encoded in the URL
  fragment and validated on the way in.
- **Build checklist.** Tick machine groups in the Build plan as you build them, with partial
  counts, progress, and per-plan saving.
- **Logic sandbox** (`/logic`, the **Logic** tab in the header). Draw and run the game's logic
  and automation: levers, timers, capacity and pressure sensors; NOT/AND/OR/XOR, Buffer, Filter
  and Counter gates; Set-Reset Latch and Data Flip-Flop; wireless senders and receivers (the
  channel is an item, as in the game); pixel displays; path add-ons (Item and Amount Filters,
  Blocker, Spark Gate, Splitter, Wait Gate, Counter, One Way, Crossing); storage and generic machines
  that can run any game recipe (a machine's output slot holds one stack, using wiki stack sizes,
  and it stops when the slot is full). The **Compressor** takes any item and sends it to the
  Recycler, so overflow never backs a line up. A **Grid** toggle draws tile lines (heavier every 5 tiles),
  and a **Logic** overlay fades buildings and paths so wires show through, like the game's logic
  view. Logic runs on **wire tiles on the grid**, as in the game. Tiles join
  only where drawn, so wires can run side by side. Three-tile **Wire Bridges** carry a wire over
  another, and **ribbons** carry four signals (bits 0–3) on one tile, used with Ribbon Writers and
  Readers and the Four Pixel Display. Parts take the same number of tiles as their wiki footprints.
  Draw tiles with the Wire, Ribbon and Erase tools. Or tap one port and then another, and a
  wire is routed on the grid for you. Items travel as in the game: **sparks carry them along path
  tiles** (Stone or Dirt), drawn with the Path tool or laid for you between a building's exit and
  an entrance. Sparks always take the first of right, straight on, left or back that's open, so
  filters and One Ways sort them, and you can watch queues and refills. Pan, zoom and pinch; tap a palette entry, then tap the grid to place it. Play, pause, step and change speed, and tap levers and buttons
  while it runs. Selecting a part shows its live inputs and outputs and why it's on or off. Undo
  and redo, several named circuits, and share links (`#circuit=…`, compressed and validated) are
  all there. It ships with examples: a **distribution center** (filters sort a train's cargo into
  per-item storage, and each workshop's low/high sensors and latch request a refill over wireless),
  an SR latch, timer pulses, a ribbon bus, a filter split, a 2-bit **binary adder**, a **switch
  encoder** (switches valued 1–7 sent in binary on a ribbon, and a cell that recognises its code),
  **request ribbons** (a central hub sends one bit per item down two side-by-side ribbons, and each
  fulfiller is just a reader and a latch), and a **request scanner** (persistent requests from many workshops on one ribbon: a counter
  built from Counter Gates polls each item's slot in turn, and the hub latches what's asked for). What each part does, what the wiki confirms and
  what is assumed are in [docs/logic-components.md](docs/logic-components.md).
- **Installable and offline.** Add it to your home screen. A service worker
  (`src/service-worker.ts`) caches the app so it opens without a connection.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # solver and logic engine tests (vitest)
npm run check      # svelte-check type checking
npm run build      # static site into build/
npm run import:wiki  # refresh src/lib/data/oddsparks.json and icons from the wiki
node scripts/import-logic-icons.mjs  # refresh the logic sandbox palette icons
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
- A machine that uses a site resource can't craft faster than its site supplies it. A Miasma Collector
  gets 15 miasma/min from its coral (1 every 4 s) and uses 2 per craft, so it tops out at one craft
  every 8 s (7.5 crafts/min, 15 vials/min) however fast
  its crew is (its 20-miasma buffer only covers bursts).
- Greenhouse and Arboretum recipes grow in cycles (10 and 100). Each cycle takes the recipe's
  duration and uses its listed inputs, and the products come out after the last cycle. Leafy
  Growth with one Stumpy: 640 s and 40 Leaves + 20 Fertiliser per 10 Leaf Knots. The solver counts
  cycles as crafts, so cards show cycles/min for these, and the 🌱 tag marks them.
- A fuelled machine burns the chosen fuel's per-minute amount from the game data.
- Each target expands into its own tree. Every node is sized for exactly what its parent
  pulls, and the Build plan sums the branches into one group per recipe. Extra outputs are surplus and are never
  credited anywhere.
- If an input already appears further up its own chain (coal fuelling the coal furnace,
  enrichment recipes, seed ↔ plant cycles), it isn't produced in a loop. It's flagged to be
  supplied separately. The importer picks loop-free default recipes, so this only happens
  when you choose a looping recipe or fuel.
- Totals are computed from memoised per-unit costs, so they stay exact. The tree view is built
  breadth-first with a display size limit.
- The Build plan's layout (`src/lib/engine/layout.ts`) is a simplified layered graph layout.
  Each group sits one column left of the furthest group it feeds, and barycenter sweeps order
  each column to reduce crossing arrows.

## Layout

| Path | What |
| --- | --- |
| `src/routes/+page.svelte` | The planner page: targets, settings, tabs |
| `src/routes/logic/+page.svelte` | The logic sandbox page: circuits menu, simulation controls, layout |
| `src/lib/logic/parts.ts` | Logic part registry: ports, settings, and per-tick behaviour of every part. Framework-free |
| `src/lib/logic/sim.ts` | Deterministic tick simulator: logic networks, wireless channels, items on paths. Framework-free |
| `src/lib/logic/grid.ts` | Wire and ribbon tiles: networks, painting and erasing, and the port-to-port router (which places Wire Bridges). Framework-free |
| `src/lib/logic/circuit.ts`, `geometry.ts`, `types.ts` | Circuit model, validation, wiring rules, share-link encoding, port geometry |
| `src/lib/logic/examples.ts` | Example circuits (distribution center, latch, timer, ribbon bus, filter split) |
| `src/lib/logic/store.svelte.ts` | Sandbox editor state: saved circuits (localStorage `voidspark:logic:v1`), undo/redo, share links |
| `src/lib/logic/ui/` | Canvas (pan/zoom/pinch, wiring), part rendering, palette, inspector |
| `src/lib/assets/logic/` | Wiki building renders used in the sandbox palette (`scripts/import-logic-icons.mjs`) |
| `src/lib/state.svelte.ts` | Reactive app state (`$state`): saved plans, checklist, share-link encoding; persisted to localStorage |
| `src/service-worker.ts`, `static/manifest.webmanifest` | Offline caching and install metadata |
| `src/lib/engine/data.ts` | Typed access to game data, plus facts the JSON lacks (spark-powered stations) |
| `src/lib/engine/limits.ts` | What I have: how much of each limit a plan uses, and the most it can make |
| `src/lib/history.ts` | Undo/redo over plan snapshots |
| `src/lib/engine/solver.ts` | Rates, machine counts, loops, trees, station and cost summaries. Framework-free |
| `src/lib/components/` | Tree, machines, inputs views, and recipe/spark/material pickers |
| `src/lib/data/oddsparks.json` | Game data imported from the wiki (generated, don't hand-edit) |
| `scripts/import-wiki.mjs` | The wiki importer, including its overrides (excluded buildings, caps, defaults) |
| `src/lib/assets/img/` | Icons: PirateSpark's originals plus new ones from the wiki |
| `legacy/piratespark/` | Recovered original calculator source, for reference |

## How the logic sandbox works

`src/lib/logic/sim.ts` runs fixed 0.05 s ticks. Each tick, every part reads its inputs as they
were at the end of the previous tick and writes its outputs for the next. So each gate adds one
tick of delay, and feedback loops (latches made from gates, a NOT gate wired to itself) settle or
oscillate instead of recursing. Logic networks come from the wire tiles (`src/lib/logic/grid.ts`).
Each tile records which neighbours it joins. A ribbon tile carries four networks. A Wire Bridge
joins the tiles beyond its two ends into one network, and hops whatever runs through its gap. A network is on when any output plugged into it is on. Wireless channels work the same way across the whole map. Sparks walk path
tiles (a separate layer that joins the same way wire tiles do). On reaching a tile, a spark drops
its load at any building entrance on its right facing that tile and picks up at any exit there, then turns right if it
can, else goes straight, left, or back. Add-ons on a tile change that: filters and blockers are
walls to some sparks, a Spark Gate holds them, a Splitter or One Way picks their exit. Sparks walk in
single file (one per tile per heading), so queues form behind a closed gate. The game's timings aren't documented, so the 0.05 s gate delay, walking speed, stack size
and the other gaps are listed as assumptions in
[docs/logic-components.md](docs/logic-components.md).

## Known gaps

- Temperature (heaters/coolers) isn't modelled. "Overclocked" recipes come in as alternates.
- The Arboretum's feeders aren't modelled: its inputs are shown as going into the Arboretum.
- The Ancient Printer/Generator/Greenhouse, Tailor's Tent, Aetheric Converter Feeder, and the
  shrines are left out. They are fixed ruins, cosmetic, or one-off repairs.
- The wiki is missing region categories for most 1.0 items. The importer fills them in from
  `REGION_OVERRIDES` (logged in the import report). It is also missing a build cost for the
  Spark Workshop.
