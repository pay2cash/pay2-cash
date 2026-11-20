// Workbench Replacement_Flow driver (RET10 1.2.5 GROCERY).
// Chain: select→init→confirm(prepaid) → 6 lifecycle pushes →
//   update(return_request + reverse QC) → 4× on_update pushes (QC/approved/
//   picked/delivered) → 4× replacement on_status pushes (packed→delivered)
// Usage: node workbench-replacement.mjs <txn> [stage]
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

const OUT = new URL("../ondc-logs/RET10/workbench_replacement/", import.meta.url).pathname;
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
mkdirSync(OUT, { recursive: true });

const txn = process.argv[2];
const stage = process.argv[3] || "init";
if (!txn) { console.error("usage: workbench-replacement.mjs <txn> [stage]"); process.exit(1); }

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
const returnId = uuid();
log(`on_select: fulfillment=${fid} quote=${quote?.price?.value} item=${itemId} → orderId=${orderId}`);
if (stage !== "resume") writeFileSync(OUT + "_order.json", JSON.stringify({ txn, orderId, fid, returnId }, null, 2) + "\n");

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
  if (!(await waitForCb("on_confirm", "on_confirm.json"))) process.exit(1);
}

// ---- original order lifecycle ----
// NOTE: in this flow the mock pushes lifecycle states as on_update actions
// (observed live), so don't block on on_status — capture opportunistically and
// proceed to the update request as soon as the console expects it (after on_confirm).
if (stage !== "update") {
  const LIFECYCLE = ["Accepted", "Packed", "Agent-assigned", "Order-picked-up", "Out-for-delivery", "Order-delivered"];
  const seen = new Set();
  log("scanning for original order lifecycle (non-blocking)…");
  for (let i = 0; i < 5; i++) {
    for (const s of [...readAllCbs("on_status"), ...readAllCbs("on_update")]) {
      for (const f of s.message?.order?.fulfillments ?? []) {
        const st = f.state?.descriptor?.code ?? f.tags?.[0]?.list?.find((t) => t.code === "state")?.value;
        const ost = s.message?.order?.state;
        for (const want of LIFECYCLE) {
          if ((st === want || (want === "Accepted" && ost === "Accepted")) && !seen.has(want)) {
            seen.add(want);
            log(`✓ lifecycle state seen: ${want}`);
          }
        }
      }
    }
    execSync("sleep 4");
  }
  log(`lifecycle states seen: ${[...seen].join(", ") || "none — continuing"}`);
}

// ---- update: return/replacement request with reverse QC ----
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
            { code: "id", value: returnId },
            { code: "item_id", value: itemId },
            { code: "parent_item_id", value: "1" },
            { code: "item_quantity", value: "1" },
            { code: "reason_id", value: "001" },
            { code: "reason_desc", value: "Item received in damaged condition, requesting replacement" },
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

// ---- capture the return/QC + replacement chain (arrives as on_update) ----
const baselineUpdates = readAllCbs("on_update").length;
log(`waiting for return chain on_update pushes (baseline: ${baselineUpdates})…`);
const updNames = ["on_update_interim_reverse_qc", "on_update_return_approved", "on_update_return_picked", "on_update_return_delivered"];
let updCount = 0;
for (let i = 0; i < 75 && updCount < 4; i++) {
  const all = readAllCbs("on_update");
  for (let j = updCount; j < Math.min(all.length - 0, 4); j++) {
    const cb = all[all.length - Math.min(all.length, 4) + j];
    if (!cb) continue;
    const ful = (cb.message?.order?.fulfillments ?? []).map((f) => `${f.type}:${f.state?.descriptor?.code ?? "?"}`).join(", ");
    writeFileSync(OUT + `${updNames[j]}.json`, JSON.stringify(cb, null, 2) + "\n");
    log(`✓ on_update push captured (${ful})`);
    updCount = j + 1;
  }
  if (updCount < 4) execSync("sleep 4");
}
log(`return chain: ${updCount}/4 pushes captured`);

// ---- replacement order lifecycle (may arrive as on_update or on_status) ----
const REPL = ["Packed", "Order-picked-up", "Out-for-delivery", "Order-delivered"];
const replSeen = new Set();
log("waiting for replacement order lifecycle…");
for (let i = 0; i < 75 && replSeen.size < REPL.length; i++) {
  const all = [...readAllCbs("on_status"), ...readAllCbs("on_update")];
  for (const s of all) {
    for (const f of s.message?.order?.fulfillments ?? []) {
      const st = f.state?.descriptor?.code;
      for (const want of REPL) {
        if (st === want && !replSeen.has(want)) {
          replSeen.add(want);
          writeFileSync(OUT + `on_status_rep_${want.replace(/[^a-z_]/gi, "_").toLowerCase()}.json`, JSON.stringify(s, null, 2) + "\n");
          log(`✓ replacement lifecycle: ${want}`);
        }
      }
    }
  }
  execSync("sleep 4");
}
log(`replacement states: ${[...replSeen].join(", ") || "none"} (${replSeen.size}/4)`);
log(`done — logs in ${OUT}`);
