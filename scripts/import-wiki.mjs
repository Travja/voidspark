#!/usr/bin/env node
/**
 * Import Oddsparks recipes, items and buildings from oddsparks.wiki.gg.
 *
 *   node scripts/import-wiki.mjs            # writes src/lib/data/oddsparks.json + new icons
 *   node scripts/import-wiki.mjs --no-images
 *
 * Reads every page that uses Template:Recipe, resolves duplicate and conflicting entries,
 * fetches item and building infoboxes (category, fuel burn rate, build cost, icon), and keeps
 * ids stable against the previous data file. A report of everything it had to decide or drop
 * is written to docs/wiki-import-report.md. Wiki content is CC BY-SA.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = join(ROOT, "src/lib/data/oddsparks.json");
/** PirateSpark's data: the source of ids for everything it already had, so ids never drift. */
const LEGACY_DATA_FILE = join(ROOT, "legacy/piratespark/data/oddsparks_0_2.json");
const IMG_DIR = join(ROOT, "src/lib/assets/img");
const REPORT_FILE = join(ROOT, "docs/wiki-import-report.md");
const API = "https://oddsparks.wiki.gg/api.php";
const UA = "VoidSpark-importer/0.2 (https://github.com/Travja/voidspark)";
const WITH_IMAGES = !process.argv.includes("--no-images");

// ---------------------------------------------------------------------------------------------
// Judgement calls the wiki can't express. Each one is listed in the report.

/** Buildings that aren't part of a plannable production line. */
const EXCLUDED_WORKSTATIONS = {
  "Ancient Printer": "Fixed ruin; cannot be built and runs off the world-wide Subsurface Aether rate",
  "Ancient Generator": "Fixed ruin; produces the world-wide Subsurface Aether rate",
  "Ancient Greenhouse": "Ancient ruin building, not player-buildable",
  "Tailor's Tent": "Cosmetic hats only",
  "Aetheric Converter Feeder": "Feeds a converter rather than producing an item",
};
const EXCLUDED_WORKSTATION_PATTERN = /shrine$/i; // one-off shrine repairs

/** Stations that don't run on sparks. */
const NOT_SPARK_POWERED = {
  Arboretum: "Wiki: 'The Arboretum does not need Sparks to operate' (sparks work its Feeders)",
};

/** Supply caps in crafts/min. */
const CRAFT_CAP = {
  "Miasma Collector": [7.5, "Miasma arrives at 15/min and a craft uses 2 (wiki: capped to 8 s)"],
};

/** Default recipe per item when the automatic choice isn't what players usually want. */
const DEFAULT_RECIPE_OVERRIDES = {
  "tree-bark": ["bark", "Sawbench bark from logs (PirateSpark's default)"],
  "aether-shard": [null, "Supplied externally by default (PirateSpark's default)"],
};

/** Worker sparks that can crew stations, with speed in % (wiki Template:Recipe buttons). */
const WORKER_SPARKS = [
  { name: "Stumpy Spark", speed: 100 },
  { name: "Crafty Spark", speed: 150 },
  { name: "Handy Spark", speed: 250 },
];

// ---------------------------------------------------------------------------------------------

const report = { decisions: [], dropped: [], conflicts: [], missing: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(2000 * 2 ** attempt);
    }
  }
}

/** Fetch pages (wikitext + categories) in batches of 50. Returns Map<title, page>. */
async function fetchPages(titles) {
  const out = new Map();
  const list = [...new Set(titles)];
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const d = await api({
      action: "query",
      prop: "revisions|categories",
      rvprop: "content|timestamp",
      rvslots: "main",
      cllimit: "max",
      redirects: "1",
      titles: batch.join("|"),
    });
    const redirects = new Map((d.query.redirects ?? []).map((r) => [r.to, r.from]));
    const normalized = new Map((d.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of d.query.pages) {
      const requested = normalized.get(redirects.get(p.title) ?? p.title) ?? redirects.get(p.title) ?? p.title;
      if (p.missing) {
        out.set(requested, null);
        continue;
      }
      const page = {
        title: p.title,
        text: p.revisions[0].slots.main.content,
        ts: p.revisions[0].timestamp,
        categories: (p.categories ?? []).map((c) => c.title.replace(/^Category:/, "")),
      };
      out.set(requested, page);
      out.set(p.title, page);
    }
    await sleep(500);
  }
  return out;
}

