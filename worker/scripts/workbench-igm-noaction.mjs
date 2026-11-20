// Workbench Delivery_Flow_With_IGM_No_Action (v-2.0.0) driver (RET10 1.2.5).
// Chain: select→init→confirm(prepaid) → pushes(Accepted/Packed/Agent-assigned/Picked)
//   → track→on_track → pushes(Out-for-delivery/Order-delivered) →
//   issue(OPEN, FLM101) → on_issue(PROCESSING) → on_issue(RESOLUTION_PROPOSED) →
//   issue(RESOLUTION_ACCEPTED) → on_issue(RESOLVED) → issue(CLOSED, rating) →
//   final on_status
// "No Action": the buyer never responds to info — seller goes straight to resolution.
// Usage: node workbench-igm-noaction.mjs <txn> [stage]
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
const ORG = "ondc.agentbuy.online::ONDC:RET10";

const OUT = new URL("../ondc-logs/RET10/workbench_igm_noaction/", import.meta.url).pathname;
const BAP_ID = process.env.WB_BAP_ID || "ondc.agentbuy.online";
const BAP_URI = process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc";
mkdirSync(OUT, { recursive: true });

const txn = process.argv[2];
const stage = process.argv[3] || "init";
if (!txn) { console.error("usage: workbench-igm-noaction.mjs <txn> [stage]"); process.exit(1); }

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

// ---- pre-track pushes → track → post-track pushes ----
const PRE_TRACK = ["Accepted", "Packed", "Agent-assigned", "Order-picked-up"];
const seen = new Set();
log("waiting for pre-track pushes…");
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

const okTrack = await send("track", { context: ctx("track"), message: { order_id: orderId } }, "track.json");
if (okTrack) await waitForCb("on_track", "on_track.json", 15);

log("waiting for post-track pushes (Out-for-delivery → Order-delivered)…");
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

// ============================ IGM ring (no action) ============================
const consumedIssueMsgs = new Set();
function waitOnIssue(expectedLastAction, file, tries = 25) {
  log(`waiting for on_issue (last action = ${expectedLastAction})…`);
  for (let i = 0; i < tries; i++) {
    for (const cb of readAllCbs("on_issue")) {
      const mid = cb.context?.message_id;
      if (consumedIssueMsgs.has(mid)) continue;
      const actions = cb.message?.issue?.actions ?? [];
      const last = actions[actions.length - 1]?.descriptor?.code;
      if (last === expectedLastAction) {
        consumedIssueMsgs.add(mid);
        log(`✓ on_issue captured (last action: ${last})`);
        writeFileSync(OUT + file, JSON.stringify(cb, null, 2) + "\n");
        return cb;
      }
    }
    execSync("sleep 4");
  }
  log(`✗ on_issue (${expectedLastAction}) not seen`);
  return null;
}

const mkAction = (code, shortDesc, by, extra = {}) => ({
  id: uuid(),
  descriptor: { code, short_desc: shortDesc },
  updated_at: now(),
  action_by: by,
  actor_details: { name: "mock-person" },
  ...extra,
});

function followUp(baseIssue, { status, action, respondentIds, resolverIds }) {
  const issue = JSON.parse(JSON.stringify(baseIssue));
  issue.status = status;
  issue.updated_at = now();
  issue.actions = [...(issue.actions ?? []), action];
  issue.last_action_id = action.id;
  if (respondentIds) issue.respondent_ids = respondentIds;
  if (resolverIds) issue.resolver_ids = resolverIds;
  return {
    context: ctx("issue"),
    message: {
      update_target: [{ path: "issue.actions", action: "APPENDED" }],
      issue,
    },
  };
}

