// Workbench Discovery_Flow_incremental_catalog driver (RET10 1.2.5 GROCERY).
// Chain: search(catalog_inc start — sent by the watch) → 3× on_search pushes
//   → search(catalog_inc stop). Usage: node workbench-discovery-inc.mjs <txn>
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET12/1.2.5/seller";
const OUT = new URL("../ondc-logs/RET12/workbench_ret12_discovery_inc/", import.meta.url).pathname;
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
mkdirSync(OUT, { recursive: true });
const txn = process.argv[2];
if (!txn) { console.error("usage: workbench-discovery-inc.mjs <txn>"); process.exit(1); }
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

// ---- capture the incremental on_search pushes (expect 3) ----
log("waiting for incremental on_search pushes…");
let seen = new Set();
for (let i = 0; i < 40; i++) {
  seen = new Set(readAllCbs("on_search").map((c) => c.context?.message_id).filter(Boolean));
  if (seen.size >= 3) break;
  execSync("sleep 4");
}
const pushes = readAllCbs("on_search");
if (!pushes.length) { log("✗ no on_search captured"); process.exit(1); }
pushes.forEach((p, i) => {
  writeFileSync(OUT + `on_search_inc_${i + 1}.json`, JSON.stringify(p, null, 2) + "\n");
  const desc = p.message?.catalog?.descriptor?.name ?? "catalog";
  log(`✓ on_search push ${i + 1} captured (${desc})`);
});
if (pushes.length < 3) log(`⚠ only ${pushes.length}/3 pushes seen — continuing`);

// ---- send the catalog_inc STOP search ----
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
      tags: [{ code: "catalog_inc", list: [{ code: "mode", value: "stop" }] }],
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
log(`search(stop): HTTP ${res.status} ack=${ack}${err ? " — " + String(err).slice(0, 800) : ""}`);
writeFileSync(OUT + "search_inc_stop.json", JSON.stringify(body, null, 2) + "\n");
if (!(res.status === 200 && ack === "ACK")) process.exit(1);
log(`done — logs in ${OUT}`);
