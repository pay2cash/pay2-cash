// ONDC RET10 v1.2.5 mandatory-flow driver (pay2 Cash BAP) against the Pramaan mock.
// Runs a full chained transaction: search → select → init → confirm → status.
// We send signed Beckn actions; Pramaan posts on_* to our subscriber (ondc.pay2.cash)
// which captures them in D1 (ondc_logs); this script reads them back via `wrangler d1`.
//
//   node worker/scripts/ondc-flow.mjs full      # whole chain, one transaction
//   node worker/scripts/ondc-flow.mjs search    # just the search leg
//
// Each leg writes request + captured response into worker/ondc-logs/RET10/<scenario>/
// for submission to ONDC-Official/retail-v1.2.5-logs.
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK = process.env.PRAMAAN_MOCK || "https://pramaan.ondc.org/beta/preprod/mock/seller";
const BAP_ID = "ondc.pay2.cash";
const BAP_URI = "https://ondc.pay2.cash/ondc";
const DOMAIN = "ONDC:RET10";
const CITY = process.env.ONDC_CITY || "std:0124";
const CORE_VERSION = "1.2.5";
const GPS = "28.4554726,77.0219019";
const AREA_CODE = "122007";

const BUYER = {
  name: "Nidhi Sharma",
  building: "221 B",
  locality: "Baker Street",
  city: "Gurgaon",
  state: "Haryana",
  country: "IND", // ISO 3166-1 alpha-3, per ONDC address schema (NOT "India")
  area_code: AREA_CODE,
  email: "buyer@pay2.cash",
  phone: "9876543210",
};

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function ctx(action, transaction_id, bpp) {
  return {
    domain: DOMAIN,
    country: "IND",
    city: CITY,
    core_version: CORE_VERSION,
    action,
    transaction_id,
    message_id: uuid(),
    timestamp: now(),
    bap_id: BAP_ID,
    bap_uri: BAP_URI,
    ...(bpp ? { bpp_id: bpp.bpp_id, bpp_uri: bpp.bpp_uri } : {}),
    ttl: "PT30S",
  };
}