// ---- issue OPEN (FLM101) ----
const openAction = mkAction("OPEN", "Complaint created", "NP1");
const issueOpen = {
  context: ctx("issue"),
  message: {
    issue: {
      id: issueId,
      status: "OPEN",
      level: "ISSUE",
      created_at: now(),
      updated_at: now(),
      expected_response_time: { duration: "PT2H" },
      expected_resolution_time: { duration: "P1D" },
      refs: [
        { ref_id: orderId, ref_type: "ORDER" },
        { ref_id: "P1", ref_type: "PROVIDER" },
        { ref_id: fid, ref_type: "FULFILLMENT" },
        {
          ref_id: itemId, ref_type: "ITEM",
          tags: [{
            descriptor: { code: "message.order.items" },
            list: [{ descriptor: { code: "quantity.selected.count" }, value: "1" }],
          }],
        },
      ],
      actors: [
        {
          id: "CUST1", type: "CONSUMER",
          info: { org: { name: ORG }, person: { name: "Nidhi Sharma" }, contact: { phone: "9876543210", email: "buyer@agentbuy.online" } },
        },
        {
          id: "NP1", type: "INTERFACING_NP",
          info: { org: { name: ORG }, contact: { phone: "9876543210", email: "buyer@agentbuy.online" }, person: { name: "Nidhi Sharma" } },
        },
      ],
      source_id: "CUST1",
      complainant_id: "NP1",
      descriptor: {
        code: "FLM101",
        short_desc: "Generated ticket not working at the ticketing gate/validation error",
        long_desc: "Generated ticket not working at the ticketing gate/validation error",
        additional_desc: { url: "https://ondc.agentbuy.online/issue-details", content_type: "text/html" },
        images: [{ url: "https://ondc.agentbuy.online/issue/img1.png", size_type: "xs" }],
        media: [{ url: "https://ondc.agentbuy.online/issue/img1.png" }],
      },
      last_action_id: openAction.id,
      actions: [openAction],
    },
  },
};
if (!(await send("issue", issueOpen, "issue_open.json"))) process.exit(1);

// ---- BPP: PROCESSING → RESOLUTION_PROPOSED (no info request — no action) ----
let cb = await waitOnIssue("PROCESSING", "on_issue_processing.json");
cb = await waitOnIssue("RESOLUTION_PROPOSED", "on_issue_resolution.json") ?? cb;
const proposedIssue = cb?.message?.issue;

// ---- issue RESOLUTION_ACCEPTED ----
const acceptAction = mkAction("RESOLUTION_ACCEPTED", "Resolution is accepted", "NP1",
  { ref_id: "RESOLUTION123", ref_type: "RESOLUTIONS" });
if (!(await send("issue", followUp(proposedIssue, { status: "PROCESSING", action: acceptAction, respondentIds: ["NP2"], resolverIds: ["NP2"] }), "issue_resolution_accept.json"))) process.exit(1);

// ---- BPP: RESOLVED ----
cb = await waitOnIssue("RESOLVED", "on_issue_resolved.json");
const resolvedIssue = cb?.message?.issue ?? proposedIssue;

// ---- issue CLOSED (rating) ----
const closeAction = mkAction("CLOSED", "Closing the complaint", "NP1");
closeAction.tags = [{
  descriptor: { code: "CLOSURE_DETAILS" },
  list: [{ descriptor: { code: "RATING" }, value: "THUMBS_UP" }],
}];
if (!(await send("issue", followUp(resolvedIssue, { status: "CLOSED", action: closeAction, respondentIds: ["NP2"], resolverIds: ["NP2"] }), "issue_close.json"))) process.exit(1);

// ---- final on_status push ----
log("waiting for final on_status push…");
const finalCount = readAllCbs("on_status").length;
let gotFinal = false;
for (let i = 0; i < 25 && !gotFinal; i++) {
  const all = readAllCbs("on_status");
  if (all.length > finalCount) {
    writeFileSync(OUT + "on_status_igm_final.json", JSON.stringify(all[all.length - 1], null, 2) + "\n");
    log("✓ final on_status captured");
    gotFinal = true;
  } else execSync("sleep 4");
}
if (!gotFinal) log("⚠ final on_status not seen");
log(`done — logs in ${OUT}`);
