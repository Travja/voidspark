#!/usr/bin/env node
// Downloads the wiki's building renders for the logic sandbox palette into
// src/lib/assets/logic/<part-type>.png. Run with NODE_USE_ENV_PROXY=1 behind an HTTPS proxy.
//
//   node scripts/import-logic-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/lib/assets/logic");
const API = "https://oddsparks.wiki.gg/api.php";
const UA = "VoidSpark-importer/0.2 (https://github.com/Travja/voidspark)";

/** Sandbox part type -> wiki file name. Parts without a wiki building have no entry. */
const FILES = {
  lever: "Lever.png",
  timer: "Signal timer.png",
  "capacity-sensor": "Capacity sensor.png",
  "pressure-sensor": "Pressure sensor.png",
  not: "Not gate.png",
  and: "And gate.png",
  or: "Or gate.png",
  xor: "Xor gate.png",
  buffer: "Buffer gate.png",
  filter: "Filter gate.png",
  "counter-gate": "Counter gate.png",
  "sr-latch": "Set-reset latch.png",
  "d-flipflop": "Data flip-flop.png",
  "wireless-sender": "Wireless signal sender.png",
  "wireless-receiver": "Wireless signal receiver.png",
  pixel: "Pixel display.png",
  pixel4: "Four pixel display.png",
  "wire-bridge": "Wire bridge.png",
  "ribbon-writer": "Ribbon writer.png",
  "ribbon-reader": "Ribbon reader.png",
  "item-filter": "Item filter.png",
  "amount-filter": "Amount filter.png",
  blocker: "Blocker.png",
  "spark-gate": "Spark gate.png",
  splitter: "Splitter.png",
  "wait-gate": "Wait gate.png",
  counter: "Counter.png",
  storage: "Crate.png",
  compressor: "Compressor.png",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const titles = Object.values(FILES).map((f) => `File:${f}`);
const url = new URL(API);
for (const [k, v] of Object.entries({
  action: "query",
  prop: "imageinfo",
  iiprop: "url",
  iiurlwidth: "64",
  titles: titles.join("|"),
  format: "json",
  formatversion: "2",
})) {
  url.searchParams.set(k, v);
}
const data = await (await fetch(url, { headers: { "User-Agent": UA } })).json();
const norm = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
const urls = new Map(data.query.pages.map((p) => [norm.get(p.title) ?? p.title, p.imageinfo?.[0]?.thumburl]));
for (const [type, file] of Object.entries(FILES)) {
  const src = urls.get(`File:${file}`);
  if (!src) {
    console.warn(`No image for ${type} (${file})`);
    continue;
  }
  const res = await fetch(src, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    console.warn(`Download failed for ${type}: ${res.status}`);
    continue;
  }
  writeFileSync(join(OUT, `${type}.png`), Buffer.from(await res.arrayBuffer()));
  console.log(`${type} <- ${file}`);
  await sleep(200);
}
