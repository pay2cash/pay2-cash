// Workbench Delivery_Flow_With_IGM (v-1.0.0) driver (RET10 1.2.5 GROCERY).
// Chain: select→init→confirm(prepaid) → 6 lifecycle pushes (Accepted…delivered)
//   → issue(OPEN) → on_issue(PROCESSING) → on_issue_status(RESOLVED)
//   → issue(CLOSED, rating THUMBS_UP)
// Pre-flight + retry hardened. Usage: node workbench-igm1.mjs <txn> [stage]
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

const OUT = new URL("../ondc-logs/RET12/workbench_ret12_igm1/", import.meta.url).pathname;
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
mkdirSync(OUT, { recursive: true });

const txn = process.argv[2];
const stage = process.argv[3] || "init";
if (!txn) { console.error("usage: workbench-igm1.mjs <txn> [stage]"); process.exit(1); }

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const log = (m) => console.log(`  ${m}`);

const ctx = (action) => ({
  domain: "ONDC:RET12", country: "IND", city: CITY, core_version: "1.2.5",
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
const issueId = uuid();
log(`on_select: fulfillment=${fid} quote=${quote?.price?.value} item=${itemId} → orderId=${orderId}, issueId=${issueId}`);
if (stage !== "resume") writeFileSync(OUT + "_order.json", JSON.stringify({ txn, orderId, fid, issueId }, null, 2) + "\n");

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
  const onInit = await waitFor("on_init", "on_init.json");
  if (!onInit) process.exit(1);
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

// ---- full lifecycle: Accepted → … → Order-delivered ----
const LIFECYCLE = [["Accepted", "Pending"], ["Packed"], ["Agent-assigned"], ["Order-picked-up"], ["Out-for-delivery"], ["Order-delivered"]];
const seen = new Set();
log("waiting for full lifecycle pushes…");
for (let i = 0; i < 90; i++) {
  for (const s of readAllCbs("on_status")) {
    const st = s.message?.order?.fulfillments?.[0]?.state?.descriptor?.code;
    const ost = s.message?.order?.state;
    for (const alts of LIFECYCLE) {
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

// ---- issue: OPEN ----
const openAction = {
  complainant_action: "OPEN", short_desc: "Complaint created", updated_at: now(),
  updated_by: {
    org: { name: "ondc.agentbuy.online::ONDC:RET12" },
    contact: { phone: "+91-9876543210", email: "buyer@agentbuy.online" },
    person: { name: "Nidhi Sharma" },
  },
};
const okOpen = await send("issue", {
  context: ctx("issue"),
  message: {
    issue: {
      id: issueId,
      category: "ITEM",
      sub_category: "ITM04",
      complainant_info: {
        person: { name: "Nidhi Sharma" },
        contact: { phone: "+91-9876543210", email: "buyer@agentbuy.online" },
      },
      order_details: {
        id: orderId,
        state: "COMPLETED",
        items: [{ id: itemId, quantity: 1 }],
        fulfillments: [{ id: fid, state: "CLAIMED" }],
        provider_id: "P1",
      },
      description: {
        short_desc: "Item delivered in damaged condition",
        long_desc: "The delivered atta package was torn and the contents were spoiled",
        additional_desc: { url: "https://ondc.agentbuy.online/issue/desc.txt", content_type: "text/plain" },
        images: ["https://ondc.agentbuy.online/issue/img1.png"],
      },
      source: { network_participant_id: BAP_ID, type: "CONSUMER" },
      expected_response_time: { duration: "PT2H" },
      expected_resolution_time: { duration: "P1D" },
      status: "OPEN",
      issue_type: "ISSUE",
      issue_actions: { complainant_actions: [openAction] },
      created_at: now(),
      updated_at: now(),
    },
  },
}, "issue_open.json");
if (!okOpen) process.exit(1);

// ---- on_issue (PROCESSING) ----
const onIssue = await waitFor("on_issue", "on_issue.json", 20);
if (onIssue) log(`on_issue: status=${onIssue.message?.issue?.issue_status?.complainant_status ?? onIssue.message?.issue?.status ?? "?"}`);

// ---- on_issue_status (RESOLVED) ----
log("waiting for on_issue_status (resolution)…");
let resolved = null;
for (let i = 0; i < 25; i++) {
  for (const s of readAllCbs("on_issue_status")) {
    resolved = s;
    writeFileSync(OUT + "on_issue_resolved.json", JSON.stringify(s, null, 2) + "\n");
    break;
  }
  if (resolved) break;
  execSync("sleep 4");
}
if (resolved) log("✓ on_issue_status captured");
else log("⚠ on_issue_status not seen — continuing to close");

// ---- issue: CLOSED ----
const closeAction = {
  complainant_action: "CLOSE", short_desc: "Complaint closed", updated_at: now(),
  updated_by: {
    org: { name: "ondc.agentbuy.online::ONDC:RET12" },
    contact: { phone: "+91-9876543210", email: "buyer@agentbuy.online" },
    person: { name: "Nidhi Sharma" },
  },
};
const okClose = await send("issue", {
  context: ctx("issue"),
  message: {
    issue: {
      id: issueId,
      status: "CLOSED",
      created_at: now(),
      updated_at: now(),
      rating: "THUMBS_UP",
      issue_actions: { complainant_actions: [openAction, closeAction] },
    },
  },
}, "issue_close.json");
if (!okClose) process.exit(1);
log(`done — logs in ${OUT}`);
