// Workbench RET12 Cancel_Return_Request_Flow driver (FASHION 1.2.5).
// Chain: select→init→confirm(prepaid) → 5 lifecycle pushes (Pending…Order-delivered)
//   → update(return_request R1, reverse QC) → on_update(interim QC) →
//   on_update(return approved) → cancel(return request R1) → on_cancel
// NOTE: the RET12 mock pushes lifecycle states slowly (minutes) — the lifecycle
// wait is long, and the return request is only sent AFTER Order-delivered.
// Usage: node workbench-ret12-cancel-return.mjs <txn> [stage]
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET12/1.2.5/seller";
const TESTBASE = MOCK.replace(/\/ONDC:RET12.*$/, "");
const CITY = "std:011";
const AREA_CODE = "400053";
const GPS = "19.129076,72.825803";
const RETURN_ID = "R1";

const OUT = new URL("../ondc-logs/RET12/workbench_ret12_cancel_return/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const txn = process.argv[2];
const stage = process.argv[3] || "init";
if (!txn) { console.error("usage: workbench-ret12-cancel-return.mjs <txn> [stage]"); process.exit(1); }

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const log = (m) => console.log(`  ${m}`);

const ctx = (action) => ({
  domain: "ONDC:RET12", country: "IND", city: CITY, core_version: "1.2.5",
  action, transaction_id: txn, message_id: uuid(), timestamp: now(),
  bap_id: process.env.WB_BAP_ID || "ondc.agentbuy.online",
  bap_uri: process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc",
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
  const res = await fetchRetry(`${TESTBASE}/ONDC:RET12/1.2.5/test/${action}`, {
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

async function waitForCb(action, file, tries) {
  log(`waiting for ${action}…`);
  for (let i = 0; i < (tries ?? 20); i++) {
    const all = readAllCbs(action);
    if (all.length) {
      log(`✓ ${action} captured`);
      writeFileSync(OUT + file, JSON.stringify(all[all.length - 1], null, 2) + "\n");
      return all[all.length - 1];
    }
    execSync("sleep 3");
  }
  log(`✗ ${action} not captured`);
  return null;
}

const BILLING_TS = now();
const BILLING = {
  name: "Nidhi Sharma",
  address: {
    name: "221 B Baker Street", building: "P2C Building", locality: "Baker Street",
    city: "Mumbai", state: "Maharashtra", country: "IND", area_code: AREA_CODE,
  },
  phone: "9876543210", email: "buyer@agentbuy.online",
  created_at: BILLING_TS, updated_at: BILLING_TS,
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
const onSelect = readAllCbs("on_select")[0] ?? (await waitForCb("on_select", "on_select.json"));
if (!onSelect) process.exit(1);
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

// ---- init ----
if (stage === "init") {
  const ok = await send("init", {
    context: ctx("init"),
    message: {
      order: {
        provider: { id: "P1", locations: [{ id: "L1" }] },
        items: [{ id: itemId, fulfillment_id: fid, quantity: { count: 1 } }],
        billing: BILLING,
        fulfillments: [{ id: fid, type: "Delivery", end: { contact: FUL_END.contact, location: FUL_END.location } }],
      },
    },
  }, "init.json");
  if (!ok) process.exit(1);
  if (!(await waitForCb("on_init", "on_init.json"))) process.exit(1);
}

// ---- confirm (prepaid) ----
if (stage === "init" || stage === "confirm") {
  const ok = await send("confirm", {
    context: ctx("confirm"),
    message: {
      order: {
        id: orderId,
        state: "Created",
        created_at: BILLING_TS,
        updated_at: BILLING_TS,
        billing: BILLING,
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
          params: { amount: quote?.price?.value || "696.75", currency: "INR", transaction_id: "mock_payment_id_123" },
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
  if (!(await waitForCb("on_confirm", "on_confirm.json"))) process.exit(1);
}

// ---- lifecycle to Order-delivered (patient: RET12 mock pushes slowly) ----
const seen = new Set();
log("waiting for lifecycle pushes (up to ~12 min)…");
for (let i = 0; i < 90; i++) {
  for (const s of readAllCbs("on_status")) {
    const st = s.message?.order?.fulfillments?.[0]?.state?.descriptor?.code;
    const ost = s.message?.order?.state;
    const wants = [["Accepted", "Pending"], ["Packed"], ["Order-picked-up"], ["Out-for-delivery"], ["Order-delivered"]];
    for (const alts of wants) {
      for (const want of alts) {
        if ((st === want || ost === want) && !seen.has(alts[0])) {
          seen.add(alts[0]);
          writeFileSync(OUT + `on_status_${alts[0].replace(/[^a-z_]/gi, "_").toLowerCase()}.json`, JSON.stringify(s, null, 2) + "\n");
          log(`✓ on_status: ${want}`);
        }
      }
    }
  }
  if (seen.has("Order-delivered")) break;
  execSync("sleep 6");
}
log(`lifecycle seen: ${[...seen].join(", ") || "none"}`);
if (!seen.has("Order-delivered")) log("⚠ Order-delivered not seen — sending return request anyway");

// ---- update: return request (reverse QC) ----
const okRet = await send("update", {
  context: ctx("update"),
  message: {
    update_target: "item",
    order: {
      id: orderId,
      fulfillments: [{
        type: "Return",
        tags: [{
          code: "return_request",
          list: [
            { code: "id", value: RETURN_ID },
            { code: "item_id", value: itemId },
            { code: "item_quantity", value: "1" },
            { code: "reason_id", value: "001" },
            { code: "reason_desc", value: "Item received in damaged condition, requesting return" },
            { code: "images", value: "https://ondc.agentbuy.online/issue/img1.png" },
            { code: "ttl_approval", value: "PT24H" },
            { code: "ttl_reverseqc", value: "P3D" },
          ],
        }],
      }],
    },
  },
}, "update_return_request.json");
if (!okRet) process.exit(1);

// ---- on_update pushes: interim reverse QC → return approved ----
log("waiting for on_update pushes (QC → approved)…");
let upd = 0;
const updNames = ["on_update_interim_reverse_qc", "on_update_return_approved"];
for (let i = 0; i < 75 && upd < 2; i++) {
  const all = readAllCbs("on_update");
  for (let j = upd; j < Math.min(all.length, 2); j++) {
    writeFileSync(OUT + `${updNames[j]}.json`, JSON.stringify(all[j], null, 2) + "\n");
    log(`✓ on_update push ${j + 1} captured`);
    upd = j + 1;
  }
  if (upd < 2) execSync("sleep 6");
}
log(`on_update pushes: ${upd}/2`);

// ---- cancel the return request ----
const okCancel = await send("cancel", {
  context: ctx("cancel"),
  message: {
    order_id: orderId,
    cancellation_reason_id: "001",
    descriptor: { name: "fulfillment", short_desc: RETURN_ID },
  },
}, "cancel_return_request.json");
if (!okCancel) process.exit(1);

// ---- on_cancel ----
const onCancel = await waitForCb("on_cancel", "on_cancel_return_request.json", 25);
if (onCancel) log(`on_cancel: order.state=${onCancel.message?.order?.state}`);
log(`done — logs in ${OUT}`);