async function send(action, body) {
  const raw = JSON.stringify(body);
  const { header } = createAuthorizationHeader(raw);
  const res = await fetch(`${MOCK}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: header },
    body: raw,
  });
  let json;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = text; }
  const ok = res.status === 200 && json?.message?.ack?.status === "ACK";
  return { ok, status: res.status, json };
}

function readCallback(action, transaction_id, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      const out = execSync(
        `npx wrangler d1 execute pay2cash --remote --json --command "SELECT payload FROM ondc_logs WHERE action='${action}' AND transaction_id='${transaction_id}' ORDER BY created_at DESC LIMIT 1;"`,
        { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"] },
      ).toString();
      const rows = JSON.parse(out)?.[0]?.results ?? [];
      if (rows.length) return JSON.parse(rows[0].payload);
    } catch {}
    execSync("sleep 3");
  }
  return null;
}

// Read ALL callback rows for an action+txn (e.g. every on_status the mock pushed).
function readAllCallbacks(action, transaction_id) {
  try {
    const out = execSync(
      `npx wrangler d1 execute pay2cash --remote --json --command "SELECT payload FROM ondc_logs WHERE action='${action}' AND transaction_id='${transaction_id}' ORDER BY created_at ASC;"`,
      { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    return (JSON.parse(out)?.[0]?.results ?? []).map((r) => { try { return JSON.parse(r.payload); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// Pramaan mock emits the seller fulfillment lifecycle as on_status pushes. The
// fulfillment state.descriptor.code identifies each step; map it to the validator's
// ApiSequence key so each becomes its own log entry (on_status_pending, ...).
const STATE_TO_KEY = {
  "Pending": "on_status_pending",
  "Packed": "on_status_packed",
  "Agent-assigned": "on_status_agent_assigned",
  "Out-for-pickup": "on_status_out_for_pickup",
  "At-pickup": "on_status_at_pickup",
  "Pickup-failed": "on_status_pickup_failed",
  "Order-picked-up": "on_status_picked",
  "At-delivery": "on_status_at_delivery",
  "In-transit": "on_status_in_transit",
  "At-destination-hub": "on_status_at_destination_hub",
  "Out-for-delivery": "on_status_out_for_delivery",
  "Delivery-failed": "on_status_delivery_failed",
  "Order-delivered": "on_status_delivered",
  "RTO-Initiated": "on_status_rto_delivered",
  "RTO-Delivered": "on_status_rto_delivered",
  "RTO-Disposed": "on_status_rto_delivered",
};
function fulState(cb) {
  const fs = cb?.message?.order?.fulfillments || [];
  for (const f of fs) { const c = f?.state?.descriptor?.code; if (c) return c; }
  return null;
}
// Poll status to drive/collect the lifecycle; record each distinct state as its key.
// Returns the set of ApiSequence keys captured. `wantKeys` = keys this flow needs.
async function captureLifecycle(txn, bpp, orderId, wantKeys) {
  const got = {};
  for (let i = 0; i < 12; i++) {
    const statusBody = { context: ctx("status", txn, bpp), message: { order_id: orderId } };
    await send("status", statusBody);
    if (i === 0) record("status.json", statusBody);
    execSync("sleep 4");
    for (const cb of readAllCallbacks("on_status", txn)) {
      const code = fulState(cb);
      const key = code && STATE_TO_KEY[code];
      if (key) { got[key] = cb; record(`${key}.json`, cb); }
    }
    if (wantKeys.every((k) => got[k])) break;
  }
  const have = Object.keys(got);
  const missing = wantKeys.filter((k) => !got[k]);
  console.log(`  lifecycle captured: ${have.join(", ") || "(none)"}`);
  if (missing.length) console.log(`  ⚠ lifecycle missing: ${missing.join(", ")}`);
  return got;
}

// Wipe a scenario's log dir so it never mixes payloads from different transactions
// (the validator cross-checks fulfillment/txn ids across actions).
function cleanScenario(scenario) {
  const dir = new URL(`../ondc-logs/RET10/${scenario}/`, import.meta.url);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const legFiles = {};
function record(name, obj) { legFiles[name] = obj; }
function flush(scenario) {
  const dir = new URL(`../ondc-logs/RET10/${scenario}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [name, obj] of Object.entries(legFiles)) writeFileSync(new URL(name, dir), JSON.stringify(obj, null, 2));
  console.log(`  saved → worker/ondc-logs/RET10/${scenario}/ (${Object.keys(legFiles).join(", ")})`);
}

// Send one Beckn action. Returns { ack, cb }.
//   ack — did the BPP synchronously ACK (so the action is on the session)
//   cb  — the captured on_<action> callback from D1, or null if not (yet) seen
// IMPORTANT: a missing callback NEVER aborts the chain. The Pramaan console
// validates each action it RECEIVES on the active session, so every leg must be
// SENT even if its async callback is slow to land in D1. Only the data we truly
// need to build the next request (catalog from on_search, quote from on_init) is
// read back; everything else is best-effort logging.
async function leg(action, body, txn, { tries = 4 } = {}) {
  console.log(`→ ${action}`);
  const r = await send(action, body);
  console.log(`  sync: ${r.status} ${r.ok ? "ACK" : "NACK/err " + JSON.stringify(r.json).slice(0, 300)}`);
  record(`${action}.json`, body);
  const cb = r.ok ? readCallback(`on_${action}`, txn, tries) : null;
  if (cb) { record(`on_${action}.json`, cb); console.log(`  ✓ on_${action} captured`); }
  else console.log(`  ${r.ok ? "·" : "✗"} on_${action} ${r.ok ? "not captured yet (continuing)" : "skipped (NACK)"}`);
  return { ack: r.ok, cb };
}

const BUYER_ADDRESS = { name: BUYER.name, building: BUYER.building, locality: BUYER.locality, city: BUYER.city, state: BUYER.state, country: BUYER.country, area_code: BUYER.area_code };

