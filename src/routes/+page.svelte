<script lang="ts">
  import "$lib/styles.css";
  import CrewPicker from "$lib/components/CrewPicker.svelte";
  import { crewLabel } from "$lib/components/crews";
  import Icon from "$lib/components/Icon.svelte";
  import InputsView from "$lib/components/InputsView.svelte";
  import Limits from "$lib/components/Limits.svelte";
  import { checkLimits, limitName } from "$lib/engine/limits";
  import FlowDiagram from "$lib/components/FlowDiagram.svelte";
  import MaterialPicker from "$lib/components/MaterialPicker.svelte";
  import PlanBar from "$lib/components/PlanBar.svelte";
  import TreeView from "$lib/components/TreeView.svelte";
  import { GAME } from "$lib/engine/data";
  import { Solver, type Plan, type Target } from "$lib/engine/solver";
  import { AppState, UNIT_FACTOR, type View } from "$lib/state.svelte";
  import { resolve } from "$app/paths";

  const app = new AppState();

  // Short confirmation messages ("Link copied", "Opened shared plan ...").
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function notify(message: string) {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3000);
  }

  // Opened from a share link (on load, or pasted into an open tab)?
  function openShared() {
    const name = app.openSharedPlan();
    if (name) notify(`Opened shared plan “${name}”`);
  }
  openShared();

  // Install as an app. Android/Chrome offers a prompt we can trigger; iOS needs Share → Add to
  // Home Screen. Nothing is shown once it's running installed.
  type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  let installPrompt = $state<InstallPrompt | null>(null);
  const installed =
    matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  $effect(() => {
    const capture = (e: Event) => {
      e.preventDefault();
      installPrompt = e as InstallPrompt;
    };
    const done = () => (installPrompt = null);
    addEventListener("beforeinstallprompt", capture);
    addEventListener("appinstalled", done);
    return () => {
      removeEventListener("beforeinstallprompt", capture);
      removeEventListener("appinstalled", done);
    };
  });
  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null;
  }
  $effect(() => {
    addEventListener("hashchange", openShared);
    return () => removeEventListener("hashchange", openShared);
  });

  // Snapshot reads every field, so any config change rebuilds the solver and its caches.
  const solver = $derived(new Solver($state.snapshot(app.cfg)));
  const result = $derived.by((): { plan: Plan } | { error: string } => {
    try {
      return { plan: solver.plan() };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
  const limits = $derived("plan" in result ? checkLimits(result.plan, solver, app.cfg.limits) : null);
  const short = $derived(limits?.uses.filter((x) => x.used > x.limit.amount + 1e-9) ?? []);

  function undo() {
    if (app.undo()) notify("Undone");
  }
  function redo() {
    if (app.redo()) notify("Redone");
  }
  // Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y). Text fields keep their own undo.
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) undo();
      else if ((key === "z" && e.shiftKey) || key === "y") redo();
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const u = $derived(UNIT_FACTOR[app.cfg.unit]);
  const hasOverrides = $derived(
    Object.keys(app.cfg.stationCrew).length + Object.keys(app.cfg.recipeChoice).length > 0,
  );

  const tabs: { id: View; label: string }[] = [
    { id: "tree", label: "Production tree" },
    { id: "machines", label: "Build plan" },
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

  // Settings start collapsed on phones so the results are near the top.
  let settingsOpen = $state(typeof matchMedia === "undefined" || matchMedia("(min-width: 861px)").matches);
  const unitName = { sec: "sec", min: "min", hr: "hr" } as const;
  const settingsSummary = $derived(
    [
      crewLabel(app.cfg.defaultCrew.map((id) => GAME.sparks.find((s) => s.id === id)!).filter(Boolean)),
      `per ${unitName[app.cfg.unit]}`,
      `${GAME.fuels.find((f) => f.id === app.cfg.fuel.material)?.name ?? "no"} fuel`,
    ].join(" · "),
  );

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
      <div class="muted small">Oddsparks production planner · data from the Oddsparks Wiki ({GAME.version.replace("wiki ", "")})</div>
    </div>
    <nav class="site-nav" aria-label="Sections">
      <a href={resolve("/")} aria-current="page">Planner</a>
      <a href={resolve("/logic")}>Logic sandbox</a>
    </nav>
  </header>

  <div class="layout">
    <aside>
      <section class="card">
        <PlanBar {app} {notify} />
        <h2>Targets</h2>
        {#each app.cfg.targets as t (t.id)}
          <div class="target">
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

      {#if "plan" in result && limits}
        <Limits plan={result.plan} report={limits} {app} />
      {/if}

      <details class="card settings" bind:open={settingsOpen}>
        <summary>
          <h2>Settings</h2>
          {#if !settingsOpen}<span class="muted small">{settingsSummary}</span>{/if}
        </summary>
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
          Machines normally run with two sparks, and their speeds add up (Stumpy 1×, Crafty 1.5×, Handy 2.5×). You
          can override the crew per workstation type from the tree or the Build plan.
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
      </details>
    </aside>

    <main>
      <nav class="tabs">
        {#each tabs as tab (tab.id)}
          <button class:active={app.cfg.view === tab.id} onclick={() => (app.cfg.view = tab.id)}>{tab.label}</button>
        {/each}
        <span class="history-btns">
          <button class="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!app.canUndo} onclick={undo}>↶</button>
          <button class="icon-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!app.canRedo} onclick={redo}>↷</button>
        </span>
      </nav>
      {#if "error" in result}
        <div class="error">{result.error}</div>
      {:else}
        {#each short as s (s.limit.id)}
          <div class="warning">
            Needs {s.limit.kind === "item" ? `${+(s.used * u).toPrecision(3)}/${app.cfg.unit}` : Math.ceil(s.used - 1e-9)}
            {limitName(s.limit)}{s.limit.kind === "workstation" ? " machines" : s.limit.kind === "site" ? " sites" : ""}, you
            have {s.limit.kind === "item" ? `${+(s.limit.amount * u).toPrecision(3)}/${app.cfg.unit}` : s.limit.amount}. See
            What I have.
          </div>
        {/each}
        {#each result.plan.warnings as w (w)}
          <div class="warning">{w}</div>
        {/each}
        {#if app.cfg.view === "tree"}
          <TreeView trees={result.plan.trees} {solver} {app} />
        {:else if app.cfg.view === "machines"}
          <FlowDiagram plan={result.plan} {solver} {app} />
        {:else}
          <InputsView plan={result.plan} {solver} {app} />
        {/if}
      {/if}
    </main>
  </div>
  <footer class="muted small">
    {#if !installed && installPrompt}
      <p><button onclick={install}>Install app</button> Works offline once installed.</p>
    {:else if !installed && isIOS}
      <p>Install: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. It works offline.</p>
    {/if}
    Recipes, items and icons from the <a href="https://oddsparks.wiki.gg">Oddsparks Wiki</a> (CC BY-SA). Built on the
    recovered <a href="https://github.com/Travja/voidspark/tree/master/legacy/piratespark">PirateSpark</a> calculator.
  </footer>
</div>

{#if toast}
  <div class="toast" role="status" aria-live="polite">{toast}</div>
{/if}
