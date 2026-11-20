// Workbench Out_Of_Stock_Flow driver (RET10 1.2.5 GROCERY).
// Chain: select(I1+I2) → on_select(DOMAIN-ERROR 40002) → select(I1+I2) →
//   on_select(quote) → init → on_init → confirm → on_confirm → pushes →
//   track → on_track → final pushes
// Usage: node workbench-oos.mjs <txn> [stage]
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET10/1.2.5/seller";
const TESTBASE = MOCK.replace(/\/ONDC:RET10.*$/, "");
const CITY = "std:011";
const AREA_CODE = "400053";
const GPS = "19.129076,72.825803";

const OUT = new URL("../ondc-logs/RET10/workbench_oos/", import.meta.url).pathname;
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
mkdirSync(OUT, { recursive: true });

const txn = process.argv[2];
const stage = process.argv[3] || "init";
if (!txn) { console.error("usage: workbench-oos.mjs <txn> [stage]"); process.exit(1); }

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const log = (m) => console.log(`  ${m}`);

const ctx = (action) => ({
  domain: "ONDC:RET10", country: "IND", city: CITY, core_version: "1.2.5",
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

async function waitForCount(action, n, file, label, tries = 20) {
  log(`waiting for ${label ?? action}…`);
  for (let i = 0; i < tries; i++) {
    const all = readAllCbs(action);
    if (all.length >= n) {
      log(`✓ ${label ?? action} captured`);
      writeFileSync(OUT + file, JSON.stringify(all[n - 1], null, 2) + "\n");
      return all[n - 1];
    }
    execSync("sleep 3");
  }
  log(`✗ ${label ?? action} not captured`);
  return null;
}

const BILLING = {
  name: "Nidhi Sharma",
  address: {
    name: "221 B Baker Street", building: "P2C Building", locality: "Baker Street",
    city: "Mumbai", state: "Maharashtra", country: "IND", area_code: AREA_CODE,
  },
  phone: "9876543210", email: "buyer@agentbuy.online", created_at: now(), updated_at: now(),
};
const FUL_END = {
  contact: { email: "buyer@agentbuy.online", phone: "9876543210" },
  person: { name: "Nidhi Sharma" },
  location: {
    gps: GPS,
    address: {
      building: "P2C Building", city: "Mumbai", state: "Maharashtra", country: "IND",
      area_code: AREA_CODE, locality: "Baker Street", name: "221 B Baker Street",
    },
  },
};

const mkSelectBody = () => ({
  context: ctx("select"),
  message: {
    order: {
      provider: { id: "P1", locations: [{ id: "L1" }] },
      items: [
        { id: "I1", quantity: { count: 1 }, location_id: "L1" },
        { id: "I2", quantity: { count: 1 }, location_id: "L1" },
      ],
      fulfillments: [
        { end: { location: { gps: GPS, address: { area_code: AREA_CODE } } } },
      ],
    },
  },
});

let orderId;
if (stage === "resume") {
  const saved = JSON.parse(execSync(`cat ${OUT}_order.json`).toString());
  orderId = saved.orderId;
  log(`resuming: orderId=${orderId}`);
} else {
  orderId = `P2CWB${Date.now()}`;
}
if (stage !== "resume") writeFileSync(OUT + "_order.json", JSON.stringify({ txn, orderId }, null, 2) + "\n");

// ---- select #1 → out-of-stock error on_select ----
const cb1 = readAllCbs("on_select")[0];
if (!cb1) {
  const ok = await send("select", mkSelectBody(), "select0.json");
  if (!ok) process.exit(1);
  await waitForCount("on_select", 1, "on_select_out_of_stock.json", "on_select (out-of-stock)");
} else {
  writeFileSync(OUT + "on_select_out_of_stock.json", JSON.stringify(cb1, null, 2) + "\n");
  log("✓ on_select (out-of-stock) already captured");
}
const oos = readAllCbs("on_select")[0];
log(`out-of-stock response error: ${JSON.stringify(oos?.error?.message ?? oos?.error ?? "none").slice(0, 120)}`);

// ---- select #2 → proper quote on_select ----
const existing = readAllCbs("on_select");
let quoted;
if (existing.length >= 2) {
  quoted = existing[1];
  writeFileSync(OUT + "on_select.json", JSON.stringify(quoted, null, 2) + "\n");
  log("✓ on_select (quote) already captured");
} else {
  const ok = await send("select", mkSelectBody(), "select.json");
  if (!ok) process.exit(1);
  quoted = await waitForCount("on_select", 2, "on_select.json", "on_select (quote)");
  if (!quoted) process.exit(1);
}

const os = quoted.message?.order ?? {};
const quote = os.quote;
const fid = os.fulfillments?.[0]?.id || "F1";
const items = (os.items ?? []).map((i) => ({
  id: i.id, fulfillment_id: i.fulfillment_id || fid, quantity: i.quantity ?? { count: 1 },
  location_id: i.location_id || "L1",
}));
log(`quote: total=${quote?.price?.value} items=${items.map((i) => i.id).join(",")} fulfillment=${fid} → orderId=${orderId}`);

// ---- init ----
if (stage === "init") {
  const ok = await send("init", {
    context: ctx("init"),
    message: {
      order: {
        provider: { id: "P1", locations: [{ id: "L1" }] },
        items,
        billing: BILLING,
        fulfillments: [{ id: fid, type: "Delivery", end: { contact: FUL_END.contact, location: FUL_END.location } }],
      },
    },
  }, "init.json");
  if (!ok) process.exit(1);
  if (!(await waitForCount("on_init", 1, "on_init.json"))) process.exit(1);
}

// ---- confirm (prepaid) ----
if (stage === "init" || stage === "confirm") {
  const ok = await send("confirm", {
    context: ctx("confirm"),
    message: {
      order: {
        id: orderId,
        state: "Created",
        created_at: now(),
        updated_at: now(),
        billing: { ...BILLING, created_at: now(), updated_at: now() },
        items,
        provider: { id: "P1", locations: [{ id: "L1" }] },
        quote,
        fulfillments: [{ id: fid, type: "Delivery", end: FUL_END, tracking: true, "@ondc/org/category": "Standard Delivery", "@ondc/org/TAT": "P2D" }],
        tags: [{
          code: "bap_terms",
          list: [
            { code: "static_terms", value: "https://ondc.agentbuy.online/terms" },
            { code: "tax_number", value: "29ABCDE1234F1Z5" },
            { code: "accept_bpp_terms", value: "Y" },
          ],
        }],
        payment: {
          params: { amount: quote?.price?.value || "200.00", currency: "INR", transaction_id: "mock_payment_id_123" },
          status: "PAID", type: "ON-ORDER", collected_by: "BAP",
          "@ondc/org/buyer_app_finder_fee_type": "percent",
          "@ondc/org/buyer_app_finder_fee_amount": "3.0",
          "@ondc/org/settlement_basis": "delivery",
          "@ondc/org/settlement_window": "P1D",
          "@ondc/org/withholding_amount": "00.00",
          "@ondc/org/settlement_details": [{
            settlement_counterparty: "seller-app", settlement_phase: "sale-amount", settlement_type: "neft",
            beneficiary_name: "xxxx", settlement_bank_account_no: "xxxx", settlement_ifsc_code: "xxxx",
            bank_name: "xxxx", branch_name: "xxxx",
          }],
        },
      },
    },
  }, "confirm.json");
  if (!ok) process.exit(1);
  if (!(await waitForCount("on_confirm", 1, "on_confirm.json"))) process.exit(1);
}

// ---- pre-track pushes → track → final pushes ----
const PRE = ["Accepted", "Packed", "Agent-assigned", "Order-picked-up"];
const seen = new Set();
log("waiting for pre-track pushes…");
for (let i = 0; i < 50; i++) {
  for (const s of readAllCbs("on_status")) {
    const st = s.message?.order?.fulfillments?.[0]?.state?.descriptor?.code;
    const ost = s.message?.order?.state;
    for (const want of PRE) {
      if ((st === want || (want === "Accepted" && ost === "Accepted")) && !seen.has(want)) {
        seen.add(want);
        writeFileSync(OUT + `on_status_${want.replace(/[^a-z_]/gi, "_").toLowerCase()}.json`, JSON.stringify(s, null, 2) + "\n");
        log(`✓ on_status: ${want}`);
      }
    }
  }
  if (seen.has("Order-picked-up")) break;
  execSync("sleep 4");
}

const okTrack = await send("track", { context: ctx("track"), message: { order_id: orderId } }, "track.json");
if (okTrack) await waitForCount("on_track", 1, "on_track.json", undefined, 15);

log("waiting for final pushes (Out-for-delivery → Order-delivered)…");
for (let i = 0; i < 50; i++) {
  for (const s of readAllCbs("on_status")) {
    const st = s.message?.order?.fulfillments?.[0]?.state?.descriptor?.code;
    for (const want of ["Out-for-delivery", "Order-delivered"]) {
      if (st === want && !seen.has(want)) {
        seen.add(want);
        writeFileSync(OUT + `on_status_${want.replace(/[^a-z_]/gi, "_").toLowerCase()}.json`, JSON.stringify(s, null, 2) + "\n");
        log(`✓ on_status: ${want}`);
      }
    }
  }
  if (seen.has("Order-delivered")) break;
  execSync("sleep 4");
}
log(`done — logs in ${OUT}`);
