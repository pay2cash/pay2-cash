// Workbench Cash_On_Delivery_Flow driver (RET10 1.2.5 GROCERY).
// Chain: on_select → init → on_init → confirm(NOT-PAID, ON-FULFILLMENT) → on_confirm
//   → pushes (Accepted/Packed/Agent-assigned/Picked) → track → on_track
//   → pushes (Out-for-delivery/Order-delivered)
// Pre-flight + retry hardened. Usage: node workbench-cod.mjs <txn> [stage]
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET10/1.2.5/seller";
const TESTBASE = MOCK.replace(/\/ONDC:RET10.*$/, "");
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
const BPP = { bpp_id: "sample-bpp-id", bpp_uri: "https://bpp.example.com" };
const CITY = "std:011";
const AREA_CODE = "400053";
const GPS = "19.129076,72.825803";

const OUT = new URL("../ondc-logs/RET10/workbench_cod/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const txn = process.argv[2];
const stage = process.argv[3] || "init";
if (!txn) { console.error("usage: workbench-cod.mjs <txn> [stage]"); process.exit(1); }

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const log = (m) => console.log(`  ${m}`);

const ctx = (action) => ({
  domain: "ONDC:RET10", country: "IND", city: CITY, core_version: "1.2.5",
  action, transaction_id: txn, message_id: uuid(), timestamp: now(),
  bap_id: BAP_ID, bap_uri: BAP_URI, ...BPP, ttl: "PT30S",
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

async function waitFor(action, file, tries) {
  log(`waiting for ${action}…`);
  const cb = readCb(action, tries ?? 20);
  if (!cb) { log(`✗ ${action} not captured`); return null; }
  log(`✓ ${action} captured`);
  writeFileSync(OUT + file, JSON.stringify(cb, null, 2) + "\n");
  return cb;
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

// ---- on_select ----
let onSelect = readAllCbs("on_select")[0];
if (!onSelect) onSelect = await waitFor("on_select", "on_select.json");
if (!onSelect) process.exit(1);
writeFileSync(OUT + "on_select.json", JSON.stringify(onSelect, null, 2) + "\n");

const os = onSelect.message?.order ?? {};
const quote = os.quote;
const fid = os.fulfillments?.[0]?.id || "F1";
const itemId = os.items?.[0]?.id || "I1";
let orderId;
if (stage === "resume") {
  const saved = JSON.parse(execSync(`cat ${OUT}_order.json`).toString());
  orderId = saved.orderId;
  log(`resuming: orderId=${orderId}`);
} else {
  orderId = `P2CWB${Date.now()}`;
}
log(`on_select: fulfillment=${fid} quote=${quote?.price?.value} item=${itemId} → orderId=${orderId}`);
if (stage !== "resume") writeFileSync(OUT + "_order.json", JSON.stringify({ txn, orderId, fid }, null, 2) + "\n");

// ---- init (COD: payment.type ON-FULFILLMENT) ----
if (stage === "init") {
  const ok = await send("init", {
    context: ctx("init"),
    message: {
      order: {
        provider: { id: "P1", locations: [{ id: "L1" }] },
        items: [{ id: itemId, fulfillment_id: fid, quantity: { count: 1 } }],
        billing: BILLING,
        fulfillments: [{ id: fid, type: "Delivery", end: { contact: FUL_END.contact, location: FUL_END.location } }],
        payment: { type: "ON-FULFILLMENT" },
      },
    },
  }, "init.json");
  if (!ok) process.exit(1);
  const onInit = await waitFor("on_init", "on_init.json");
  if (!onInit) process.exit(1);
}

// ---- confirm (COD: NOT-PAID, collected_by BPP) ----
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
        items: [{ id: itemId, fulfillment_id: fid, quantity: { count: 1 } }],
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
          type: "ON-FULFILLMENT",
          status: "NOT-PAID",
          collected_by: "BPP",
          "@ondc/org/buyer_app_finder_fee_type": "percent",
          "@ondc/org/buyer_app_finder_fee_amount": "3",
          "@ondc/org/settlement_basis": "delivery",
          "@ondc/org/settlement_window": "P1D",
          "@ondc/org/withholding_amount": "10.00",
          params: { currency: "INR", amount: quote?.price?.value || "200.00", transaction_id: "mock_payment_id_123" },
          "@ondc/org/settlement_details": [{
            settlement_counterparty: "buyer-app", settlement_phase: "sale-amount", settlement_type: "upi",
            beneficiary_name: "pay2 Cash", upi_address: "pay2cash@upi",
            settlement_bank_account_no: "12345588548", settlement_ifsc_code: "ABCD0001234",
            bank_name: "ABC", branch_name: "XYZ",
          }],
        },
      },
    },
  }, "confirm.json");
  if (!ok) process.exit(1);
  const onConfirm = await waitFor("on_confirm", "on_confirm.json");
  if (!onConfirm) process.exit(1);
}

// ---- pushes: Accepted → Packed → Agent-assigned → Picked, then track ----
const PRE_TRACK = ["Accepted", "Packed", "Agent-assigned", "Order-picked-up"];
const seen = new Set();
log("waiting for pre-track lifecycle pushes…");
for (let i = 0; i < 50; i++) {
  for (const s of readAllCbs("on_status")) {
    const st = s.message?.order?.fulfillments?.[0]?.state?.descriptor?.code;
    const ost = s.message?.order?.state;
    for (const want of PRE_TRACK) {
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
log(`pre-track states seen: ${[...seen].join(", ") || "none"}`);

// ---- track → on_track ----
const okTrack = await send("track", {
  context: ctx("track"),
  message: { order_id: orderId },
}, "track.json");
if (okTrack) await waitFor("on_track", "on_track.json", 15);

// ---- final pushes: Out-for-delivery → Order-delivered ----
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
