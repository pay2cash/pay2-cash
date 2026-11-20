// Workbench Buyer_Delivery_Flow driver (ONIX, RET10 1.2.5 GROCERY).
// Continues a transaction whose `select` was already accepted:
//   on_select → init → on_init → confirm → on_confirm → (on_status pushes)
//   → update(Order-picked-up) → update(Order-delivered)
// Payloads mirror the flow's published examples (from config-service
// /mock/playground) with our BAP identity. The workbench applies L0/L1 protocol
// validation on every message and NACKs with readable errors.
//
// Usage: node scripts/workbench-buyer-delivery.mjs <transaction_id> [startStage]
//   startStage: init (default) | confirm | updates | capture-only
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET10/1.2.5/seller";
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
const BPP = { bpp_id: "sample-bpp-id", bpp_uri: "https://bpp.example.com" };
const CITY = "std:011";
const GPS = "19.129076,72.825803";
const AREA_CODE = "400053";

const SCENARIO = "workbench_buyer_delivery";
const OUT = new URL(`../ondc-logs/RET10/${SCENARIO}/`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const txn = process.argv[2];
const startStage = process.argv[3] || "init";
if (!txn) {
  console.error("usage: node workbench-buyer-delivery.mjs <transaction_id> [init|confirm|updates|capture-only]");
  process.exit(1);
}

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const log = (m) => console.log(`  ${m}`);

function ctx(action) {
  return {
    domain: "ONDC:RET10",
    country: "IND",
    city: CITY,
    core_version: "1.2.5",
    action,
    transaction_id: txn,
    message_id: uuid(),
    timestamp: now(),
    bap_id: BAP_ID,
    bap_uri: BAP_URI,
    ...BPP,
    ttl: "PT30S",
  };
}

async function send(action, body, file) {
  const raw = JSON.stringify(body);
  const { header } = createAuthorizationHeader(raw);
  const res = await fetch(`${MOCK}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: header },
    body: raw,
  });
  const text = await res.text();
  let ack = "", err = "";
  try {
    const j = JSON.parse(text);
    ack = j?.message?.ack?.status ?? "";
    err = j?.error?.message ?? "";
  } catch {}
  log(`${action}: HTTP ${res.status} ack=${ack}${err ? " — " + String(err).slice(0, 3000) : ""}`);
  if (file) writeFileSync(OUT + file, JSON.stringify(body, null, 2) + "\n");
  return res.status === 200 && ack === "ACK";
}

// Poll D1 for a single captured callback (worker saves every inbound on_*).
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
      .map((r) => { try { return JSON.parse(r.payload); } catch { return null; } })
      .filter(Boolean);
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

// ---- shared values extracted from callbacks ----
const BILLING = {
  name: "Nidhi Sharma",
  address: {
    name: "221 B Baker Street",
    building: "P2C Building",
    locality: "Baker Street",
    city: "Mumbai",
    state: "Maharashtra",
    country: "IND",
    area_code: AREA_CODE,
  },
  phone: "9876543210",
  email: "buyer@agentbuy.online",
  created_at: now(),
  updated_at: now(),
};
const FUL_END = {
  contact: { email: "buyer@agentbuy.online", phone: "9876543210" },
  person: { name: "Nidhi Sharma" },
  location: {
    gps: GPS,
    address: {
      building: "P2C Building",
      city: "Mumbai",
      state: "Maharashtra",
      country: "IND",
      area_code: AREA_CODE,
      locality: "Baker Street",
      name: "221 B Baker Street",
    },
  },
};

const stageOrder = ["init", "confirm", "updates"];
const startIdx = startStage === "capture-only" ? stageOrder.length : stageOrder.indexOf(startStage);
if (startIdx < 0) { console.error(`unknown stage: ${startStage}`); process.exit(1); }

// ---- stage 0: on_select ----
let onSelect = readAllCbs("on_select")[0];
if (!onSelect) onSelect = await waitFor("on_select", "on_select.json");
if (!onSelect) process.exit(1);
writeFileSync(OUT + "on_select.json", JSON.stringify(onSelect, null, 2) + "\n");

const os = onSelect.message?.order ?? {};
const quote = os.quote; // echo the seller's quote verbatim in confirm (L1: QUOTE_*)
const fid = os.fulfillments?.[0]?.id || "F3";
const quoteTotal = quote?.price?.value || "200.00";
const itemId = os.items?.[0]?.id || "I1";
const orderId = `P2CWB${Date.now()}`;
log(`on_select: fulfillment=${fid} quote=${quoteTotal} item=${itemId} → our orderId=${orderId}`);
writeFileSync(OUT + "_order.json", JSON.stringify({ txn, orderId, fid, quoteTotal, itemId }, null, 2) + "\n");

// ---- stage 1: init ----
if (startIdx <= 0) {
  const ok = await send("init", {
    context: ctx("init"),
    message: {
      order: {
        provider: { id: "P1", locations: [{ id: "L1" }] },
        items: [{ id: itemId, fulfillment_id: fid, quantity: { count: 1 } }],
        billing: BILLING,
        fulfillments: [{ id: fid, type: "Buyer-Delivery", end: { contact: FUL_END.contact, location: FUL_END.location } }],
      },
    },
  }, "init.json");
  if (!ok) process.exit(1);
  const onInit = await waitFor("on_init", "on_init.json", 20);
  if (!onInit) process.exit(1);
}

// ---- stage 2: confirm ----
if (startIdx <= 1) {
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
        fulfillments: [{
          id: fid,
          type: "Buyer-Delivery",
          end: FUL_END,
          tracking: true,
          "@ondc/org/category": "",
          "@ondc/org/TAT": "P2D",
        }],
        tags: [
          {
            code: "bap_terms",
            list: [
              { code: "static_terms", value: "https://ondc.agentbuy.online/terms" },
              { code: "tax_number", value: "29ABCDE1234F1Z5" },
              { code: "accept_bpp_terms", value: "Y" },
            ],
          },
        ],
        payment: {
          params: { amount: quoteTotal, currency: "INR", transaction_id: "mock_payment_id_123" },
          status: "PAID",
          type: "ON-ORDER",
          collected_by: "BAP",
          "@ondc/org/buyer_app_finder_fee_type": "percent",
          "@ondc/org/buyer_app_finder_fee_amount": "3.0",
          "@ondc/org/settlement_basis": "delivery",
          "@ondc/org/settlement_window": "P1D",
          "@ondc/org/withholding_amount": "00.00",
          "@ondc/org/settlement_details": [{
            settlement_counterparty: "seller-app",
            settlement_phase: "sale-amount",
            settlement_type: "neft",
            beneficiary_name: "xxxx",
            settlement_bank_account_no: "xxxx",
            settlement_ifsc_code: "xxxx",
            bank_name: "xxxx",
            branch_name: "xxxx",
          }],
        },
      },
    },
  }, "confirm.json");
  if (!ok) process.exit(1);
  const onConfirm = await waitFor("on_confirm", "on_confirm.json", 20);
  if (!onConfirm) process.exit(1);
}

// ---- stage 3: on_status pushes (Accepted → Packed → Ready-to-ship) ----
log("waiting for on_status pushes (Accepted/Packed/Ready-to-ship)…");
const seenStates = new Set();
for (let i = 0; i < 30; i++) {
  const all = readAllCbs("on_status");
  for (const s of all) {
    const st = s.message?.order?.state || s.message?.order?.fulfillments?.[0]?.state?.descriptor?.code;
    if (st && !seenStates.has(st)) {
      seenStates.add(st);
      log(`✓ on_status: ${st}`);
      writeFileSync(OUT + `on_status_${st.replace(/[^a-z_]/gi, "_").toLowerCase()}.json`, JSON.stringify(s, null, 2) + "\n");
    }
  }
  if (seenStates.size >= 3) break;
  execSync("sleep 4");
}
log(`on_status states seen: ${[...seenStates].join(", ") || "none"}`);

// ---- stage 4: updates (picked up, delivered) ----
if (startIdx <= 2) {
  const mkUpdateTags = (state, ts, withAgentAndDims) => {
    const tags = [
      { code: "update_state", list: [{ code: "state", value: state }] },
      { code: "update_fulfillment_time", list: [{ code: "state", value: state }, { code: "timestamp", value: ts }] },
    ];
    if (withAgentAndDims) {
      tags.push({ code: "update_agent_details", list: [{ code: "name", value: "agent_name" }, { code: "phone", value: "9886098860" }] });
      for (const dim of ["weight", "length", "breadth", "height"]) {
        tags.push({
          code: `bnp_diff_${dim}`,
          list: [{ code: "unit", value: dim === "weight" ? "kilogram" : "centimeter" }, { code: "value", value: "1.5" }],
        });
      }
    }
    return tags;
  };

  const ok1 = await send("update", {
    context: ctx("update"),
    message: {
      update_target: "fulfillment",
      order: { id: orderId, fulfillments: [{ id: fid, tags: mkUpdateTags("Order-picked-up", now(), true) }] },
    },
  }, "update_picked_up.json");
  if (ok1) await waitFor("on_update", "on_update_picked_up.json", 8);

  const ok2 = await send("update", {
    context: ctx("update"),
    message: {
      update_target: "fulfillment",
      order: { id: orderId, fulfillments: [{ id: fid, tags: mkUpdateTags("Order-delivered", now(), false) }] },
    },
  }, "update_delivered.json");
  if (ok2) await waitFor("on_update", "on_update_delivered.json", 8);
}

log(`done — logs in ${OUT}`);
