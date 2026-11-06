<script lang="ts">
  // Properties of the selected part or wire: what it's doing right now and why (live inputs and
  // outputs), and its settings.
  import { GAME } from "$lib/engine/data";
  import { bridgeCrossing, ensureSparks, pathNetwork, sanitizeConfig } from "../circuit";
  import { connectedTiles, erase, kindOf, maskOf, PATH_SPEED, tile } from "../grid";
  import { itemName, PARTS, STORAGE_PRESETS } from "../parts";
  import type { Sim } from "../sim";
  import type { LogicStore } from "../store.svelte";
  import type { Circuit, FieldDef, Part } from "../types";
  import ItemSelect from "./ItemSelect.svelte";

  let {
    store,
    sim,
    frame,
    running,
    onrotate,
    ondelete,
    onduplicate,
    onclose,
  }: {
    store: LogicStore;
    sim: Sim;
    frame: number;
    running: boolean;
    onrotate: () => void;
    ondelete: () => void;
    onduplicate: () => void;
    onclose: () => void;
  } = $props();

  const sel = $derived(store.selection);
  const part = $derived(sel?.kind === "part" ? store.circuit.parts.find((p) => p.id === sel.id) : undefined);
  const wire = $derived(sel?.kind === "wire" ? store.circuit.wires.find((w) => w.id === sel.id) : undefined);
  const type = $derived(part ? PARTS.get(part.type) : undefined);

  const recipes = (() => {
    const by = new Map<string, { id: string; name: string }[]>();
    for (const r of GAME.recipes) {
      const ws = GAME.workstations.get(r.workstation)?.name ?? r.workstation;
      if (!by.has(ws)) by.set(ws, []);
      by.get(ws)!.push({ id: r.id, name: `${r.name} (${r.from.map((f) => `${f.amount} ${itemName(f.material)}`).join(" + ") || "nothing"})` });
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();

  function setField(p: Part, key: string, value: unknown) {
    store.edit((c) => {
      const target = c.parts.find((x) => x.id === p.id);
      if (target) target.cfg = sanitizeConfig(target.type, { ...$state.snapshot(target.cfg), [key]: value });
    });
  }

  const live = $derived.by(() => {
    void frame;
    void store.version;
    if (!part || !type) return null;
    return {
      lines: sim.describe(part.id),
      ports: type.ports.map((p) => {
        // Logic ports connect through the wire tile they face, item ports through the path tile
        // they face; sensor links are drawn port to port.
        const wired =
          p.kind === "logic"
            ? sim.portWired(part.id, p.id)
            : p.kind === "item"
              ? sim.portOnPath(part.id, p.id)
              : store.circuit.wires.some(
                (w) => (w.from.part === part.id && w.from.port === p.id) || (w.to.part === part.id && w.to.port === p.id),
              );
        return { ...p, wired, on: p.kind === "logic" ? sim.port(part.id, p.id) : false };
      }),
    };
  });

  const wireInfo = $derived.by(() => {
    void frame;
    if (!wire) return null;
    const a = store.circuit.parts.find((p) => p.id === wire.from.part);
    const b = store.circuit.parts.find((p) => p.id === wire.to.part);
    if (!a || !b) return null;
    const pa = PARTS.get(a.type)!.ports.find((p) => p.id === wire.from.port)!;
    const name = (p: Part, port: string) => {
      const t = PARTS.get(p.type)!;
      const label = t.ports.find((x) => x.id === port)?.label ?? port;
      return `${(p.cfg.label as string) || t.name} · ${label}`;
    };
    return {
      kind: pa.kind,
      from: name(a, wire.from.port),
      to: name(b, wire.to.port),
      on: pa.kind === "logic" && sim.port(a.id, wire.from.port),
    };
  });

  const cellKey = $derived(sel?.kind === "cell" && store.circuit.cells[sel.id] ? sel.id : undefined);
  const cellInfo = $derived.by(() => {
    void frame;
    void store.version;
    if (!cellKey) return null;
    const kind = kindOf(store.circuit.cells[cellKey])!;
    const nets = sim.grid.cellNets.get(cellKey) ?? [];
    const names = kind === "r" ? ["Bit 0", "Bit 1", "Bit 2", "Bit 3"] : ["Signal"];
    const partName = (id: string) => {
      const p = store.circuit.parts.find((x) => x.id === id);
      return p ? ((p.cfg.label as string) || PARTS.get(p.type)!.name) : id;
    };
    return {
      kind,
      lanes: nets.map((n, i) => ({
        name: names[i] ?? `#${i}`,
        on: sim.netOn(n),
        ports: sim.netPorts(n).map((x) => {
          const port = PARTS.get(store.circuit.parts.find((p) => p.id === x.part)?.type ?? "")?.ports.find((p) => p.id === x.port);
          return { name: `${partName(x.part)} · ${port?.label ?? x.port}`, dir: x.dir, on: x.dir === "out" ? sim.port(x.part, x.port) : false };
        }),
      })),
    };
  });

  const pathKey = $derived(sel?.kind === "path" && store.circuit.paths[sel.id] ? sel.id : undefined);
  const pathInfo = $derived.by(() => {
    void frame;
    void store.version;
    if (!pathKey) return null;
    const kind: string = store.circuit.paths[pathKey][0];
    const net = pathNetwork(store.circuit.paths, pathKey);
    const crews = store.circuit.parts.filter((p) => p.type === "sparks" && net.has(`${p.x},${p.y}`));
    const here = sim.sparksOn(pathKey);
    const walking = sim.sparks.filter((s) => net.has(`${s.x},${s.y}`));
    const addOn = store.circuit.parts.find((p) => p.x + "," + p.y === pathKey && PARTS.get(p.type)?.path);
    return {
      kind,
      tiles: net.size,
      crews: crews.length,
      walking: walking.length,
      loaded: walking.filter((s) => s.load).length,
      here: here.map((s) => (s.load ? `${s.load.n} ${itemName(s.load.item)}` : "empty-handed") + (s.stuck ? ` (${s.stuck.replace(/\.$/, "").toLowerCase()})` : "")),
      addOn: addOn ? PARTS.get(addOn.type)!.name : null,
    };
  });

  /** Re-lays tiles as another kind, keeping how they join. */
  function setPathKind(keys: Iterable<string>, kind: string) {
    store.edit((c) => {
      for (const k of keys) if (c.paths[k]) c.paths[k] = tile(kind, maskOf(c.paths[k]));
    });
  }

  let bridgeError = $state<string | null>(null);
  $effect(() => {
    void cellKey;
    bridgeError = null;
  });

  const KIND = { logic: "signal", item: "path", observe: "sensor link" };
  const num = (f: FieldDef & { type: "number" }, raw: string) => {
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : f.min;
  };
</script>

<div class="inspector">
  {#if part && type && live}
    <header class="insp-head">
      <div>
        <h2>{type.name}</h2>
        <div class="muted small">
          {type.blurb}
          {#if type.wiki}
            <a href="https://oddsparks.wiki.gg/wiki/{encodeURIComponent(type.wiki.replace(/ /g, '_'))}" target="_blank" rel="noopener">Wiki</a>
          {:else}
            <em>Sandbox helper</em>
          {/if}
        </div>
      </div>
      <button class="icon-btn close" aria-label="Close" onclick={onclose}>✕</button>
    </header>
    <div class="insp-actions">
      {#if type.tap}
        <button class="primary" onclick={() => sim.tap(part.id)} disabled={!running} title={running ? "" : "Start the simulation first"}>
          {part.type === "button" ? "Press" : "Toggle"}
        </button>
      {/if}
      {#if type.action}
        <button class="primary" onclick={() => sim.act(part.id)} disabled={!running} title={running ? "" : "Start the simulation first"}>
          {type.action.label}
        </button>
      {/if}
      <button onclick={onrotate}>⟳ Rotate</button>
      <button onclick={onduplicate}>⧉ Copy</button>
      <button class="danger" onclick={ondelete}>🗑 Delete</button>
    </div>

    <section class="insp-live" aria-live="polite">
      {#each live.lines as line, i (i)}<p>{line}</p>{/each}
      {#if live.ports.length}
        <ul class="io">
          {#each live.ports as p (p.id)}
            <li class:on={p.on} class:unwired={!p.wired}>
              <span class="io-dot {p.kind}"></span>
              <span>{p.dir === "in" ? "In" : "Out"} {p.label ?? (p.id === "out" || p.id === "in" ? "" : p.id)}</span>
              <span class="muted">{KIND[p.kind]}</span>
              <span class="io-val">
                {#if !p.wired}not connected{:else if p.kind === "logic"}{p.on ? "ON" : "off"}{:else}connected{/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if type.fields.length}
      <section class="fields">
        {#if part.type === "storage"}
          <label>
            Preset
            <select
              value=""
              onchange={(e) => {
                const p = STORAGE_PRESETS.find((x) => x.id === e.currentTarget.value);
                if (p) setField(part, "capacity", p.capacity);
              }}
            >
              <option value="">Choose a size…</option>
              {#each STORAGE_PRESETS as p (p.id)}<option value={p.id}>{p.label} – {p.capacity}</option>{/each}
            </select>
          </label>
        {/if}
        {#each type.fields as f (f.key)}
          {@const v = part.cfg[f.key] as any}
          {#if part.type === "machine" && part.cfg.recipe && ["useItem", "useAmount", "makeItem", "makeAmount", "seconds"].includes(f.key)}
            <!-- set by the recipe -->
          {:else if part.type === "machine" && !part.cfg.recipe && f.key === "speed"}
            <!-- custom recipes are timed directly -->
          {:else if f.type === "bool"}
            <label class="check">
              <input type="checkbox" checked={v} onchange={(e) => setField(part, f.key, e.currentTarget.checked)} />
              {f.label}
            </label>
          {:else}
            <label>
              {f.label}{#if f.type === "number" && f.unit}<span class="muted"> ({f.unit})</span>{/if}
              {#if f.type === "number"}
                <input
                  type="number"
                  inputmode="decimal"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={v}
                  onchange={(e) => setField(part, f.key, num(f, e.currentTarget.value))}
                />
              {:else if f.type === "select"}
                <select value={v} onchange={(e) => setField(part, f.key, e.currentTarget.value)}>
                  {#each f.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
                </select>
              {:else if f.type === "item"}
                <ItemSelect value={v} emptyLabel={f.allowEmpty ? (f.emptyLabel ?? "None") : undefined} onchange={(x) => setField(part, f.key, x)} />
              {:else if f.type === "text"}
                <input type="text" maxlength={f.maxLength} value={v} onchange={(e) => setField(part, f.key, e.currentTarget.value)} />
              {:else if f.type === "recipe"}
                <select value={v} onchange={(e) => setField(part, f.key, e.currentTarget.value)}>
                  <option value="">Custom (set below)</option>
                  {#each recipes as [ws, list] (ws)}
                    <optgroup label={ws}>
                      {#each list as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
                    </optgroup>
                  {/each}
                </select>
              {:else if f.type === "items"}
                <div class="chips">
                  {#each v as it, i (i)}
                    <span class="chip">
                      {itemName(it)}
                      <button
                        class="icon-btn"
                        aria-label="Remove {itemName(it)}"
                        onclick={() => setField(part, f.key, (v as string[]).filter((_, k) => k !== i))}>✕</button
                      >
                    </span>
                  {/each}
                </div>
                {#if v.length < f.max}
                  <ItemSelect value="" emptyLabel="+ Add item…" onchange={(x) => x && setField(part, f.key, [...v, x])} />
                {/if}
              {:else if f.type === "stock"}
                {#each v as [it, n], i (i)}
                  <div class="stock-row">
                    <ItemSelect
                      value={it}
                      onchange={(x) => setField(part, f.key, (v as [string, number][]).map((e, k) => (k === i ? [x, e[1]] : e)))}
                    />
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={n}
                      aria-label="Count"
                      onchange={(e) =>
                        setField(part, f.key, (v as [string, number][]).map((x, k) => (k === i ? [x[0], +e.currentTarget.value] : x)))}
                    />
                    <button class="icon-btn" aria-label="Remove" onclick={() => setField(part, f.key, (v as unknown[]).filter((_, k) => k !== i))}
                      >✕</button
                    >
                  </div>
                {/each}
                {#if v.length < f.max}
                  <ItemSelect value="" emptyLabel="+ Add item…" onchange={(x) => x && setField(part, f.key, [...v, [x, 10]])} />
                {/if}
                <span class="muted small">Applies when the simulation is reset.</span>
              {/if}
            </label>
          {/if}
          {#if f.help}<p class="muted small help">{f.help}</p>{/if}
        {/each}
      </section>
    {/if}
  {:else if cellKey && cellInfo}
    <header class="insp-head">
      <div>
        <h2>{cellInfo.kind === "w" ? "Logic Wire" : "Logic Ribbon"}</h2>
        <div class="muted small">
          {cellInfo.kind === "w"
            ? "A buried wire tile. It joins the tiles it was drawn to."
            : "Carries four signals (bits 0–3). A plain wire joining it uses bit 0; Ribbon Writers and Readers use bits 1–3."}
          <a href="https://oddsparks.wiki.gg/wiki/{cellInfo.kind === 'w' ? 'Logic_Wire' : 'Logic_Ribbon'}" target="_blank" rel="noopener">Wiki</a>
        </div>
      </div>
      <button class="icon-btn close" aria-label="Close" onclick={onclose}>✕</button>
    </header>
    <section class="insp-live" aria-live="polite">
      {#each cellInfo.lanes as lane (lane.name)}
        <p><strong>{lane.name}:</strong> <span class:sig-on={lane.on}>{lane.on ? "ON" : "off"}</span></p>
        {#if lane.ports.length}
          <ul class="io">
            {#each lane.ports as p, i (i)}
              <li class:on={p.on}>
                <span class="io-dot logic"></span>
                <span>{p.name}</span>
                <span class="muted">{p.dir === "out" ? "drives" : "reads"}</span>
                <span class="io-val">{p.dir === "out" ? (p.on ? "ON" : "off") : ""}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">Nothing plugged in.</p>
        {/if}
      {/each}
      {#if cellInfo.lanes.some((l) => l.ports.some((p) => p.dir === "out"))}
        <p class="muted small">A network is on while any part driving it is on.</p>
      {/if}
    </section>
    <div class="insp-actions">
      {#if cellInfo.kind === "w"}
        <button
          title="Lift one of the wires meeting here onto a three-tile Wire Bridge, so they cross without connecting"
          onclick={() => {
            const draft = $state.snapshot(store.circuit) as Circuit;
            bridgeError = bridgeCrossing(draft, cellKey);
            if (!bridgeError)
              store.edit((c) => {
                c.cells = draft.cells;
                c.parts = draft.parts;
              });
          }}>⌒ Split with a bridge</button
        >
      {/if}
      <button class="danger" onclick={() => store.edit((c) => erase(c.cells, cellKey))}>🗑 Tile</button>
      <button
        class="danger"
        onclick={() =>
          store.edit((c) => {
            for (const k of connectedTiles(c.cells, cellKey)) erase(c.cells, k);
          })}>🗑 Whole wire</button
      >
    </div>
    {#if bridgeError}<p class="muted small">{bridgeError}</p>{/if}
  {:else if pathKey && pathInfo}
    <header class="insp-head">
      <div>
        <h2>{pathInfo.kind === "d" ? "Dirt Path" : "Stone Path"}</h2>
        <div class="muted small">
          Sparks walk paths at {Math.round(PATH_SPEED[pathInfo.kind] * 100)}% speed, taking the first of right, straight on, left, or back
          that's open to them.
          <a href="https://oddsparks.wiki.gg/wiki/{pathInfo.kind === 'd' ? 'Dirt_Path' : 'Stone_Path'}" target="_blank" rel="noopener">Wiki</a>
        </div>
      </div>
      <button class="icon-btn close" aria-label="Close" onclick={onclose}>✕</button>
    </header>
    <section class="insp-live" aria-live="polite">
      {#if pathInfo.addOn}<p>{pathInfo.addOn} on this tile.</p>{/if}
      <p>
        {pathInfo.here.length ? `On this tile: ${pathInfo.here.join(", ")}.` : "No spark on this tile right now."}
      </p>
      <p>
        This path: {pathInfo.tiles} tile(s), {pathInfo.walking} spark(s) walking it{pathInfo.walking ? `, ${pathInfo.loaded} carrying something` : ""}.
      </p>
      {#if !pathInfo.crews}
        <p class="muted small">No Sparks part on this path, so nothing walks it. Add some below.</p>
      {/if}
    </section>
    <div class="insp-actions">
      <button onclick={() => setPathKind([pathKey], pathInfo.kind === "d" ? "s" : "d")}>
        {pathInfo.kind === "d" ? "Make Stone" : "Make Dirt"}
      </button>
      <button onclick={() => setPathKind(pathNetwork(store.circuit.paths, pathKey), pathInfo.kind === "d" ? "s" : "d")}>
        Whole path {pathInfo.kind === "d" ? "Stone" : "Dirt"}
      </button>
      {#if !pathInfo.crews}
        <button
          class="primary"
          onclick={() =>
            store.edit((c) => {
              const id = ensureSparks(c, pathKey);
              if (id) store.selection = { kind: "part", id };
            })}>✦ Add sparks</button
        >
      {/if}
      <button class="danger" onclick={() => store.edit((c) => erase(c.paths, pathKey))}>🗑 Tile</button>
      <button
        class="danger"
        onclick={() =>
          store.edit((c) => {
            for (const k of pathNetwork(c.paths, pathKey)) delete c.paths[k];
          })}>🗑 Whole path</button
      >
    </div>
  {:else if wire && wireInfo}
    <header class="insp-head">
      <div>
        <h2>{wireInfo.kind === "logic" ? "Logic wire" : wireInfo.kind === "item" ? "Path" : "Sensor link"}</h2>
        <div class="muted small">{wireInfo.from} → {wireInfo.to}</div>
      </div>
      <button class="icon-btn close" aria-label="Close" onclick={onclose}>✕</button>
    </header>
    <section class="insp-live">
      {#if wireInfo.kind === "logic"}
        <p>Signal: <strong>{wireInfo.on ? "ON" : "off"}</strong></p>
      {:else}
        <p>The sensor reads this storage's fill level.</p>
      {/if}
    </section>
    <div class="insp-actions"><button class="danger" onclick={ondelete}>🗑 Delete</button></div>
  {/if}
</div>
