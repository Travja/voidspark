<script lang="ts">
  import "$lib/styles.css";
  import CrewPicker from "$lib/components/CrewPicker.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import InputsView from "$lib/components/InputsView.svelte";
  import MachinesView from "$lib/components/MachinesView.svelte";
  import MaterialPicker from "$lib/components/MaterialPicker.svelte";
  import TreeView from "$lib/components/TreeView.svelte";
  import { GAME } from "$lib/engine/data";
  import { Solver, type Plan, type Target } from "$lib/engine/solver";
  import { AppState, UNIT_FACTOR, type View } from "$lib/state.svelte";

  const app = new AppState();

  // Snapshot reads every field, so any config change rebuilds the solver and its caches.
  const solver = $derived(new Solver($state.snapshot(app.cfg)));
  const result = $derived.by((): { plan: Plan } | { error: string } => {
    try {
      return { plan: solver.plan() };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
  const u = $derived(UNIT_FACTOR[app.cfg.unit]);
  const hasOverrides = $derived(
    Object.keys(app.cfg.stationCrew).length + Object.keys(app.cfg.recipeChoice).length > 0,
  );

  const tabs: { id: View; label: string }[] = [
    { id: "tree", label: "Production tree" },
    { id: "machines", label: "Machines" },
    { id: "inputs", label: "Inputs & cost" },
  ];

  function setValue(t: Target, raw: string) {
    const v = parseFloat(raw) || 0;
    app.updateTarget(t.id, { value: t.mode === "rate" ? v / u : v });
  }

  function setMode(t: Target, mode: Target["mode"]) {
    if (mode === t.mode) return;
    const value = mode === "rate" ? solver.targetRate(t) : t.value / (solver.outputPerMachine(t.material) || 1);
    app.updateTarget(t.id, { mode, value: +value.toPrecision(6) });
  }

  function setFuel(id: string) {
    const f = GAME.fuels.find((x) => x.id === id)!;
    app.cfg.fuel = { material: f.id, perMinute: f.perMinute };
  }
</script>

<div class="app">
  <header class="top">
    <Icon id="crafty-spark-block" size={36} />
    <div>
      <h1>VoidSpark</h1>
      <div class="muted small">Oddsparks production planner · game data v{GAME.version}</div>
    </div>
  </header>

  <div class="layout">
    <aside>
      <section class="card">
        <h2>Targets</h2>
        {#each app.cfg.targets as t (t.id)}
          <div class="target">
            <Icon id={t.material} size={30} />
            <MaterialPicker value={t.material} onchange={(material) => app.updateTarget(t.id, { material })} />
            <div class="target-row">
              <input
                type="number"
                min="0"
                step="any"
                aria-label="Amount"
                value={t.mode === "rate" ? +(t.value * u).toPrecision(6) : t.value}
                oninput={(e) => setValue(t, e.currentTarget.value)}
              />
              <select
                aria-label="Target type"
                value={t.mode}
                onchange={(e) => setMode(t, e.currentTarget.value as Target["mode"])}
              >
                <option value="rate">items / {app.cfg.unit}</option>
                <option value="machines" disabled={!solver.recipeFor(t.material)}>machines</option>
              </select>
              <button class="icon-btn" aria-label="Remove target" onclick={() => app.removeTarget(t.id)}>✕</button>
            </div>
          </div>
        {/each}
        <button onclick={() => app.addTarget("sawn-timber")}>+ Add target</button>
      </section>

      <section class="card">
        <h2>Settings</h2>
        <label>
          Rate unit
          <select bind:value={app.cfg.unit}>
            <option value="sec">per second</option>
            <option value="min">per minute</option>
            <option value="hr">per hour</option>
          </select>
        </label>
        <label>
          Sparks per workstation
          <CrewPicker {app} />
        </label>
        <p class="muted small">
          Each station holds up to two sparks and their speeds add up (Stumpy 1×, Crafty 1.5×, Handy 2.5×). You can
          override the crew per workstation type from the tree or the Machines tab.
        </p>
        <label>
          Fuel
          <select value={app.cfg.fuel.material} onchange={(e) => setFuel(e.currentTarget.value)}>
            {#each GAME.fuels as f (f.id)}
              <option value={f.id}>{f.name} ({f.perMinute}/min per machine)</option>
            {/each}
          </select>
        </label>
        {#if hasOverrides}
          <button onclick={() => app.clearOverrides()} title="Clear per-station spark crews and recipe choices">
            Clear overrides
          </button>
        {/if}
      </section>
    </aside>

    <main>
      <nav class="tabs">
        {#each tabs as tab (tab.id)}
          <button class:active={app.cfg.view === tab.id} onclick={() => (app.cfg.view = tab.id)}>{tab.label}</button>
        {/each}
      </nav>
      {#if "error" in result}
        <div class="error">{result.error}</div>
      {:else}
        {#each result.plan.warnings as w (w)}
          <div class="warning">{w}</div>
        {/each}
        {#if app.cfg.view === "tree"}
          <TreeView trees={result.plan.trees} {solver} {app} />
        {:else if app.cfg.view === "machines"}
          <MachinesView plan={result.plan} {solver} {app} />
        {:else}
          <InputsView plan={result.plan} {solver} {app} />
        {/if}
      {/if}
    </main>
  </div>
  <footer class="muted small">
    Built on the recovered <a href="https://github.com/Travja/voidspark/tree/master/legacy/piratespark">PirateSpark</a>
    data and model. Recipes checked against the <a href="https://oddsparks.wiki.gg">Oddsparks Wiki</a>; 1.0-only content is not included yet.
  </footer>
</div>