// --- wikitext parsing -------------------------------------------------------------------------

function* templateCalls(text, name) {
  const re = new RegExp(`\\{\\{\\s*${name}\\s*(\\||\\}\\})`, "gi");
  let m;
  while ((m = re.exec(text))) {
    let depth = 0;
    let j = m.index;
    while (j < text.length) {
      if (text.startsWith("{{", j)) (depth++, (j += 2));
      else if (text.startsWith("}}", j)) {
        depth--;
        j += 2;
        if (depth === 0) break;
      } else j++;
    }
    yield text.slice(m.index + 2, j - 2);
    re.lastIndex = j;
  }
}

function templateParams(body) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (let k = 0; k < body.length; k++) {
    const two = body.slice(k, k + 2);
    if (body[k] === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    if (two === "{{" || two === "[[") depth++;
    if (two === "}}" || two === "]]") depth--;
    cur += body[k];
  }
  parts.push(cur);
  const res = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    res[p.slice(0, eq).trim().toLowerCase().replace(/\s+/g, " ")] = p
      .slice(eq + 1)
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
  }
  return res;
}

const cleanName = (s) =>
  (s ?? "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
const titleCase = (s) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const num = (v) => {
  const m = /^[0-9]*[.,]?[0-9]+/.exec(String(v ?? "").trim());
  return m ? parseFloat(m[0].replace(",", ".")) : null;
};
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const field = (text, name) => {
  const m = new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n|]*)`, "i").exec(text);
  return m ? m[1].trim() : null;
};

/** Normalize one {{Recipe}} call. Handles legacy and misspelled parameter names. */
function normalizeRecipe(p, page) {
  const g = (...keys) => keys.map((k) => p[k]).find((v) => v !== undefined && v !== "");
  const ingredients = [];
  const ingSpecs = [
    [["ingredient", "first ingredient"], ["ingredient_amount", "first ingredient amount"]],
    [["ingredient2", "ingredient2_", "seccond ingredient", "second ingredient"], ["ingredient2_amount", "seccond ingredient amount", "second ingredient amount"]],
    [["ingredient3", "third ingredient"], ["ingredient3_amount", "third ingredient amount"]],
  ];
  for (const [names, amounts] of ingSpecs) {
    const n = cleanName(g(...names));
    if (n) ingredients.push({ name: titleCase(n), amount: num(g(...amounts)) });
  }
  const products = [];
  const prodSpecs = [
    ["product", ["product_amount", "product amount"], ["product_odds"]],
    ["product2", ["product2_amount"], ["product2_odds"]],
    ["product3", ["product3_amount"], ["product3_odds"]],
  ];
  for (const [n, amounts, odds] of prodSpecs) {
    const name = cleanName(p[n]);
    if (name) products.push({ name: titleCase(name), amount: num(g(...amounts)), odds: num(g(...odds)) });
  }
  return {
    name: cleanName(g("name", "recipe name")),
    workstation: titleCase(cleanName(p.workstation)),
    duration: num(p.duration),
    fuel: !!(p.uses_fuel ?? "").trim(),
    randomised: !!(p.output_randomised ?? "").trim(),
    cycles: num(p.cycles),
    temperature: (p.temperature ?? "").trim() || null,
    ingredients,
    products,
    page,
  };
}

// --- main ---------------------------------------------------------------------------------------

async function main() {
  const previous = JSON.parse(readFileSync(LEGACY_DATA_FILE, "utf8"));
  const idByName = new Map();
  for (const m of previous.material) idByName.set(m.name.toLowerCase(), m.id);
  for (const w of previous.workstation) idByName.set(w.name.toLowerCase(), w.id);

  // 1. Every page that uses Template:Recipe.
  const usage = await api({ action: "query", list: "embeddedin", eititle: "Template:Recipe", eilimit: "500" });
  const recipePages = await fetchPages(usage.query.embeddedin.map((p) => p.title).filter((t) => !t.startsWith("Template:")));
  const raw = [];
  for (const [title, page] of recipePages) {
    if (!page || page.title !== title) continue;
    for (const body of templateCalls(page.text, "Recipe")) raw.push(normalizeRecipe(templateParams(body), page.title));
  }
  console.log(`Parsed ${raw.length} recipe templates from ${new Set(raw.map((r) => r.page)).size} pages`);

  // 2. Drop excluded buildings and incomplete entries.
  const excludedWs = (ws) => EXCLUDED_WORKSTATIONS[ws] ?? (EXCLUDED_WORKSTATION_PATTERN.test(ws) ? "Shrine repair (one-off)" : null);
  const usable = [];
  const excludedCount = new Map();
  for (const r of raw) {
    const why = excludedWs(r.workstation);
    if (why) {
      excludedCount.set(r.workstation, why);
      continue;
    }
    // Recipes that consume part of their own product (e.g. Fertiliser Enrichment) are kept: the
    // solver nets them out. Only drop a recipe that gives back exactly what it takes.
    const sig = (xs) => JSON.stringify(xs.map((x) => [x.name, x.amount]).sort());
    if (r.products.length && sig(r.products) === sig(r.ingredients)) {
      report.dropped.push(`${r.name || r.products[0]?.name} @ ${r.workstation} (${r.page}): output equals input`);
      continue;
    }
    usable.push(r);
  }
  for (const [ws, why] of excludedCount) report.decisions.push(`Excluded **${ws}** recipes: ${why}.`);

  // 3. Group duplicates by (workstation, products, ingredients). Prefer the building's own page,
  //    fill missing numbers from other copies, and record disagreements.
  const keyOf = (r) =>
    JSON.stringify([r.workstation, r.products.map((p) => p.name).sort(), r.ingredients.map((i) => i.name).sort()]);
  const groups = new Map();
  for (const r of usable) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const complete = (r) =>
    r.duration && r.products.every((p) => p.amount) && r.ingredients.every((i) => i.amount) && r.products.length;
  const signature = (r) =>
    JSON.stringify([r.duration, r.fuel, r.randomised, r.ingredients.map((i) => [i.name, i.amount]).sort(), r.products.map((p) => [p.name, p.amount, p.odds]).sort()]);
  let resolved = [];
  for (const copies of groups.values()) {
    const ranked = [...copies].sort(
      (a, b) =>
        (b.page === b.workstation) - (a.page === a.workstation) ||
        complete(b) - complete(a) ||
        copies.filter((c) => signature(c) === signature(b)).length - copies.filter((c) => signature(c) === signature(a)).length,
    );
    const best = structuredClone(ranked[0]);
    for (const other of ranked.slice(1)) {
      best.duration ??= other.duration;
      best.name ||= other.name;
      for (const i of best.ingredients) i.amount ??= other.ingredients.find((x) => x.name === i.name)?.amount ?? null;
      for (const p of best.products) {
        const o = other.products.find((x) => x.name === p.name);
        p.amount ??= o?.amount ?? null;
        p.odds ??= o?.odds ?? null;
      }
    }
    const variants = new Set(copies.filter(complete).map(signature));
    if (variants.size > 1) {
      report.conflicts.push(
        `${best.name || best.products[0].name} @ ${best.workstation}: ${variants.size} versions on ${[...new Set(copies.map((c) => c.page))].join(", ")}. Used the one from **${ranked[0].page}**.`,
      );
    }
    if (!complete(best)) {
      report.dropped.push(`${best.name || best.products[0]?.name} @ ${best.workstation} (${best.page}): missing amounts or duration`);
      continue;
    }
    resolved.push(best);
  }
  // Same-named recipe at the same station with different ingredients: a copy-paste slip. Prefer
  // the version whose name mentions its ingredient ("Extract Aether Segment" takes Aether
  // Segment), then the one on the building's own page.
  const byName = new Map();
  for (const r of resolved) {
    if (!r.name) continue;
    const k = JSON.stringify([r.workstation, r.name, r.products.map((p) => p.name).sort()]);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(r);
  }
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    const score = (r) =>
      (r.ingredients.some((i) => r.name.toLowerCase().includes(i.name.toLowerCase())) ? 2 : 0) +
      (r.page === r.workstation ? 1 : 0);
    const keep = [...list].sort((a, b) => score(b) - score(a))[0];
    for (const r of list) {
      if (r === keep) continue;
      resolved = resolved.filter((x) => x !== r);
      report.conflicts.push(
        `${r.name} @ ${r.workstation}: page ${r.page} lists ${r.ingredients.map((i) => i.name).join(" + ")}; kept ${keep.ingredients.map((i) => i.name).join(" + ")} from ${keep.page}.`,
      );
    }
  }
  // The same recipe listed at different buildings (item pages often copy the wrong one): keep the
  // versions that the building's own page lists.
  const byIO = new Map();
  for (const r of resolved) {
    const k = JSON.stringify([r.products.map((p) => p.name).sort(), r.ingredients.map((i) => i.name).sort()]);
    if (!byIO.has(k)) byIO.set(k, []);
    byIO.get(k).push(r);
  }
  const onBuildingPage = (r) => usable.some((u) => keyOf(u) === keyOf(r) && u.page === u.workstation);
  for (const list of byIO.values()) {
    if (new Set(list.map((r) => r.workstation)).size < 2) continue;
    const confirmed = list.filter(onBuildingPage);
    if (!confirmed.length) continue;
    for (const r of list) {
      if (confirmed.includes(r)) continue;
      resolved = resolved.filter((x) => x !== r);
      report.conflicts.push(
        `${r.name || r.products[0].name}: page ${r.page} says ${r.workstation}, but only ${confirmed.map((c) => c.workstation).join(", ")} lists it. Kept ${confirmed.map((c) => c.workstation).join(", ")}.`,
      );
    }
  }
  console.log(`${resolved.length} recipes after de-duplication`);

  // 4. Items and buildings referenced, and their infoboxes.
  const workstationNames = [...new Set(resolved.map((r) => r.workstation))];
  const itemNames = new Set(resolved.flatMap((r) => [...r.ingredients, ...r.products].map((x) => x.name)));
  const wsPages = await fetchPages(workstationNames);
  const costs = new Map();
  for (const ws of workstationNames) {
    const page = wsPages.get(ws);
    const cost = [];
    if (page) {
      const call = [...templateCalls(page.text, "building")][0];
      if (call) {
        const p = templateParams(call);
        for (const ord of ["first", "second", "third", "fourth"]) {
          const n = cleanName(p[`${ord} ingredient`]);
          const a = num(p[`${ord} ingredient amount`]);
          if (n && a) {
            cost.push({ name: titleCase(n), amount: a });
            itemNames.add(titleCase(n));
          }
        }
      }
    } else report.missing.push(`No wiki page for building **${ws}**`);
    costs.set(ws, cost);
  }
  for (const m of previous.material) itemNames.add(m.name);
  const itemPages = await fetchPages([...itemNames]);

  const regionOf = (cats) => ["Woodland", "Mountain", "Plateau", "Magic", "Metal"].find((c) => cats.includes(c));
  const materials = [];
  const fuels = [];
  for (const name of [...itemNames].sort()) {
    const page = itemPages.get(name);
    const cats = page?.categories ?? [];
    const isSpark = cats.includes("Spark") || / Spark$/.test(name);
    const prevId = idByName.get(name.toLowerCase());
    const id = prevId ?? (isSpark ? `${slug(name)}-block` : slug(name));
    const region = regionOf(cats);
    const prev = previous.material.find((m) => m.id === id);
    const category = region ? `${slug(region)}-${isSpark ? "sparks" : "items"}` : (prev?.category ?? "miscellaneous");
    if (!page) report.missing.push(`No wiki page for item **${name}** (kept category ${category})`);
    else if (!region) report.missing.push(`Item **${name}** has no region category on the wiki`);
    materials.push({ id, name, category, craftable: false, image: page ? field(page.text, "image") : null, page: page?.title });
    const burn = page ? num(field(page.text, "burnrate")) : null;
    if (burn) fuels.push({ id, name, amount: burn });
    idByName.set(name.toLowerCase(), id);
  }
  const workstations = workstationNames.sort().map((ws) => {
    const page = wsPages.get(ws);
    const cats = page?.categories ?? [];
    const id = idByName.get(ws.toLowerCase()) ?? slug(ws);
    idByName.set(ws.toLowerCase(), id);
    const category = cats.includes("Assembler") ? "assemblers" : cats.includes("Harvester") ? "harvesters" : cats.includes("Refiner") ? "refiners" : "miscellaneous";
    const out = {
      category,
      id,
      name: ws,
      cost: costs.get(ws).map((c) => ({ id: idByName.get(c.name.toLowerCase()), amount: c.amount })),
      sparkPowered: !NOT_SPARK_POWERED[ws],
      image: page ? field(page.text, "image") : null,
      page: page?.title,
    };
    if (NOT_SPARK_POWERED[ws]) report.decisions.push(`**${ws}** is not spark-powered: ${NOT_SPARK_POWERED[ws]}.`);
    if (CRAFT_CAP[ws]) {
      out.craftCap = CRAFT_CAP[ws][0];
      report.decisions.push(`**${ws}** capped at ${CRAFT_CAP[ws][0]} crafts/min: ${CRAFT_CAP[ws][1]}.`);
    }
    if (!out.cost.length) report.missing.push(`No build cost on the wiki for **${ws}**`);
    return out;
  });

  // 5. Recipes with stable ids.
  const usedIds = new Set();
  const processes = resolved.map((r) => {
    const ws = idByName.get(r.workstation.toLowerCase());
    const from = r.ingredients.map((i) => ({ material: idByName.get(i.name.toLowerCase()), amount: i.amount }));
    const n = r.products.length;
    const to = r.products.map((p) => {
      const chance = p.odds ? p.odds / 100 : r.randomised ? 1 / n : 1;
      return { material: idByName.get(p.name.toLowerCase()), amount: p.amount, ...(chance < 1 ? { chance: +chance.toFixed(4) } : {}) };
    });
    const old = previous.process.find(
      (o) =>
        o.workstation === ws &&
        o.to[0].material === to[0].material &&
        JSON.stringify(o.from.map((f) => f.material).sort()) === JSON.stringify(from.map((f) => f.material).sort()),
    );
    let id = old && !usedIds.has(old.id) ? old.id : slug(r.name || `${r.products[0].name} ${r.workstation}`);
    if (usedIds.has(id)) id = `${id}-${ws}`;
    while (usedIds.has(id)) id += "-2";
    usedIds.add(id);
    return {
      id,
      name: r.name || r.products.map((p) => p.name).join(" + "),
      workstation: ws,
      buildTime: r.duration,
      fuelRequired: r.fuel,
      from,
      to,
      ...(r.cycles ? { cycles: r.cycles } : {}),
      ...(r.temperature ? { temperature: r.temperature } : {}),
      source: r.page,
    };
  });
  // Keep the previous file's recipe order first, then new ones.
  const prevOrder = new Map(previous.process.map((p, i) => [p.id, i]));
  processes.sort((a, b) => (prevOrder.get(a.id) ?? 1e6) - (prevOrder.get(b.id) ?? 1e6));

  // 6. Craftable flags and default recipe per item.
  // Main output beats byproduct beats chance output; then PirateSpark's recipes, then
  // harvesting, then anything not overclocked (those need heaters).
  const legacyIds = new Set(previous.process.map((p) => p.id));
  const rank = (p, mat) => {
    const t = p.to.find((x) => x.material === mat);
    const role = t.chance ? 2 : p.to[0].material === mat ? 0 : 1;
    return role * 100 + (legacyIds.has(p.id) ? 0 : 10) + (p.from.length ? 5 : 0) + (/overclock/i.test(p.name) ? 1 : 0);
  };
  for (const m of materials) {
    const options = processes.filter((p) => p.to.some((t) => t.material === m.id));
    m.craftable = options.length > 0;
    const sorted = options.sort((a, b) => rank(a, m.id) - rank(b, m.id));
    let def = sorted.length && rank(sorted[0], m.id) < 200 ? sorted[0].id : null;
    if (sorted.length && def === null) report.decisions.push(`**${m.name}** is only a random or chance output, so it is supplied externally by default.`);
    if (m.id in DEFAULT_RECIPE_OVERRIDES) {
      def = DEFAULT_RECIPE_OVERRIDES[m.id][0];
      report.decisions.push(`Default for **${m.name}**: ${DEFAULT_RECIPE_OVERRIDES[m.id][1]}.`);
    }
    m.defaultRecipe = def;
  }

  // 6b. Defaults must not loop: a later machine should never feed an earlier one. Swap the
  //     cheapest alternative recipe into each loop until none are left; if a loop has no
  //     loop-free alternative, supply one of its materials externally.
  const byId = new Map(processes.map((p) => [p.id, p]));
  const matById = new Map(materials.map((m) => [m.id, m]));
  const loopMembers = () => {
    // Tarjan SCCs over "material -> inputs of its default recipe".
    let i = 0;
    const idx = new Map(), low = new Map(), st = [], on = new Set(), inLoop = new Set();
    const visit = (v) => {
      idx.set(v, i);
      low.set(v, i++);
      st.push(v);
      on.add(v);
      const r = byId.get(matById.get(v)?.defaultRecipe);
      for (const f of r?.from ?? []) {
        if (!idx.has(f.material)) {
          visit(f.material);
          low.set(v, Math.min(low.get(v), low.get(f.material)));
        } else if (on.has(f.material)) low.set(v, Math.min(low.get(v), idx.get(f.material)));
      }
      if (low.get(v) === idx.get(v)) {
        const comp = [];
        let w;
        do {
          w = st.pop();
          on.delete(w);
          comp.push(w);
        } while (w !== v);
        const self = (byId.get(matById.get(v)?.defaultRecipe)?.from ?? []).some((f) => f.material === v);
        if (comp.length > 1 || self) comp.forEach((c) => inLoop.add(c));
      }
    };
    for (const m of materials) if (!idx.has(m.id)) visit(m.id);
    return inLoop;
  };
  for (let guard = 0; guard < 100; guard++) {
    const loops = loopMembers();
    if (!loops.size) break;
    let best = null;
    for (const mid of loops) {
      const m = matById.get(mid);
      const current = byId.get(m.defaultRecipe);
      for (const alt of processes.filter((p) => p.to.some((t) => t.material === mid) && p.id !== m.defaultRecipe)) {
        const before = m.defaultRecipe;
        m.defaultRecipe = alt.id;
        const after = loopMembers();
        m.defaultRecipe = before;
        if (after.size >= loops.size || after.has(mid)) continue;
        const cost = rank(alt, mid) - rank(current, mid);
        if (!best || after.size < best.after || (after.size === best.after && cost < best.cost)) best = { m, alt, cost, after: after.size };
      }
    }
    if (best) {
      report.decisions.push(
        `**${best.m.name}** defaults to ${best.alt.name} (${workstations.find((w) => w.id === best.alt.workstation)?.name}) instead of ${byId.get(best.m.defaultRecipe).name}, which looped back into its own chain.`,
      );
      best.m.defaultRecipe = best.alt.id;
      continue;
    }
    // No alternative breaks it: supply the loop member with the fewest consumers externally.
    const consumers = (mid) => processes.filter((p) => p.from.some((f) => f.material === mid)).length;
    const victim = [...loops].map((id) => matById.get(id)).sort((a, b) => consumers(a.id) - consumers(b.id))[0];
    report.decisions.push(
      `**${victim.name}** is supplied externally by default: every recipe for it loops back into its own chain.`,
    );
    victim.defaultRecipe = null;
  }

  // 7. Icons for anything new.
  if (WITH_IMAGES) {
    const need = [...materials, ...workstations].filter((e) => !existsSync(join(IMG_DIR, `${e.id}.png`)));
    for (let i = 0; i < need.length; i += 50) {
      const batch = need.slice(i, i + 50);
      const files = batch.map((e) => `File:${e.image || `${e.name}.png`}`);
      const d = await api({ action: "query", prop: "imageinfo", iiprop: "url", iiurlwidth: "80", titles: files.join("|") });
      const norm = new Map((d.query.normalized ?? []).map((n) => [n.to, n.from]));
      const urls = new Map(d.query.pages.map((p) => [norm.get(p.title) ?? p.title, p.imageinfo?.[0]?.thumburl ?? p.imageinfo?.[0]?.url]));
      for (const [k, e] of batch.entries()) {
        const url = urls.get(files[k]);
        if (!url) {
          report.missing.push(`No icon on the wiki for **${e.name}**`);
          continue;
        }
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
          report.missing.push(`Icon download failed for **${e.name}** (${res.status})`);
          continue;
        }
        writeFileSync(join(IMG_DIR, `${e.id}.png`), Buffer.from(await res.arrayBuffer()));
        await sleep(200);
      }
    }
  }

  // 8. Write data + report.
  const today = new Date().toISOString().slice(0, 10);
  const regions = ["woodland", "mountain", "plateau", "magic", "metal"];
  const categories = [
    ...regions.flatMap((r) => [
      { id: `${r}-sparks`, name: `${titleCase(r)} Sparks` },
      { id: `${r}-items`, name: `${titleCase(r)} Items` },
    ]),
    { id: "refiners", name: "Refiners" },
    { id: "assemblers", name: "Assemblers" },
    { id: "harvesters", name: "Harvesters" },
    { id: "miscellaneous", name: "Miscellaneous" },
  ].filter((c) => materials.some((m) => m.category === c.id) || workstations.some((w) => w.category === c.id));
  const sparks = WORKER_SPARKS.map((s) => {
    const block = idByName.get(s.name.toLowerCase());
    return { id: `spark-${slug(s.name.replace(/ Spark$/, ""))}`, name: s.name, block, speed: s.speed };
  });
  const data = {
    version: `wiki ${today}`,
    source: "https://oddsparks.wiki.gg (CC BY-SA)",
    spark: sparks,
    category: categories,
    workstation: workstations.map(({ image, page, ...w }) => w),
    process: processes,
    material: materials.map(({ image, page, ...m }) => m),
    fuel: fuels.sort((a, b) => a.name.localeCompare(b.name)),
  };
  writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);

  const lines = [
    `# Wiki import report (${today})`,
    "",
    `Generated by \`scripts/import-wiki.mjs\` from [oddsparks.wiki.gg](https://oddsparks.wiki.gg).`,
    `${raw.length} recipe templates were parsed and ${processes.length} recipes imported, with ${materials.length} items and ${workstations.length} workstations.`,
    "",
    "## Decisions",
    "",
    ...report.decisions.map((d) => `- ${d}`),
    "",
    "## Conflicting wiki entries",
    "",
    ...(report.conflicts.length ? report.conflicts.map((d) => `- ${d}`) : ["None."]),
    "",
    "## Dropped entries",
    "",
    ...(report.dropped.length ? report.dropped.map((d) => `- ${d}`) : ["None."]),
    "",
    "## Gaps on the wiki",
    "",
    ...(report.missing.length ? report.missing.map((d) => `- ${d}`) : ["None."]),
    "",
  ];
  writeFileSync(REPORT_FILE, lines.join("\n"));
  console.log(`Wrote ${processes.length} recipes, ${materials.length} items, ${workstations.length} workstations, ${fuels.length} fuels.`);
  console.log(`Report: ${report.decisions.length} decisions, ${report.conflicts.length} conflicts, ${report.dropped.length} dropped, ${report.missing.length} gaps.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
