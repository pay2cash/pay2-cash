// Workbench Catalog_Rejection_Flow driver (RET10 1.2.5 GROCERY).
// Chain: on_search → catalog_rejection. Pre-flight + retry hardened.
// Usage: node workbench-catalog-rejection.mjs <txn>
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET10/1.2.5/seller";
const TESTBASE = MOCK.replace(/\/ONDC:RET10.*$/, "");

const OUT = new URL("../ondc-logs/RET10/workbench_catalog_rejection/", import.meta.url).pathname;
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
mkdirSync(OUT, { recursive: true });

const txn = process.argv[2];
if (!txn) { console.error("usage: workbench-catalog-rejection.mjs <txn>"); process.exit(1); }

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const log = (m) => console.log(`  ${m}`);

const ctx = (action, city = "std:080") => ({
  domain: "ONDC:RET10", country: "IND", city, core_version: "1.2.5",
  action, transaction_id: txn, message_id: uuid(), timestamp: now(),
  bap_id: BAP_ID, bap_uri: BAP_URI,
  bpp_id: "sample-bpp-id", bpp_uri: "https://bpp.example.com",
  ttl: "PT30S",
});

async function fetchRetry(url, opts, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url, opts); }
    catch (e) { lastErr = e; log(`transport flake (${e.cause?.code ?? e.message}), retry ${i + 1}/${tries}`); await new Promise((r) => setTimeout(r, 3000)); }
  }
  throw lastErr;
}

async function prevalidate(action, body) {
  const raw = JSON.stringify(body);
  const res = await fetchRetry(`${TESTBASE}/ONDC:RET10/1.2.5/test/${action}`, {
    method: "POST", headers: { "Content-Type": "text/plain" }, body: raw,
  });
  const text = await res.text();
  let ack = "", err = "";
  try { const j = JSON.parse(text); ack = j?.message?.ack?.status ?? ""; err = j?.error?.message ?? ""; } catch {}
  if (ack === "ACK") return true;
  log(`✗ pre-flight FAILED for ${action}:\n${String(err).slice(0, 2500)}`);
  return false;
}

async function send(action, body, file) {
  if (!(await prevalidate(action, body))) process.exit(1);
  const raw = JSON.stringify(body);
  const { header } = createAuthorizationHeader(raw);
  const res = await fetchRetry(`${MOCK}/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: header }, body: raw,
  });
  const text = await res.text();
  let ack = "", err = "";
  try { const j = JSON.parse(text); ack = j?.message?.ack?.status ?? ""; err = j?.error?.message ?? ""; } catch {}
  log(`${action}: HTTP ${res.status} ack=${ack}${err ? " — " + String(err).slice(0, 1500) : ""}`);
  if (file) writeFileSync(OUT + file, JSON.stringify(body, null, 2) + "\n");
  return res.status === 200 && ack === "ACK";
}

function readCb(action, tries = 20, delayMs = 3000) {
  for (let i = 0; i < tries; i++) {
    try {
      const out = execSync(
        `npx wrangler d1 execute pay2cash --remote --json --command "SELECT payload FROM ondc_logs WHERE action='${action}' AND transaction_id='${txn}' ORDER BY created_at DESC LIMIT 1;"`,
        { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"] },
      ).toString();
      const rows = JSON.parse(out)?.[0]?.results ?? [];
      if (rows.length) return JSON.parse(rows[0].payload);
    } catch {}
    execSync(`sleep ${Math.round(delayMs / 1000)}`);
  }
  return null;
}

// ---- on_search ----
log("waiting for on_search…");
const onSearch = readCb("on_search", 20);
if (!onSearch) { log("✗ on_search not captured"); process.exit(1); }
log("✓ on_search captured");
writeFileSync(OUT + "on_search.json", JSON.stringify(onSearch, null, 2) + "\n");
const providers = onSearch.message?.catalog?.["bpp/providers"] ?? [];
const items = providers[0]?.items ?? [];
log(`catalog: provider=${providers[0]?.id} items=${items.length} (${items.slice(0, 5).map((i) => i.id).join(", ")}${items.length > 5 ? "…" : ""})`);

// ---- catalog_rejection ----
// Errors mirror the flow's published example: item price > MRP on the first two items.
const errItems = items.length ? [items[0].id, items[1]?.id ?? items[0].id] : ["I1", "I2"];
const ok = await send("catalog_rejection", {
  context: ctx("catalog_rejection", "*"),
  message: {
    errors: errItems.map((id) => ({
      type: "ITEM-ERROR",
      code: "91001",
      message: "Item price > MRP",
      path: `sessionData.on_search_items[?(@.id=='${id}')].price.value`,
    })),
  },
}, "catalog_rejection.json");
if (!ok) process.exit(1);
log(`done — logs in ${OUT}`);
