// Workbench Discovery_Flow_incremental_catalog_refresh_pull driver (RET10 1.2.5).
// Chain: search_1 (full catalog — sent by the watch) → on_search1 →
//   search_inc_pull (catalog_inc start_time/end_time) → on_search_inc_pull.
// Usage: node workbench-discovery-pull.mjs <txn>
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET12/1.2.5/seller";
const OUT = new URL("../ondc-logs/RET12/workbench_ret12_discovery_pull/", import.meta.url).pathname;
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
mkdirSync(OUT, { recursive: true });
const txn = process.argv[2];
if (!txn) { console.error("usage: workbench-discovery-pull.mjs <txn>"); process.exit(1); }
const log = (m) => console.log(`  ${m}`);
const now = () => new Date().toISOString();

async function fetchRetry(url, opts, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url, opts); }
    catch (e) { lastErr = e; log(`transport flake (${e.cause?.code ?? e.message}), retry ${i + 1}/${tries}`); await new Promise((r) => setTimeout(r, 3000)); }
  }
  throw lastErr;
}

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

// ---- on_search1 (full catalog) ----
log("waiting for on_search (full catalog)…");
let full = [];
for (let i = 0; i < 20 && full.length === 0; i++) {
  full = readAllCbs("on_search");
  if (!full.length) execSync("sleep 3");
}
if (!full.length) { log("✗ on_search not captured"); process.exit(1); }
writeFileSync(OUT + "on_search_1.json", JSON.stringify(full[0], null, 2) + "\n");
log(`✓ on_search1 captured — provider=${full[0].message?.catalog?.["bpp/providers"]?.[0]?.id}`);

// ---- search_inc_pull ----
const start = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min window
const body = {
  context: {
    domain: "ONDC:RET12", action: "search",
    timestamp: now(), transaction_id: txn, message_id: crypto.randomUUID(),
    bap_id: BAP_ID, bap_uri: BAP_URI,
    ttl: "PT30S", country: "IND", city: "std:080", core_version: "1.2.5",
  },
  message: {
    intent: {
      payment: {
        "@ondc/org/buyer_app_finder_fee_type": "percent",
        "@ondc/org/buyer_app_finder_fee_amount": "3",
      },
      tags: [
        {
          code: "bap_terms",
          list: [
            { code: "static_terms", value: "https://ondc.agentbuy.online/terms" },
            { code: "static_terms_new", value: "https://github.com/ONDC-Official/NP-Static-Terms/buyerNP_BNP/1.0/tc.pdf" },
            { code: "effective_date", value: now() },
          ],
        },
        {
          code: "bap_features",
          list: [
            { code: "001", value: "yes" },
            { code: "001", value: "yes" },
          ],
        },
        {
          code: "catalog_inc",
          list: [
            { code: "start_time", value: start },
            { code: "end_time", value: now() },
          ],
        },
      ],
    },
  },
};
const raw = JSON.stringify(body);
const { header } = createAuthorizationHeader(raw);
const res = await fetchRetry(`${MOCK}/search`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: header }, body: raw,
});
const text = await res.text();
let ack = "", err = "";
try { const j = JSON.parse(text); ack = j?.message?.ack?.status ?? ""; err = j?.error?.message ?? ""; } catch {}
log(`search_inc_pull: HTTP ${res.status} ack=${ack}${err ? " — " + String(err).slice(0, 800) : ""}`);
writeFileSync(OUT + "search_inc_pull.json", JSON.stringify(body, null, 2) + "\n");
if (!(res.status === 200 && ack === "ACK")) process.exit(1);

// ---- on_search_inc_pull ----
log("waiting for on_search_inc_pull…");
let pull = [];
for (let i = 0; i < 20 && pull.length <= full.length; i++) {
  pull = readAllCbs("on_search");
  if (pull.length <= full.length) execSync("sleep 3");
}
if (pull.length > full.length) {
  const inc = pull[pull.length - 1];
  writeFileSync(OUT + "on_search_inc_pull.json", JSON.stringify(inc, null, 2) + "\n");
  log("✓ on_search_inc_pull captured");
} else {
  log("⚠ on_search_inc_pull not seen");
}
log(`done — logs in ${OUT}`);
