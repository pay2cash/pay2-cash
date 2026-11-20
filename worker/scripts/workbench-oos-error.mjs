// Workbench Out_Of_Stock_Flow (Error-code) driver (RET10 1.2.5 GROCERY).
// Chain: select (sent by the watch) → on_select (DOMAIN-ERROR). Two steps.
// Usage: node workbench-oos-error.mjs <txn>
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../ondc-logs/RET10/workbench_oos_error/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const txn = process.argv[2];
if (!txn) { console.error("usage: workbench-oos-error.mjs <txn>"); process.exit(1); }
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

log("waiting for on_select (error response)…");
let rows = [];
for (let i = 0; i < 20 && rows.length === 0; i++) {
  rows = readAllCbs("on_select");
  if (!rows.length) execSync("sleep 3");
}
if (!rows.length) { log("✗ on_select not captured"); process.exit(1); }
const cb = rows[0];
writeFileSync(OUT + "on_select_out_of_stock.json", JSON.stringify(cb, null, 2) + "\n");
log(`✓ on_select captured — error: ${JSON.stringify(cb?.error?.message ?? cb?.error ?? "none").slice(0, 160)}`);
log(`done — logs in ${OUT}`);
