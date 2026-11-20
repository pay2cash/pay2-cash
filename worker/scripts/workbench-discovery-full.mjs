// Workbench Discovery_Flow_full_catalog driver (RET10 1.2.5 GROCERY).
// Chain: search (already sent by the watch) → on_search. Two steps, done.
// Usage: node workbench-discovery-full.mjs <txn>
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../ondc-logs/RET10/workbench_discovery_full/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const txn = process.argv[2];
if (!txn) { console.error("usage: workbench-discovery-full.mjs <txn>"); process.exit(1); }
const log = (m) => console.log(`  ${m}`);

function readAllCbs(action) {
  try {
    const out = execSync(
      `npx wrangler d1 execute pay2cash --remote --json --command "SELECT payload FROM ondc_logs WHERE action='${action}' AND transaction_id='${txn}' ORDER BY created_at ASC;"`,
      { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    return (JSON.parse(out)?.[0]?.results ?? [])
      .map((r) => { try { return JSON.parse(r.payload); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

log("waiting for on_search…");
let rows = [];
for (let i = 0; i < 20 && rows.length === 0; i++) {
  rows = readAllCbs("on_search");
  if (!rows.length) execSync("sleep 3");
}
if (!rows.length) { log("✗ on_search not captured"); process.exit(1); }
const cb = rows[rows.length - 1];
writeFileSync(OUT + "on_search.json", JSON.stringify(cb, null, 2) + "\n");
const providers = cb.message?.catalog?.["bpp/providers"] ?? [];
const items = providers[0]?.items ?? [];
log(`✓ on_search captured — provider=${providers[0]?.id} items=${items.length}`);
log(`done — logs in ${OUT}`);
