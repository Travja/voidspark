# PirateSpark (recovered source)

This is the calculator source of the original **PirateSpark** Oddsparks calculator. The
`master` branch of the fork only had a README, so the code was rebuilt from the production
build on the `gh-pages` branch:

- `src/**` came from the `sourcesContent` of `static/js/main.f14757fd.js.map`.
- `data/*.json` was pulled out of the minified bundle. Webpack inlines JSON modules as
  `JSON.parse('…')`, and JSON files have no source map entries.
- Images (now in `src/lib/assets/img`) came from the bundle's inlined base64 data
  URIs and from `static/media/*`.

Only the calculator code is kept: `pages/Calculator` and `store/calculator`. The admin
template scaffolding it shipped with (auth pages, Firebase helpers, layout components, theme
SCSS) is left out on purpose.

It is here for reference only. It is not built or run. VoidSpark (repository root) replaces
the calculation code with a general solver, `src/lib/engine/solver.ts`.

## Notes on the original model

- Crafts per minute per workstation = `120 * sparkSpeed / buildTime`
  (`60 * 2 * sparkSpeed * nWstn / buildTime` in `calculate/chain.js`). The wiki shows the factor
  should be 60 (see `docs/wiki-recipe-audit.md`), so these rates are 2× too high.
- One global spark speed: stumpy = 1.0, crafty = 1.5. The miasma collector ignores it, which
  is also wrong per the wiki.
- Fuel: `fuel.amount` items per minute for each workstation whose recipe has `fuelRequired`.
- Aether, miasma, and coal-as-fuel loops are each special-cased in `aether.js`, `miasma.js`,
  and `fuel.js`.