// Run search→select→init→confirm in one transaction; return order context or null.
// Only on_search is strictly required (we need the catalog to build the order); a
// missing on_select/on_init does NOT abort — we proceed with our own payloads so
// every action still lands on the Pramaan session.
async function runOrder(txn, { prepaid = false } = {}) {
  const search = await leg("search", {
    context: ctx("search", txn),
    message: {
      intent: {
        fulfillment: { type: "Delivery" },
        payment: { "@ondc/org/buyer_app_finder_fee_type": "percent", "@ondc/org/buyer_app_finder_fee_amount": "3" },
        tags: [{ code: "catalog_full", list: [{ code: "payload_type", value: "inline" }] }],
      },
    },
  }, txn, { tries: 12 });
  const onSearch = search.cb;
  if (!onSearch) { console.error("  ! on_search not captured — cannot build the order; aborting chain"); return null; }

  const bpp = { bpp_id: onSearch.context.bpp_id, bpp_uri: onSearch.context.bpp_uri };
  const prov = onSearch.message.catalog["bpp/providers"][0];
  const loc = prov.locations[0].id;
  const item = prov.items[0];
  console.log(`  provider=${prov.id} item=${item.id} loc=${loc}`);

  // Fulfillment end is shared across select/init/confirm. end.person.name is REQUIRED
  // in init/confirm fulfillments (Pramaan: retail_bap_confirm_message_46/47).
  const fulfillmentEnd = {
    location: { gps: GPS, address: BUYER_ADDRESS },
    contact: { phone: BUYER.phone, email: BUYER.email },
    person: { name: BUYER.name },
  };

  const select = await leg("select", {
    context: ctx("select", txn, bpp),
    message: {
      order: {
        provider: { id: prov.id, locations: [{ id: loc }] },
        items: [{ id: item.id, location_id: loc, quantity: { count: 1 } }],
        fulfillments: [{ end: { location: { gps: GPS, address: { area_code: AREA_CODE } } } }],
        payment: { type: "ON-ORDER" },
      },
    },
  }, txn);
  const sellerFul = select.cb?.message?.order?.fulfillments?.[0] || {};
  const fid = sellerFul.id || item.fulfillment_id || "F1";
  // Echo the seller-promised enrichment (@ondc/org/TAT, category, provider_name,
  // state, tracking) back in our init/confirm fulfillment — Pramaan requires e.g.
  // fulfillments[0].@ondc/org/TAT. on_init drops these, so source from on_select.
  const fulEnrich = {};
  for (const k of Object.keys(sellerFul)) if (k.startsWith("@ondc/org/") || k === "state" || k === "tracking") fulEnrich[k] = sellerFul[k];
  if (!fulEnrich["@ondc/org/TAT"]) fulEnrich["@ondc/org/TAT"] = "PT45M"; // fallback if seller omitted

  const myItems = [{ id: item.id, location_id: loc, quantity: { count: 1 }, fulfillment_id: fid }];
  const myBilling = {
    name: BUYER.name,
    address: BUYER_ADDRESS,
    tax_number: "29ABCDE1234F1Z5", email: BUYER.email, phone: BUYER.phone, created_at: now(), updated_at: now(),
  };
  const myFulfillments = [{ id: fid, type: "Delivery", ...fulEnrich, end: fulfillmentEnd }];

  const init = await leg("init", {
    context: ctx("init", txn, bpp),
    message: {
      order: {
        provider: { id: prov.id, locations: [{ id: loc }] },
        items: myItems,
        billing: myBilling,
        fulfillments: myFulfillments,
        payment: { type: "ON-ORDER" },
      },
    },
  }, txn, { tries: 8 });

  // Build confirm from data WE control + the seller quote (fall back to catalog
  // price × qty if on_init wasn't captured in time) so confirm always sends.
  const initOrder = init.cb?.message?.order || {};
  const orderId = "P2C" + Date.now();
  const fallbackQuote = (() => {
    const unit = item?.price?.value;
    if (!unit) return null;
    const v = String(Number(unit) * 1);
    return { price: { currency: "INR", value: v }, breakup: [{ "@ondc/org/item_id": item.id, "@ondc/org/item_quantity": { count: 1 }, title: item?.descriptor?.name || "item", "@ondc/org/title_type": "item", price: { currency: "INR", value: v } }] };
  })();
  const quote = initOrder.quote || fallbackQuote;
  const total = quote?.price?.value || "0";
  // Prepaid: buyer pays upfront → status PAID, collected_by BAP, with settlement details.
  const prepaidPayment = {
    ...(initOrder.payment || {}),
    uri: "https://razorpay.com/",
    tl_method: "http/get",
    params: { amount: String(total), currency: "INR", transaction_id: "p2cpay_" + Date.now() },
    status: "PAID",
    type: "ON-ORDER",
    collected_by: "BAP",
    "@ondc/org/buyer_app_finder_fee_type": "percent",
    "@ondc/org/buyer_app_finder_fee_amount": "3.0",
    "@ondc/org/settlement_basis": "delivery",
    "@ondc/org/settlement_window": "P1D",
    "@ondc/org/withholding_amount": "0.00",
    "@ondc/org/settlement_details": initOrder.payment?.["@ondc/org/settlement_details"] || [{
      settlement_counterparty: "seller-app",
      settlement_phase: "sale-amount",
      settlement_type: "upi",
      settlement_bank_account_no: "1234567890",
      settlement_ifsc_code: "HDFC0000001",
      beneficiary_name: "PAY2 CASH-ONDC",
      bank_name: "HDFC Bank",
      branch_name: "MG Road",
    }],
  };
  const confirmItems = (initOrder.items?.length ? initOrder.items : myItems).map((it) => ({ id: it.id, fulfillment_id: it.fulfillment_id || fid, quantity: it.quantity || { count: 1 } }));
  const confirmOrder = {
    id: orderId, state: "Created",
    provider: { id: prov.id, locations: [{ id: loc }] },
    items: confirmItems,
    billing: initOrder.billing || myBilling,
    fulfillments: myFulfillments,
    quote,
    payment: prepaid ? prepaidPayment : { ...(initOrder.payment || { type: "ON-ORDER" }), status: "NOT-PAID" },
    tags: initOrder.tags, created_at: now(), updated_at: now(),
  };
  const confirm = await leg("confirm", { context: ctx("confirm", txn, bpp), message: { order: confirmOrder } }, txn, { tries: 8 });
  if (!confirm.ack) { console.error("  ! confirm NACK — order not placed"); return null; }

  return { bpp, prov, loc, item, fid, orderId, txn };
}

