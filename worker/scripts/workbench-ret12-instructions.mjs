// Workbench Buyer_Instructions_And_Delivery_Update_Flow driver (RET10 1.2.5).
// Chain: on_select → init → on_init → confirm → on_confirm → on_status(Accepted)
//   → update_buyer_instructions → on_update → update_delivery_address → on_update
//   → lifecycle pushes (packed/agent_assigned/picked/out_for_delivery)
//   → on_update_delivery_auth → on_status(Order-delivered)
// Every outbound payload is pre-flighted against the side-effect-free /test
// oracle first — an invalid payload aborts BEFORE it can wedge the transaction.
// Usage: node workbench-buyer-instructions.mjs <txn> [stage]
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET12/1.2.5/seller";
// /test oracle base: strip the domain/version + /seller suffix → .../api-service
const TESTBASE = MOCK.replace(/\/ONDC:RET12.*$/, "");
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
const BPP = { bpp_id: "sample-bpp-id", bpp_uri: "https://bpp.example.com" };
const CITY = "std:011";
const GPS = "19.129076,72.825803";
const AREA_CODE = "400053";

const OUT = new URL("../ondc-logs/RET12/workbench_ret12_instructions/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const txn = process.argv[2];
const stage = process.argv[3] || "init";
if (!txn) { console.error("usage: workbench-buyer-instructions.mjs <txn> [stage]"); process.exit(1); }

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const log = (m) => console.log(`  ${m}`);

const ctx = (action) => ({
  domain: "ONDC:RET12", country: "IND", city: CITY, core_version: "1.2.5",
  action, transaction_id: txn, message_id: uuid(), timestamp: now(),
  bap_id: BAP_ID, bap_uri: BAP_URI, ...BPP, ttl: "PT30S",
});

// fetch with transport-flake retries
async function fetchRetry(url, opts, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url, opts); }
    catch (e) { lastErr = e; log(`transport flake (${e.cause?.code ?? e.message}), retry ${i + 1}/${tries}`); await new Promise((r) => setTimeout(r, 3000)); }
  }
  throw lastErr;
}

// Pre-flight against the standalone validator (no side effects, no session).
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
let onSelect = readAllCbs("on_select")[0];
if (!onSelect) onSelect = await waitFor("on_select", "on_select.json");
if (!onSelect) process.exit(1);
writeFileSync(OUT + "on_select.json", JSON.stringify(onSelect, null, 2) + "\n");

const os = onSelect.message?.order ?? {};
const quote = os.quote;
const fid = os.fulfillments?.[0]?.id || "F3";
const itemId = os.items?.[0]?.id || "I1";
// Resuming a live transaction → reuse the orderId recorded in its confirm.
let orderId;
if (stage === "updates") {
  const saved = JSON.parse(execSync(`cat ${OUT}_order.json`).toString());
  orderId = saved.orderId;
  log(`resuming: orderId=${orderId} (from confirm)`);
} else {
  orderId = `P2CWB${Date.now()}`;
}
log(`on_select: fulfillment=${fid} quote=${quote?.price?.value} item=${itemId} → orderId=${orderId}`);
if (stage !== "updates") writeFileSync(OUT + "_order.json", JSON.stringify({ txn, orderId, fid }, null, 2) + "\n");

// ---- init ----
if (stage === "init") {
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
  const onInit = await waitFor("on_init", "on_init.json");
  if (!onInit) process.exit(1);
}

// ---- confirm ----
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
        fulfillments: [{ id: fid, type: "Buyer-Delivery", end: FUL_END, tracking: true, "@ondc/org/category": "", "@ondc/org/TAT": "P2D" }],
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
  const onConfirm = await waitFor("on_confirm", "on_confirm.json");
  if (!onConfirm) process.exit(1);
}

// ---- on_status: Accepted ----
if (stage !== "updates") {
  log("waiting for on_status (Pending/Accepted)…");
  let accepted = false;
  for (let i = 0; i < 15 && !accepted; i++) {
    for (const s of readAllCbs("on_status")) {
      if (["Accepted", "Pending"].includes(s.message?.order?.state)) {
        accepted = true;
        writeFileSync(OUT + "on_status_accepted.json", JSON.stringify(s, null, 2) + "\n");
        log("✓ on_status: Accepted");
        break;
      }
    }
    if (!accepted) execSync("sleep 4");
  }
  if (!accepted) log("⚠ Accepted push not seen yet — continuing");
}

// ---- update: buyer instructions ----
const okInstr = await send("update", {
  context: ctx("update"),
  message: {
    update_target: "fulfillment",
    order: {
      id: orderId,
      fulfillments: [{
        id: fid,
        end: {
          instructions: {
            long_desc: "Leave package outside the door and do not ring the bell.",
            additional_desc: { content_type: "text/html", url: "https://ondc.agentbuy.online/instructions" },
          },
        },
      }],
    },
  },
}, "update_buyer_instructions.json");
if (okInstr) await waitFor("on_update", "on_update_buyer_instructions.json", 10);

// ---- update: delivery address ----
const okAddr = await send("update", {
  context: ctx("update"),
  message: {
    update_target: "fulfillment",
    order: {
      id: orderId,
      fulfillments: [{
        id: fid,
        end: {
          location: {
            gps: "12.4535,77.9283",
            address: {
              name: "My new House", building: "Bldg 7 new", locality: "MG Road",
              city: "Bengaluru", state: "Karnataka", country: "IND", area_code: "560037",
            },
          },
          person: { name: "Nidhi Sharma" },
          contact: { phone: "9876543210" },
        },
      }],
    },
  },
}, "update_delivery_address.json");
if (okAddr) await waitFor("on_update", "on_update_delivery_address.json", 10);

// ---- lifecycle pushes: packed → agent_assigned → picked → out_for_delivery
//      → delivery_auth (on_update) → delivered ----
const WANT = ["Packed", "Agent-assigned", "Order-picked-up", "Out-for-delivery", "Order-delivered"];
const seen = new Set();
let authSeen = false;
log("waiting for lifecycle pushes…");
for (let i = 0; i < 60; i++) {
  for (const s of readAllCbs("on_status")) {
    const st = s.message?.order?.fulfillments?.[0]?.state?.descriptor?.code;
    if (st && WANT.includes(st) && !seen.has(st)) {
      seen.add(st);
      writeFileSync(OUT + `on_status_${st.replace(/[^a-z_]/gi, "_").toLowerCase()}.json`, JSON.stringify(s, null, 2) + "\n");
      log(`✓ on_status: ${st}`);
    }
  }
  if (!authSeen) {
    const auths = readAllCbs("on_update");
    if (auths.length > 2 || auths.some((a) => JSON.stringify(a).includes("delivery_auth") || JSON.stringify(a).includes("otp"))) {
      authSeen = true;
      writeFileSync(OUT + "on_update_delivery_auth.json", JSON.stringify(auths[auths.length - 1], null, 2) + "\n");
      log("✓ on_update (delivery auth) captured");
    }
  }
  if (seen.has("Order-delivered") && authSeen) break;
  execSync("sleep 4");
}
log(`lifecycle states seen: ${[...seen].join(", ") || "none"}; delivery_auth=${authSeen}`);
log(`done — logs in ${OUT}`);