// Flow 1A: Order → confirm → fulfillment (PREPAID). search→select→init→confirm(PAID)
// →status→track→rating, one transaction. Run while "Flow 1A" is active in the console.
const DELIVERY_LIFECYCLE = ["on_status_pending", "on_status_packed", "on_status_agent_assigned", "on_status_picked", "on_status_out_for_delivery", "on_status_delivered"];

// Persist the placed-order context so a later `-finish` run (after the user steps
// the Pramaan console) can capture the lifecycle on the same transaction.
function saveOrderCtx(scenario, o) {
  const dir = new URL(`../ondc-logs/RET10/${scenario}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("_order.json", dir), JSON.stringify({ txn: o.txn, orderId: o.orderId, bpp: o.bpp, provId: o.prov.id, itemId: o.item.id, loc: o.loc, fid: o.fid }, null, 2));
}
function loadOrderCtx(scenario) {
  return JSON.parse(readFileSync(new URL(`../ondc-logs/RET10/${scenario}/_order.json`, import.meta.url), "utf8"));
}

// One-shot (mock testing only): runs everything, but standalone polling only yields
// "Pending" — use the start/finish split against the real console.
async function scenarioFlow1A() {
  console.log("=== Flow 1A: Order to confirm to fulfillment (Prepaid) — one-shot ===");
  const o = await runOrder(uuid(), { prepaid: true });
  if (!o) return flush("flow_1A_prepaid");
  saveOrderCtx("flow_1A_prepaid", o);
  await captureLifecycle(o.txn, o.bpp, o.orderId, DELIVERY_LIFECYCLE);
  await leg("track", { context: ctx("track", o.txn, o.bpp), message: { order_id: o.orderId } }, o.txn);
  await leg("rating", { context: ctx("rating", o.txn, o.bpp), message: { order_id: o.orderId, ratings: [{ id: o.orderId, rating_category: "Order", value: "5" }] } }, o.txn);
  flush("flow_1A_prepaid");
}

// PHASE 1: place the order on the active console session, then stop. User then steps
// the console through the fulfillment states (pending→…→delivered).
async function scenarioFlow1AStart() {
  console.log("=== Flow 1A START (prepaid): search→select→init→confirm ===");
  cleanScenario("flow_1A_prepaid");
  const o = await runOrder(uuid(), { prepaid: true });
  if (!o) return flush("flow_1A_prepaid");
  saveOrderCtx("flow_1A_prepaid", o);
  // Poll status while the order is still pending to capture on_status_pending for
  // THIS txn (the console only pushes packed→delivered when you step it).
  await captureLifecycle(o.txn, o.bpp, o.orderId, ["on_status_pending"]);
  flush("flow_1A_prepaid");
  console.log(`\n  ✅ ORDER PLACED  txn=${o.txn}  orderId=${o.orderId}`);
  console.log("  → Now step Flow 1A through the Pramaan console to 'Order-delivered'.");
  console.log("  → Then run: node worker/scripts/ondc-flow.mjs flow1a-finish");
}

// PHASE 2: after the console pushed the lifecycle, capture all on_status + track + rating.
async function scenarioFlow1AFinish() {
  console.log("=== Flow 1A FINISH: capture lifecycle + track + rating ===");
  const c = loadOrderCtx("flow_1A_prepaid");
  console.log(`  using txn=${c.txn} orderId=${c.orderId}`);
  await captureLifecycle(c.txn, c.bpp, c.orderId, DELIVERY_LIFECYCLE);
  await leg("track", { context: ctx("track", c.txn, c.bpp), message: { order_id: c.orderId } }, c.txn);
  await leg("rating", { context: ctx("rating", c.txn, c.bpp), message: { order_id: c.orderId, ratings: [{ id: c.orderId, rating_category: "Order", value: "5" }] } }, c.txn);
  flush("flow_1A_prepaid");
}

// Flow 9: Catalog Rejection. search → catalog_rejection (errors[] referencing a
// rejected item from on_search). Run while "Flow 9" is active in the console.
async function scenarioFlow9() {
  console.log("=== Flow 9: Catalog Rejection ===");
  cleanScenario("flow_9_catalog_rejection");
  const txn = uuid();
  const { cb: onSearch } = await leg("search", {
    context: ctx("search", txn),
    message: { intent: { fulfillment: { type: "Delivery" }, payment: { "@ondc/org/buyer_app_finder_fee_type": "percent", "@ondc/org/buyer_app_finder_fee_amount": "3" }, tags: [{ code: "catalog_full", list: [{ code: "payload_type", value: "inline" }] }] } },
  }, txn, { tries: 12 });
  if (!onSearch) return flush("flow_9_catalog_rejection");
  const bpp = { bpp_id: onSearch.context.bpp_id, bpp_uri: onSearch.context.bpp_uri };
  const prov = onSearch.message.catalog["bpp/providers"][0];
  const item = prov.items[0];
  await leg("catalog_rejection", {
    context: { ...ctx("catalog_rejection", txn, bpp), city: "*" },
    errors: [{
      type: "ITEM-ERROR",
      code: "91001",
      path: `message.catalog.bpp/providers[?(@.id==${prov.id})].items[?(@.id==${item.id})]`,
      message: "Item price > MRP",
    }],
  }, txn);
  flush("flow_9_catalog_rejection");
}

async function scenarioCancel() {
  console.log("=== Flow 2: Buyer Side Order Cancellation (reason 053) ===");
  cleanScenario("flow_2_cancellation");
  const o = await runOrder(uuid(), { prepaid: true });
  if (!o) return flush("flow_2_cancellation");
  // Buyer cancels the confirmed (pending) order. 053 ∈ buyerCancellationRid {051,052,053,999,010}.
  await captureLifecycle(o.txn, o.bpp, o.orderId, ["on_status_pending"]);
  await leg("cancel", {
    context: ctx("cancel", o.txn, o.bpp),
    message: {
      order_id: o.orderId,
      cancellation_reason_id: "053",
    },
  }, o.txn);
  flush("flow_2_cancellation");
}

async function scenarioUpdate() {
  console.log("=== scenario: update (part-cancel refund) ===");
  const o = await runOrder(uuid());
  if (!o) return flush("update_refund");
  const amt = o && (await readCallback("on_confirm", o.txn, 1))?.message?.order?.quote?.price?.value || "0";
  await leg("update", {
    context: ctx("update", o.txn, o.bpp),
    message: {
      update_target: "payment",
      order: {
        id: o.orderId,
        fulfillments: [{ id: o.fid, type: "Cancel" }],
        payment: {
          "@ondc/org/settlement_details": [{
            settlement_counterparty: "buyer",
            settlement_phase: "refund",
            settlement_type: "upi",
            settlement_amount: String(amt),
            settlement_timestamp: now(),
          }],
        },
      },
    },
  }, o.txn);
  flush("update_refund");
}

// IGM is a separate domain (nic2004:60232) + version. on_issue/on_issue_status
// return to our subscriber (handled). Mock may route IGM differently — flagged.
function igmCtx(action, txn, bpp) {
  return {
    domain: "nic2004:60232",
    country: "IND",
    city: CITY,
    action,
    core_version: "1.0.0",
    bap_id: BAP_ID,
    bap_uri: BAP_URI,
    bpp_id: bpp.bpp_id,
    bpp_uri: bpp.bpp_uri,
    transaction_id: txn,
    message_id: uuid(),
    timestamp: now(),
    ttl: "PT30S",
  };
}

async function scenarioIGM() {
  console.log("=== scenario: IGM (issue + issue_status) ===");
  const o = await runOrder(uuid());
  if (!o) return flush("igm");
  const issueId = uuid();
  const { ack: issueAck } = await leg("issue", {
    context: igmCtx("issue", o.txn, o.bpp),
    message: {
      issue: {
        id: issueId,
        category: "ITEM",
        sub_category: "ITM02",
        complainant_info: { person: { name: BUYER.name }, contact: { phone: BUYER.phone, email: BUYER.email } },
        order_details: {
          id: o.orderId, state: "Accepted",
          items: [{ id: o.item.id, quantity: 1 }],
          fulfillments: [{ id: o.fid, state: "Pending" }],
          provider_id: o.prov.id,
        },
        description: { short_desc: "Item quality issue", long_desc: "Item received not as described" },
        source: { network_participant_id: BAP_ID, type: "CONSUMER" },
        expected_response_time: { duration: "PT2H" },
        expected_resolution_time: { duration: "P1D" },
        status: "OPEN",
        issue_type: "ISSUE",
        issue_actions: {
          complainant_actions: [{
            complainant_action: "OPEN", short_desc: "Complaint created",
            updated_at: now(), updated_by: { org: { name: `${BAP_ID}::ONDC:RET10` }, contact: { phone: BUYER.phone, email: BUYER.email }, person: { name: BUYER.name } },
          }],
        },
      },
    },
  }, o.txn);
  if (issueAck) {
    await leg("issue_status", { context: igmCtx("issue_status", o.txn, o.bpp), message: { issue_id: issueId } }, o.txn);
  }
  flush("igm");
}

const PRAMAAN_BPP = { bpp_id: "pramaan.ondc.org/beta/preprod/mock/seller", bpp_uri: "https://pramaan.ondc.org/beta/preprod/mock/seller" };
// Send track + rating for an arbitrary txn+orderId (e.g. to complete a console run
// whose track/review are still pending):
//   node ondc-flow.mjs track-rating <txn> <orderId>
async function trackRating(txn, orderId) {
  console.log(`=== track + rating for txn=${txn} orderId=${orderId} ===`);
  await leg("track", { context: ctx("track", txn, PRAMAAN_BPP), message: { order_id: orderId } }, txn);
  await leg("rating", { context: ctx("rating", txn, PRAMAAN_BPP), message: { order_id: orderId, ratings: [{ id: orderId, rating_category: "Order", value: "5" }] } }, txn);
}

const cmd = process.argv[2] || "flow1a";
const scenarios = {
  flow1a: scenarioFlow1A,            // one-shot (mock only)
  "flow1a-start": scenarioFlow1AStart,   // phase 1: place order
  "flow1a-finish": scenarioFlow1AFinish, // phase 2: capture lifecycle (after console)
  flow2: scenarioCancel,    // Flow 2: Buyer Side Order Cancellation
  flow9: scenarioFlow9,     // Flow 9: Catalog Rejection
  update: scenarioUpdate,
  igm: scenarioIGM,
};
if (cmd === "track-rating") {
  await trackRating(process.argv[3], process.argv[4]);
} else if (cmd === "all") {
  for (const s of [scenarioFlow1A, scenarioCancel, scenarioFlow9]) { await s(); }
} else if (scenarios[cmd]) {
  await scenarios[cmd]();
} else {
  console.log("usage: node ondc-flow.mjs [flow1a|flow1a-start|flow1a-finish|flow2|flow9|update|igm|all]");
}
