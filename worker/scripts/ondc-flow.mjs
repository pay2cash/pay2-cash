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
// action = file/log label. sendAs overrides the POST endpoint, cbAs overrides the
// callback action queried from D1 (e.g. inc_search posts to /search and gets on_search).
async function leg(action, body, txn, { tries = 4, sendAs, cbAs, cbFile } = {}) {
  const endpoint = sendAs || action;
  const cbName = `on_${cbAs || action}`;
  const saveName = cbFile || cbName; // distinct filename when two legs share a cb action (e.g. inc_search)
  console.log(`→ ${action}`);
  const r = await send(endpoint, body);
  console.log(`  sync: ${r.status} ${r.ok ? "ACK" : "NACK/err " + JSON.stringify(r.json).slice(0, 300)}`);
  record(`${action}.json`, body);
  const cb = r.ok ? readCallback(cbName, txn, tries) : null;
  if (cb) { record(`${saveName}.json`, cb); console.log(`  ✓ ${saveName} captured`); }
  else console.log(`  ${r.ok ? "·" : "✗"} ${saveName} ${r.ok ? "not captured yet (continuing)" : "skipped (NACK)"}`);
  return { ack: r.ok, cb };
}

const BUYER_ADDRESS = { name: BUYER.name, building: BUYER.building, locality: BUYER.locality, city: BUYER.city, state: BUYER.state, country: BUYER.country, area_code: BUYER.area_code };

// Run search→select→init→confirm in one transaction; return order context or null.
// Only on_search is strictly required (we need the catalog to build the order); a
// missing on_select/on_init does NOT abort — we proceed with our own payloads so
// every action still lands on the Pramaan session.
async function runOrder(txn, { prepaid = false, oos = false, qty = 1, nonCancellable = false } = {}) {
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
  // Flow 7 needs a NON-cancellable item (@ondc/org/cancellable===false). The Pramaan
  // mock catalog flags one item (id_5yzai_3_0) as cancellable:false/returnable:false.
  const item = nonCancellable
    ? (prov.items.find((i) => i["@ondc/org/cancellable"] === false) || prov.items[0])
    : prov.items[0];
  console.log(`  provider=${prov.id} item=${item.id} loc=${loc}`);

  // Fulfillment end is shared across select/init/confirm. end.person.name is REQUIRED
  // in init/confirm fulfillments (Pramaan: retail_bap_confirm_message_46/47).
  const fulfillmentEnd = {
    location: { gps: GPS, address: BUYER_ADDRESS },
    contact: { phone: BUYER.phone, email: BUYER.email },
    person: { name: BUYER.name },
  };

  // Flow 5: a SELECT requesting more than the seller's available stock (item max=99
  // in the Pramaan mock → request 100). on_select_out_of_stock reflects unavailability.
  // Its message_id must differ from the real select (validator checks this); ctx() always
  // mints a fresh one. Then the normal select proceeds with an in-stock quantity.
  if (oos) {
    await leg("select_out_of_stock", {
      context: ctx("select", txn, bpp),
      message: {
        order: {
          provider: { id: prov.id, locations: [{ id: loc }] },
          items: [{ id: item.id, location_id: loc, quantity: { count: 100 } }],
          fulfillments: [{ end: { location: { gps: GPS, address: { area_code: AREA_CODE } } } }],
          payment: { type: "ON-ORDER" },
        },
      },
    }, txn, { sendAs: "select", cbAs: "select", cbFile: "on_select_out_of_stock" });
  }

  const select = await leg("select", {
    context: ctx("select", txn, bpp),
    message: {
      order: {
        provider: { id: prov.id, locations: [{ id: loc }] },
        items: [{ id: item.id, location_id: loc, quantity: { count: qty } }],
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

  const myItems = [{ id: item.id, location_id: loc, quantity: { count: qty }, fulfillment_id: fid }];
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
    const v = String(Number(unit) * qty);
    return { price: { currency: "INR", value: v }, breakup: [{ "@ondc/org/item_id": item.id, "@ondc/org/item_quantity": { count: qty }, title: item?.descriptor?.name || "item", "@ondc/org/title_type": "item", price: { currency: "INR", value: v } }] };
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

// Flow 5: Out of stock. search → select_out_of_stock (request qty>stock) → normal
// order → full delivery lifecycle. Two-phase like 1A (lifecycle is console-driven).
async function scenarioFlow5Start() {
  console.log("=== Flow 5 START (out of stock): search→select_oos→select→init→confirm ===");
  cleanScenario("flow_5_out_of_stock");
  const o = await runOrder(uuid(), { prepaid: true, oos: true });
  if (!o) return flush("flow_5_out_of_stock");
  saveOrderCtx("flow_5_out_of_stock", o);
  await captureLifecycle(o.txn, o.bpp, o.orderId, ["on_status_pending"]);
  flush("flow_5_out_of_stock");
  console.log(`\n  ✅ ORDER PLACED  txn=${o.txn}  orderId=${o.orderId}`);
  console.log("  → Now step Flow 5 through the Pramaan console to 'Order-delivered'.");
  console.log("  → Then run: node worker/scripts/ondc-flow.mjs flow5-finish");
}
async function scenarioFlow5Finish() {
  console.log("=== Flow 5 FINISH: capture lifecycle + track + rating ===");
  const c = loadOrderCtx("flow_5_out_of_stock");
  console.log(`  using txn=${c.txn} orderId=${c.orderId}`);
  await captureLifecycle(c.txn, c.bpp, c.orderId, DELIVERY_LIFECYCLE);
  await leg("track", { context: ctx("track", c.txn, c.bpp), message: { order_id: c.orderId } }, c.txn);
  await leg("rating", { context: ctx("rating", c.txn, c.bpp), message: { order_id: c.orderId, ratings: [{ id: c.orderId, rating_category: "Order", value: "5" }] } }, c.txn);
  flush("flow_5_out_of_stock");
}

// Capture seller-pushed merchant actions for a txn: on_cancel (full/RTO cancel),
// on_update_* (partial cancel / settlement), and any on_status incl RTO states.
// The console (seller) drives these; we poll status to nudge + read all pushes from D1.
async function captureMerchant(txn, bpp, orderId, { wantCancel = false, wantStates = [] } = {}) {
  const got = {};
  for (let i = 0; i < 15; i++) {
    await send("status", { context: ctx("status", txn, bpp), message: { order_id: orderId } });
    if (i === 0) record("status.json", { context: ctx("status", txn, bpp), message: { order_id: orderId } });
    execSync("sleep 4");
    for (const cb of readAllCallbacks("on_cancel", txn)) { got.on_cancel = cb; record("on_cancel.json", cb); }
    for (const cb of readAllCallbacks("on_update", txn)) { got.on_update = cb; record("on_update.json", cb); }
    for (const cb of readAllCallbacks("on_status", txn)) {
      const key = STATE_TO_KEY[fulState(cb)];
      if (key) { got[key] = cb; record(`${key}.json`, cb); }
    }
    const done = (!wantCancel || got.on_cancel) && wantStates.every((k) => got[k]);
    if (done && i >= 1) break;
  }
  console.log(`  merchant captured: ${Object.keys(got).join(", ") || "(none)"}`);
  return got;
}

// Flow 3 series: SELLER-driven cancel/RTO. Buyer places a prepaid order; the SELLER acts
// from the console (partial cancel → on_update; full cancel → on_cancel; RTO → on_cancel +
// rto on_status states). Two-phase: place + capture-pending, then capture seller pushes.
// `cmd` = console command suffix (3a/3b/3c) used to name the finish hint.
function merchantFlow(scenario, cmd, label, finishOpts) {
  return {
    async start() {
      console.log(`=== Flow ${cmd.toUpperCase()} START: ${label} — place prepaid order ===`);
      cleanScenario(scenario);
      const o = await runOrder(uuid(), { prepaid: true });
      if (!o) return flush(scenario);
      saveOrderCtx(scenario, o);
      await captureLifecycle(o.txn, o.bpp, o.orderId, ["on_status_pending"]);
      flush(scenario);
      console.log(`\n  ✅ ORDER PLACED  txn=${o.txn}  orderId=${o.orderId}`);
      console.log(`  → Now trigger the SELLER action (${label}) in the Pramaan console.`);
      console.log(`  → Then run: node scripts/ondc-flow.mjs flow${cmd}-finish`);
    },
    async finish() {
      console.log(`=== Flow ${cmd.toUpperCase()} FINISH: capture seller pushes (${label}) ===`);
      const c = loadOrderCtx(scenario);
      console.log(`  using txn=${c.txn} orderId=${c.orderId}`);
      await captureMerchant(c.txn, c.bpp, c.orderId, finishOpts);
      flush(scenario);
    },
  };
}
const flow3A = merchantFlow("flow_3A_merchant_part_cancel", "3a", "merchant partial cancel", { wantCancel: false });
const flow3B = merchantFlow("flow_3B_merchant_rto", "3b", "merchant full cancel / RTO", { wantCancel: true, wantStates: ["on_status_rto_delivered"] });
const flow3C = merchantFlow("flow_3C_merchant_cancel", "3c", "merchant full cancel", { wantCancel: true });

// Flow 4A/4B: BUYER-INITIATED RETURN. Order must first reach Delivered (console-stepped,
// like 1A/5). Then the buyer sends ONE `update` (update_target=item) carrying a
// `return_request` tag. The seller then pushes UNSOLICITED on_update calls advancing the
// return fulfillment: Return-Initiated → Return-Approved → Return-Picked → Return-Delivered
// (each console-stepped). 4A returns the full qty; 4B orders qty≥2 and returns a partial qty.
const RETURN_STATE_TO_KEY = {
  "Return-Initiated": "on_update_return_initiated",
  "Return_Initiated": "on_update_return_initiated",
  "RTO-Initiated": "on_update_return_initiated",
  "Return_Approved": "on_update_return_approved",
  "Return-Approved": "on_update_return_approved",
  "Return-Accepted": "on_update_return_approved",
  "Return_Picked": "on_update_return_picked",
  "Return-Picked": "on_update_return_picked",
  "Return_Delivered": "on_update_return_delivered",
  "Return-Delivered": "on_update_return_delivered",
  "Liquidated": "on_update_return_liquidated",
};
// Scan all fulfillments for a Return-* state (order has both a Delivery and a Return ful).
function fulRetState(cb) {
  const fs = cb?.message?.order?.fulfillments || [];
  for (const f of fs) { const c = f?.state?.descriptor?.code; if (c && RETURN_STATE_TO_KEY[c]) return c; }
  return null;
}
// Build the buyer return `update`. return_request reason_id must be a buyer-return reason
// (RET1.2.5 return_request_reasonCodes = 002/003/004/005). The return fulfillment id must
// be NEW (not the delivery fulfillment id) — the validator rejects a reused id.
function returnUpdateBody(txn, bpp, c, returnQty) {
  const retFid = "return_" + c.orderId;
  return {
    context: ctx("update", txn, bpp),
    message: {
      update_target: "item",
      order: {
        id: c.orderId,
        fulfillments: [{
          id: retFid,
          type: "Return",
          tags: [{
            code: "return_request",
            list: [
              { code: "id", value: retFid },
              { code: "item_id", value: c.itemId },
              { code: "item_quantity", value: String(returnQty) },
              { code: "reason_id", value: "002" },
              { code: "replace", value: "no" },
              { code: "images", value: "https://ondc.pay2.cash/returns/" + c.orderId + ".jpg" },
            ],
          }],
        }],
      },
    },
  };
}
// Poll status and capture the seller's unsolicited on_update return-state pushes.
async function captureReturn(txn, bpp, orderId, wantKeys = []) {
  const got = {};
  for (let i = 0; i < 15; i++) {
    await send("status", { context: ctx("status", txn, bpp), message: { order_id: orderId } });
    execSync("sleep 4");
    for (const cb of readAllCallbacks("on_update", txn)) {
      const code = fulRetState(cb);
      const key = code && RETURN_STATE_TO_KEY[code];
      if (key) { got[key] = cb; record(`${key}.json`, cb); }
    }
    if (wantKeys.length && wantKeys.every((k) => got[k]) && i >= 1) break;
  }
  console.log(`  return states captured: ${Object.keys(got).join(", ") || "(none)"}`);
  return got;
}
// Three phases: start (place order, capture pending) → deliver (capture lifecycle to
// Delivered, then send the return update) → finish (capture return on_update states).
function returnFlow(scenario, cmd, label, { qty = 1, returnQty = 1 } = {}) {
  return {
    async start() {
      console.log(`=== Flow ${cmd.toUpperCase()} START: ${label} — place order (qty ${qty}) ===`);
      cleanScenario(scenario);
      const o = await runOrder(uuid(), { prepaid: true, qty });
      if (!o) return flush(scenario);
      saveOrderCtx(scenario, o);
      await captureLifecycle(o.txn, o.bpp, o.orderId, ["on_status_pending"]);
      flush(scenario);
      console.log(`\n  ✅ ORDER PLACED  txn=${o.txn}  orderId=${o.orderId}`);
      console.log(`  → Step the console through to DELIVERED (Packed→…→Order-delivered), then run: node scripts/ondc-flow.mjs flow${cmd}-deliver`);
    },
    async deliver() {
      console.log(`=== Flow ${cmd.toUpperCase()} DELIVER: capture delivery lifecycle + send return request ===`);
      const c = loadOrderCtx(scenario);
      console.log(`  using txn=${c.txn} orderId=${c.orderId}`);
      await captureLifecycle(c.txn, c.bpp, c.orderId, DELIVERY_LIFECYCLE);
      await leg("update", returnUpdateBody(c.txn, c.bpp, c, returnQty), c.txn, { tries: 8 });
      flush(scenario);
      console.log(`\n  ↩ RETURN REQUESTED  (qty ${returnQty} of ${qty})`);
      console.log(`  → Step the console through the return: Return-Approved → Return-Picked → Return-Delivered, then run: node scripts/ondc-flow.mjs flow${cmd}-finish`);
    },
    async finish() {
      console.log(`=== Flow ${cmd.toUpperCase()} FINISH: capture return on_update states ===`);
      const c = loadOrderCtx(scenario);
      console.log(`  using txn=${c.txn} orderId=${c.orderId}`);
      await captureReturn(c.txn, c.bpp, c.orderId, ["on_update_return_approved", "on_update_return_picked", "on_update_return_delivered"]);
      flush(scenario);
    },
  };
}
const flow4A = returnFlow("flow_4A_buyer_return_full", "4a", "buyer return (full order)", { qty: 1, returnQty: 1 });
const flow4B = returnFlow("flow_4B_buyer_return_partial", "4b", "buyer return (partial)", { qty: 2, returnQty: 1 });

// Flow 7: NON-CANCELLABLE flow. Order a non-cancellable item, then attempt a buyer
// `cancel`. The seller returns a synchronous NACK (not on_cancel) — that NACK IS the
// expected pass. Single-shot (no console stepping): select flow 7 in console, run this.
async function scenarioFlow7Start() {
  console.log("=== Flow 7 START: place order with a NON-cancellable item ===");
  cleanScenario("flow_7_non_cancellable");
  const o = await runOrder(uuid(), { prepaid: true, nonCancellable: true });
  if (!o) return flush("flow_7_non_cancellable");
  console.log(`  ordered non-cancellable item=${o.item.id}`);
  saveOrderCtx("flow_7_non_cancellable", o);
  await captureLifecycle(o.txn, o.bpp, o.orderId, ["on_status_pending"]);
  flush("flow_7_non_cancellable");
  console.log(`\n  ✅ ORDER PLACED  txn=${o.txn}  orderId=${o.orderId}`);
  console.log("  → When the console shows it's waiting for the cancel, run: node scripts/ondc-flow.mjs flow7-cancel");
}
async function scenarioFlow7Cancel() {
  console.log("=== Flow 7 CANCEL: attempt cancel — seller should NACK (non-cancellable) ===");
  const c = loadOrderCtx("flow_7_non_cancellable");
  console.log(`  using txn=${c.txn} orderId=${c.orderId}`);
  const cancelBody = {
    context: ctx("cancel", c.txn, c.bpp),
    message: {
      order_id: c.orderId,
      cancellation_reason_id: "010",
      descriptor: {
        name: "fulfillment", short_desc: c.fid,
        tags: [{ code: "params", list: [{ code: "force", value: "no" }, { code: "ttl_response", value: "PT30S" }] }],
      },
    },
  };
  console.log("→ cancel (expecting NACK)");
  const r = await send("cancel", cancelBody);
  record("cancel.json", cancelBody);
  record("on_cancel.json", r.json); // the NACK response (context + error) is the expected result
  console.log(`  sync: ${r.status} ${!r.ok ? "NACK ✓ (expected — order non-cancellable)" : "ACK ✗ UNEXPECTED (got cancelled)"}`);
  if (r.json?.error) console.log(`  error: ${JSON.stringify(r.json.error)}`);
  flush("flow_7_non_cancellable");
}

// Flow 8A: Full catalog refresh. A city-level search carrying the catalog_full tag;
// the seller returns its full catalog in on_search. Search-only (no order). Run while
// "Flow 8A" is active in the console.
async function scenarioFlow8A() {
  console.log("=== Flow 8A: Full catalog refresh (search → on_search) ===");
  cleanScenario("flow_8A_catalog");
  const txn = uuid();
  const { cb: onSearch } = await leg("search", {
    context: ctx("search", txn),
    message: {
      intent: {
        fulfillment: { type: "Delivery" },
        payment: { "@ondc/org/buyer_app_finder_fee_type": "percent", "@ondc/org/buyer_app_finder_fee_amount": "3" },
        tags: [{ code: "catalog_full", list: [{ code: "payload_type", value: "inline" }] }],
      },
    },
  }, txn, { tries: 12 });
  if (!onSearch) console.error("  ! on_search not captured");
  else console.log(`  ✓ full catalog: provider=${onSearch.message.catalog["bpp/providers"]?.[0]?.id} items=${onSearch.message.catalog["bpp/providers"]?.[0]?.items?.length}`);
  flush("flow_8A_catalog");
}

// Flow 8B: Incremental catalog — PULL. BAP requests catalog changes in a time window
// via intent tag catalog_inc {start_time, end_time}; seller returns the delta in on_search.
async function scenarioFlow8B() {
  console.log("=== Flow 8B: Incremental catalog PULL (search → inc_search) ===");
  cleanScenario("flow_8B_inc_pull");
  const txn = uuid();
  // 1) full catalog refresh to seed the baseline catalog. Incremental pull is a
  // network-wide catalog op → context.city must be "*" (Pramaan: 'context.city' should be *).
  await leg("search", {
    context: { ...ctx("search", txn), city: "*" },
    message: {
      intent: {
        fulfillment: { type: "Delivery" },
        payment: { "@ondc/org/buyer_app_finder_fee_type": "percent", "@ondc/org/buyer_app_finder_fee_amount": "3" },
        tags: [{ code: "catalog_full", list: [{ code: "payload_type", value: "inline" }] }],
      },
    },
  }, txn, { tries: 12 });
  // 2) incremental pull — only the delta in [start,end]
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000); // 1h window
  const { cb } = await leg("inc_search", {
    context: { ...ctx("search", txn), action: "search", city: "*" },
    message: {
      intent: {
        fulfillment: { type: "Delivery" },
        payment: { "@ondc/org/buyer_app_finder_fee_type": "percent", "@ondc/org/buyer_app_finder_fee_amount": "3" },
        tags: [{ code: "catalog_inc", list: [
          { code: "start_time", value: start.toISOString() },
          { code: "end_time", value: end.toISOString() },
        ] }],
      },
    },
  }, txn, { tries: 12, sendAs: "search", cbAs: "search", cbFile: "inc_on_search" });
  if (!cb) console.error("  ! on_search (inc) not captured");
  flush("flow_8B_inc_pull");
}

// Flow 8C: Incremental catalog — PUSH. BAP subscribes to seller-pushed catalog updates
// via intent tag catalog_inc {mode:"start", start_time, end_time}; seller pushes on_search.
async function scenarioFlow8C() {
  console.log("=== Flow 8C: Incremental catalog PUSH (subscribe) ===");
  cleanScenario("flow_8C_inc_push");
  const txn = uuid();
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  const { cb } = await leg("inc_search", {
    context: { ...ctx("search", txn), action: "search" },
    message: {
      intent: {
        fulfillment: { type: "Delivery" },
        payment: { "@ondc/org/buyer_app_finder_fee_type": "percent", "@ondc/org/buyer_app_finder_fee_amount": "3" },
        tags: [{ code: "catalog_inc", list: [
          { code: "mode", value: "start" },
          { code: "start_time", value: start.toISOString() },
          { code: "end_time", value: end.toISOString() },
        ] }],
      },
    },
  }, txn, { tries: 12, sendAs: "search", cbAs: "search" });
  if (!cb) console.error("  ! on_search (push) not captured");
  flush("flow_8C_inc_push");
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
  console.log("=== Flow 2: Buyer Side Order Cancellation (reason 010) ===");
  cleanScenario("flow_2_cancellation");
  const o = await runOrder(uuid(), { prepaid: true });
  if (!o) return flush("flow_2_cancellation");
  // Buyer cancels the confirmed (pending) order. Reason 010 is in BOTH the Pramaan
  // enum {001,003,004,006,009,010,999} and the log-utility buyerCancellationRid set —
  // the only safe overlap (along with 999). RET10 v1.2.5 also requires a descriptor
  // with name+short_desc (+params tags force/ttl_response).
  await captureLifecycle(o.txn, o.bpp, o.orderId, ["on_status_pending"]);
  await leg("cancel", {
    context: ctx("cancel", o.txn, o.bpp),
    message: {
      order_id: o.orderId,
      cancellation_reason_id: "010",
      descriptor: {
        name: "fulfillment",
        short_desc: o.fid,
        tags: [
          { code: "params", list: [
            { code: "force", value: "no" },
            { code: "ttl_response", value: "PT30S" },
          ] },
        ],
      },
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

// ============================================================================
// IGM (Issue & Grievance Management) — Flows 6A–6F.
// For RET10 v1.2.5, Pramaan validates IGM on the RETAIL context: domain ONDC:RET10,
// core_version 1.2.5 (NOT the legacy IGM 1.0.0 domain nic2004:60232 — that fails
// igmTest/context.js: "expected 'nic2004:60232' to equal 'ONDC:RET10'"). The issue
// MESSAGE body is unchanged (vendored issue schema already lists ONDC:RET10 in its
// domain enum). The buyer (BAP/INTERFACING-NP)
// raises an `issue`; the seller (BPP) pushes `on_issue` with its resolution. Buyer can
// poll `issue_status` (→ on_issue_status), ESCALATE (issue, GRIEVANCE), and CLOSE
// (issue, status CLOSED, rating). on_issue/on_issue_status return to our subscriber and
// are captured in D1 (CALLBACK_ACTIONS includes both). Like the order lifecycle, the
// seller's resolution pushes are CONSOLE-DRIVEN, so IGM is phased: raise → status →
// (escalate) → close, stepping the Pramaan console between phases.
//
//   6A  basic issue → seller resolves → buyer closes        : igm-start → igm-status → igm-close
//   6B  issue → buyer escalates (GRIEVANCE) → resolve/close : igm-start → igm-status → igm-escalate → igm-close
//   6C–6F  variants (category/sub_category, dispute, GRO) — same building blocks; set
//          IGM_CATEGORY / IGM_SUBCAT env to match the card, then run the phases.
// IGM references an order, so each run places a fresh prepaid order first (reaches
// Accepted); pass an existing scenario name as argv[3] to reuse its placed order.
const ORG_NAME = `${BAP_ID}::${DOMAIN}`; // org name format: <subscriber_id>::<domain>
function igmCtx(action, txn, bpp) {
  return {
    domain: DOMAIN,            // ONDC:RET10 — Pramaan validates IGM on the retail context
    country: "IND",
    city: CITY,
    action,
    core_version: CORE_VERSION, // 1.2.5
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
// A single complainant action entry (OPEN/ESCALATE/CLOSE) with the required updated_by org.
function complainantAction(action, t, shortDesc) {
  return {
    complainant_action: action,
    short_desc: shortDesc,
    updated_at: t,
    updated_by: {
      org: { name: ORG_NAME },
      contact: { phone: BUYER.phone, email: BUYER.email },
      person: { name: BUYER.name },
    },
  };
}
// Build the full `issue` object (used for OPEN and ESCALATE — escalate just appends an
// ESCALATE action and flips issue_type to GRIEVANCE). Schema: Igm/issue.mjs.
function makeIssue(o, issueId, { escalate = false, createdAt } = {}) {
  const t = now();
  const category = process.env.IGM_CATEGORY || "ITEM";
  const sub_category = process.env.IGM_SUBCAT || "ITM02";
  // complainant_actions is a CUMULATIVE thread with cascaded_level tracking escalation
  // depth: OPEN=1; an ESCALATE bumps to level 2 (grievance).
  const open = complainantAction("OPEN", createdAt || t, "Complaint created");
  open.cascaded_level = 1;
  const actions = [open];
  if (escalate) {
    const esc = complainantAction("ESCALATE", t, "Unsatisfied with resolution — escalating");
    esc.cascaded_level = 2;
    actions.push(esc);
  }
  return {
    context: igmCtx("issue", o.txn, o.bpp),
    message: {
      issue: {
        id: issueId,
        category,
        sub_category,
        complainant_info: { person: { name: BUYER.name }, contact: { phone: BUYER.phone, email: BUYER.email } },
        order_details: {
          id: o.orderId, state: "Accepted",
          items: [{ id: o.itemId || o.item?.id, quantity: 1 }],
          fulfillments: [{ id: o.fid, state: "Pending" }],
          provider_id: o.provId || o.prov?.id,
        },
        description: {
          short_desc: "Item quality issue",
          long_desc: "Item received not as described",
          additional_desc: { url: "https://ondc.pay2.cash/igm/" + issueId + ".txt", content_type: "text/plain" },
          images: ["https://ondc.pay2.cash/igm/" + issueId + ".jpg"],
        },
        source: { network_participant_id: BAP_ID, type: "CONSUMER" },
        expected_response_time: { duration: "PT2H" },
        expected_resolution_time: { duration: "P1D" },
        status: "OPEN",
        issue_type: escalate ? "GRIEVANCE" : "ISSUE",
        issue_actions: { complainant_actions: actions },
        created_at: createdAt || t,
        updated_at: t,
      },
    },
  };
}
// Build the CLOSE `issue` (Igm/issueClose.mjs): status CLOSED, rating, CLOSE action.
// complainant_actions must be the CUMULATIVE thread (OPEN → CLOSE) at the seller's
// cascaded_level — Pramaan keeps "Waiting for issue_close" if the close drops the
// original OPEN action or the cascaded_level doesn't line up with the resolution.
function makeIssueClose(o, issueId, createdAt, { rating = "THUMBS-UP", escalated = false, escalatedAt } = {}) {
  const t = now();
  const level = escalated ? 2 : 1; // close at the seller's latest resolution level
  const open = complainantAction("OPEN", createdAt || t, "Complaint created");
  open.cascaded_level = 1;
  const actions = [open];
  if (escalated) {
    const esc = complainantAction("ESCALATE", escalatedAt || t, "Unsatisfied with resolution — escalating");
    esc.cascaded_level = 2;
    actions.push(esc);
  }
  const close = complainantAction("CLOSE", t, "Issue resolved — closing");
  close.cascaded_level = level;
  actions.push(close);
  return {
    context: igmCtx("issue", o.txn, o.bpp),
    message: {
      issue: {
        id: issueId,
        status: "CLOSED",
        rating,
        issue_actions: { complainant_actions: actions },
        created_at: createdAt || t,
        updated_at: t,
      },
    },
  };
}
// Persist the issue id + created_at so later phases (status/escalate/close) reuse them.
function saveIgm(scenario, data) {
  const dir = new URL(`../ondc-logs/RET10/${scenario}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("_igm.json", dir), JSON.stringify(data, null, 2));
}
function loadIgm(scenario) {
  return JSON.parse(readFileSync(new URL(`../ondc-logs/RET10/${scenario}/_igm.json`, import.meta.url), "utf8"));
}
// Poll for seller IGM pushes (on_issue / on_issue_status) landing in D1 after a console step.
async function captureIgm(action, txn, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const rows = readAllCallbacks(action, txn);
    if (rows.length) { const cb = rows[rows.length - 1]; record(`${action}.json`, cb); console.log(`  ✓ ${action} captured`); return cb; }
    execSync("sleep 4");
  }
  console.log(`  · ${action} not captured yet (continuing)`);
  return null;
}

const IGM_SCENARIO = "flow_6_igm";
// PHASE 1: place order, raise the issue (OPEN), capture the seller's first on_issue.
async function scenarioIgmStart() {
  const reuse = process.argv[3];
  console.log(`=== IGM START: place order + raise issue${reuse ? ` (reuse order from ${reuse})` : ""} ===`);
  cleanScenario(IGM_SCENARIO);
  let o;
  if (reuse) {
    o = loadOrderCtx(reuse);
  } else {
    o = await runOrder(uuid(), { prepaid: true });
    if (!o) return flush(IGM_SCENARIO);
  }
  const issueId = uuid();
  const createdAt = now();
  saveOrderCtx(IGM_SCENARIO, reuse ? { ...o, prov: { id: o.provId }, item: { id: o.itemId } } : o);
  saveIgm(IGM_SCENARIO, { issueId, createdAt, txn: o.txn });
  const issue = makeIssue(o, issueId, { createdAt });
  await leg("issue", issue, o.txn, { tries: 10 });
  flush(IGM_SCENARIO);
  console.log(`\n  🧾 ISSUE RAISED  issue_id=${issueId}  txn=${o.txn}`);
  console.log("  → Step the Pramaan console to push the seller's resolution (on_issue), then run: node scripts/ondc-flow.mjs igm-status");
}
// PHASE 2: poll issue_status and capture on_issue + on_issue_status (seller resolution).
async function scenarioIgmStatus() {
  console.log("=== IGM STATUS: send issue_status + capture seller resolution ===");
  const c = loadOrderCtx(IGM_SCENARIO);
  const ig = loadIgm(IGM_SCENARIO);
  const o = { ...c, bpp: c.bpp, prov: { id: c.provId }, item: { id: c.itemId } };
  await captureIgm("on_issue", o.txn);
  await leg("issue_status", { context: igmCtx("issue_status", o.txn, o.bpp), message: { issue_id: ig.issueId } }, o.txn, { tries: 10 });
  await captureIgm("on_issue_status", o.txn);
  flush(IGM_SCENARIO);
  console.log("  → For 6B (escalation) run: igm-escalate.  Otherwise close: node scripts/ondc-flow.mjs igm-close");
}
// PHASE 2b (6B/grievance): escalate the issue (GRIEVANCE).
async function scenarioIgmEscalate() {
  console.log("=== IGM ESCALATE: raise grievance (ESCALATE) ===");
  const c = loadOrderCtx(IGM_SCENARIO);
  const ig = loadIgm(IGM_SCENARIO);
  const o = { ...c, bpp: c.bpp, prov: { id: c.provId }, item: { id: c.itemId } };
  const escalatedAt = now();
  await leg("issue_escalate", makeIssue(o, ig.issueId, { escalate: true, createdAt: ig.createdAt }), o.txn, { sendAs: "issue", cbAs: "issue", cbFile: "on_issue_escalate", tries: 10 });
  saveIgm(IGM_SCENARIO, { ...ig, escalated: true, escalatedAt }); // close must echo the ESCALATE in its thread
  flush(IGM_SCENARIO);
  console.log("  → Step the console to push the grievance resolution, then run: igm-status (or igm-close).");
}
// PHASE 3: close the issue (status CLOSED + rating), capture the seller's on_issue close ack.
async function scenarioIgmClose() {
  console.log("=== IGM CLOSE: close issue with rating ===");
  const c = loadOrderCtx(IGM_SCENARIO);
  const ig = loadIgm(IGM_SCENARIO);
  const o = { ...c, bpp: c.bpp, prov: { id: c.provId }, item: { id: c.itemId } };
  const closeBody = makeIssueClose(o, ig.issueId, ig.createdAt, { escalated: !!ig.escalated, escalatedAt: ig.escalatedAt });
  await leg("issue_close", closeBody, o.txn, { sendAs: "issue", cbAs: "issue", cbFile: "on_issue_close", tries: 10 });
  await captureIgm("on_issue", o.txn);
  flush(IGM_SCENARIO);
  console.log(`\n  ✅ IGM lifecycle complete for issue_id=${ig.issueId}`);
}
// Re-send the issue(open) on the EXISTING txn/issue_id (fresh message_id). IGM 2.0
// (Flow 6b–6e) tracks issue_open only after the console Start is clicked, so the open
// must be (re)sent AFTER start — unlike Flow 6 where igm-start's pre-sent issue sufficed.
async function scenarioIgmReopen() {
  console.log("=== IGM RE-OPEN: re-send issue(open) on existing txn (post-console-start) ===");
  const c = loadOrderCtx(IGM_SCENARIO);
  const ig = loadIgm(IGM_SCENARIO);
  const o = { ...c, bpp: c.bpp, prov: { id: c.provId }, item: { id: c.itemId } };
  console.log(`  txn=${o.txn} issue_id=${ig.issueId}`);
  await leg("issue", makeIssue(o, ig.issueId, { createdAt: ig.createdAt }), o.txn, { tries: 10 });
  flush(IGM_SCENARIO);
  console.log("  → Console should now advance issue_open. Then click 'Request Info'.");
}
// One-shot (mock testing only): start → status, no console stepping (only first on_issue).
async function scenarioIGM() {
  await scenarioIgmStart();
  await scenarioIgmStatus();
}

// ============================================================================
// IGM 2.0 (Flow 6b–6e) — a DIFFERENT protocol from Flow 6 / IGM 1.0 above.
// Schema + rules vendored from ONDC log-validation-utility (schema/Igm/2.0.0 +
// utils/igm/igm2). Buyer action codes via descriptor.code: OPEN → INFO_PROVIDED →
// RESOLUTION_ACCEPTED → CLOSED, each appended to issue.actions (update_target APPENDED).
// Validator rules honoured: for OPEN updated_at===created_at & status OPEN; source_id ===
// CONSUMER actor id; complainant_id === INTERFACING_NP actor id; last_action_id === last
// action id; CONSUMER/INTERFACING_NP org.name = bap_id::domain, COUNTERPARTY = bpp_id::domain;
// FLOW_1 mandatory refs ORDER/PROVIDER/FULFILLMENT/ITEM. The buyer's info/accept/close
// ECHO the seller's latest on_issue (so resolutions[] carry through) then append our action.
const IGM2_SCENARIO = "flow_6b_igm2";
const IGM2_BAP_ORG = `${BAP_ID}::${DOMAIN}`;
const A_CONSUMER = "consumer-1", A_INTERFACING = "interfacing-np-1", A_COUNTERPARTY = "counterparty-np-1";

function igm2Actors(bpp) {
  return [
    { id: A_CONSUMER, type: "CONSUMER", info: { org: { name: IGM2_BAP_ORG }, person: { name: BUYER.name }, contact: { phone: BUYER.phone, email: BUYER.email } } },
    { id: A_INTERFACING, type: "INTERFACING_NP", info: { org: { name: IGM2_BAP_ORG }, person: { name: "pay2 Cash" }, contact: { phone: BUYER.phone, email: BUYER.email } } },
    { id: A_COUNTERPARTY, type: "COUNTERPARTY_NP", info: { org: { name: `${bpp.bpp_id}::${DOMAIN}` }, person: { name: "Seller" }, contact: { phone: "9350657100", email: "seller@pramaan.ondc.org" } } },
  ];
}
function igm2Refs(o) {
  return [
    { ref_id: o.orderId, ref_type: "ORDER" },
    { ref_id: o.provId || o.prov?.id, ref_type: "PROVIDER" },
    { ref_id: o.fid, ref_type: "FULFILLMENT" },
    { ref_id: o.itemId || o.item?.id, ref_type: "ITEM" },
  ];
}
// Pramaan's igm2.0.0 validator requires ref_id (string) on EVERY action — ref the issue id.
function igm2Action(id, code, shortDesc, t, refId) {
  return { id, ref_id: refId, descriptor: { code, short_desc: shortDesc }, updated_at: t, action_by: A_INTERFACING, actor_details: { name: "pay2 Cash" } };
}
function igm2OpenBody(o, issueId, t) {
  return {
    context: ctx("issue", o.txn, o.bpp),
    message: {
      issue: {
        id: issueId, status: "OPEN", level: "ISSUE",
        created_at: t, updated_at: t, // OPEN: updated_at === created_at
        expected_response_time: { duration: "PT2H" },
        expected_resolution_time: { duration: "P1D" },
        refs: igm2Refs(o),
        actors: igm2Actors(o.bpp),
        source_id: A_CONSUMER, complainant_id: A_INTERFACING, respondent_ids: [A_COUNTERPARTY],
        descriptor: {
          code: "ITM02", short_desc: "Item quality issue", long_desc: "Item received not as described",
          additional_desc: { url: "https://ondc.pay2.cash/igm/" + issueId + ".txt", content_type: "text/plain" },
          images: [{ url: "https://ondc.pay2.cash/igm/" + issueId + ".jpg", size_type: "sm" }],
        },
        last_action_id: "action-open-1",
        actions: [igm2Action("action-open-1", "OPEN", "Issue opened", t, issueId)],
      },
      // Pramaan igm2.0.0 validator requires message.update_target (array) on every issue call.
      update_target: [{ path: "issue.actions", action: "APPENDED" }],
    },
  };
}
// Latest seller on_issue's issue object (carries the full actions[] + any resolutions[]).
function latestOnIssue2(txn) {
  const rows = readAllCallbacks("on_issue", txn);
  for (let i = rows.length - 1; i >= 0; i--) { const is = rows[i]?.message?.issue; if (is) return is; }
  return null;
}
// Build a buyer response by ECHOING the seller's latest issue and APPENDING our action.
function igm2RespondBody(o, base, { code, shortDesc, status }) {
  const t = now();
  const actId = `action-${code.toLowerCase().replace(/_/g, "-")}-${Date.now()}`;
  // Sanitize the seller's echoed actions: the schema requires descriptor.short_desc on
  // EVERY action, but the Pramaan mock omits it on some (e.g. RESOLUTION_PROPOSED) — backfill
  // so our echoed payload stays schema-valid (the 6d failure: actions[5].short_desc missing).
  const prior = (base.actions || []).map((a) => ({
    ...a,
    ref_id: a.ref_id || base.id, // validator requires ref_id on every action (seller omits it)
    descriptor: { ...(a.descriptor || {}), code: a.descriptor?.code, short_desc: a.descriptor?.short_desc || a.descriptor?.code || "action" },
    actor_details: a.actor_details || { name: "Seller" },
  }));
  const actions = [...prior, igm2Action(actId, code, shortDesc, t, base.id)];
  const issue = { ...base, status: status || base.status, updated_at: t, last_action_id: actId, actions };
  // Ensure our linkage/refs/actors survive even if the seller echoed differently.
  issue.source_id = issue.source_id || A_CONSUMER;
  issue.complainant_id = issue.complainant_id || A_INTERFACING;
  if (!issue.actors) issue.actors = igm2Actors(o.bpp);
  if (!issue.refs) issue.refs = igm2Refs(o);
  return { context: ctx("issue", o.txn, o.bpp), message: { update_target: [{ path: "issue.actions", action: "APPENDED" }], issue } };
}
function loadIgm2() {
  const c = loadOrderCtx(IGM2_SCENARIO);
  const ig = JSON.parse(readFileSync(new URL(`../ondc-logs/RET10/${IGM2_SCENARIO}/_igm2.json`, import.meta.url), "utf8"));
  return { o: { ...c, bpp: c.bpp, prov: { id: c.provId }, item: { id: c.itemId } }, ig };
}

// PHASE 1: place order, send issue(OPEN) in 2.0 form. Run AFTER clicking Start on the console.
async function scenarioIgm2Open() {
  console.log("=== IGM 2.0 OPEN: place order + issue(OPEN) ===");
  cleanScenario(IGM2_SCENARIO);
  const o = await runOrder(uuid(), { prepaid: true });
  if (!o) return flush(IGM2_SCENARIO);
  const issueId = uuid();
  const createdAt = now();
  saveOrderCtx(IGM2_SCENARIO, o);
  writeFileSync(new URL(`../ondc-logs/RET10/${IGM2_SCENARIO}/_igm2.json`, import.meta.url), JSON.stringify({ issueId, createdAt, txn: o.txn }, null, 2));
  await leg("issue", igm2OpenBody(o, issueId, createdAt), o.txn, { tries: 10 });
  flush(IGM2_SCENARIO);
  console.log(`\n  🧾 IGM2 ISSUE OPENED  issue_id=${issueId}  txn=${o.txn}`);
  console.log("  → On the console, click 'Request Info'. Then run: node scripts/ondc-flow.mjs igm2-info");
}
// Re-send issue(OPEN) on the SAME txn/issue_id after the console Start (console tracks
// issue_open only post-Start). Fresh timestamps keep updated_at===created_at<=context.ts.
async function scenarioIgm2Reopen() {
  console.log("=== IGM 2.0 RE-OPEN: re-send issue(OPEN) post-console-start ===");
  const { o, ig } = loadIgm2();
  const t = now();
  console.log(`  txn=${o.txn} issue_id=${ig.issueId}`);
  await leg("issue", igm2OpenBody(o, ig.issueId, t), o.txn, { tries: 10 });
  flush(IGM2_SCENARIO);
  console.log("  → Console should advance issue_open (~33%). Then click 'Request Info' and run: igm2-info");
}
// PHASE 2: respond to the seller's Request Info with INFO_PROVIDED (echo+append).
async function scenarioIgm2Info() {
  console.log("=== IGM 2.0 INFO_PROVIDED ===");
  const { o } = loadIgm2();
  const base = latestOnIssue2(o.txn);
  if (!base) { console.log("  ✗ no seller on_issue captured yet — click 'Request Info' first"); return; }
  await leg("issue_info_provided", igm2RespondBody(o, base, { code: "INFO_PROVIDED", shortDesc: "Requested information provided", status: "PROCESSING" }), o.txn, { sendAs: "issue", cbAs: "issue", cbFile: "on_issue_info", tries: 10 });
  flush(IGM2_SCENARIO);
  console.log("  → On the console, click 'Send Resolution'. Then run: node scripts/ondc-flow.mjs igm2-accept");
}
// PHASE 3: accept the seller's proposed resolution (echo carries resolutions[]).
async function scenarioIgm2Accept() {
  console.log("=== IGM 2.0 RESOLUTION_ACCEPTED ===");
  const { o } = loadIgm2();
  const base = latestOnIssue2(o.txn);
  if (!base) { console.log("  ✗ no seller on_issue captured"); return; }
  if (!base.resolutions?.length) console.log("  ⚠ seller on_issue has no resolutions[] yet — click 'Send Resolution' first");
  await leg("issue_resolution_accepted", igm2RespondBody(o, base, { code: "RESOLUTION_ACCEPTED", shortDesc: "Resolution accepted", status: "RESOLVED" }), o.txn, { sendAs: "issue", cbAs: "issue", cbFile: "on_issue_accept", tries: 10 });
  flush(IGM2_SCENARIO);
  console.log("  → Then close: node scripts/ondc-flow.mjs igm2-close");
}
// PHASE 3.5: issue_status — buyer pulls status (fills the console ring to 100%) before close.
async function scenarioIgm2Status() {
  console.log("=== IGM 2.0 issue_status ===");
  const { o, ig } = loadIgm2();
  await leg("issue_status", { context: ctx("issue_status", o.txn, o.bpp), message: { issue_id: ig.issueId } }, o.txn, { sendAs: "issue_status", cbAs: "issue_status", cbFile: "on_issue_status", tries: 10 });
  flush(IGM2_SCENARIO);
  console.log("  → Then close: node scripts/ondc-flow.mjs igm2-close");
}
// PHASE 4: close the issue (CLOSED).
async function scenarioIgm2Close() {
  console.log("=== IGM 2.0 CLOSED ===");
  const { o } = loadIgm2();
  const base = latestOnIssue2(o.txn);
  if (!base) { console.log("  ✗ no seller on_issue captured"); return; }
  await leg("issue_closed", igm2RespondBody(o, base, { code: "CLOSED", shortDesc: "Issue closed", status: "CLOSED" }), o.txn, { sendAs: "issue", cbAs: "issue", cbFile: "on_issue_closed", tries: 10 });
  flush(IGM2_SCENARIO);
  console.log(`\n  ✅ IGM 2.0 lifecycle complete`);
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
  "flow5-start": scenarioFlow5Start,   // Flow 5: Out of stock — phase 1
  "flow5-finish": scenarioFlow5Finish, // Flow 5: Out of stock — phase 2
  "flow3a-start": flow3A.start,   // Flow 3A: Merchant partial cancel — phase 1
  "flow3a-finish": flow3A.finish, // Flow 3A: Merchant partial cancel — phase 2
  "flow3b-start": flow3B.start,   // Flow 3B: Merchant full cancel / RTO — phase 1
  "flow3b-finish": flow3B.finish, // Flow 3B: Merchant full cancel / RTO — phase 2
  "flow3c-start": flow3C.start,   // Flow 3C: Merchant full cancel — phase 1
  "flow3c-finish": flow3C.finish, // Flow 3C: Merchant full cancel — phase 2
  "flow4a-start": flow4A.start,     // Flow 4A: Buyer return (full) — place order
  "flow4a-deliver": flow4A.deliver, // Flow 4A: capture delivery + send return
  "flow4a-finish": flow4A.finish,   // Flow 4A: capture return states
  "flow4b-start": flow4B.start,     // Flow 4B: Buyer return (partial) — place order qty2
  "flow4b-deliver": flow4B.deliver, // Flow 4B: capture delivery + send partial return
  "flow4b-finish": flow4B.finish,   // Flow 4B: capture return states
  "flow7-start": scenarioFlow7Start,   // Flow 7: place non-cancellable order
  "flow7-cancel": scenarioFlow7Cancel, // Flow 7: cancel attempt → expect NACK
  flow8a: scenarioFlow8A,   // Flow 8A: Full catalog refresh (search-only)
  flow8b: scenarioFlow8B,   // Flow 8B: Incremental catalog PULL
  flow8c: scenarioFlow8C,   // Flow 8C: Incremental catalog PUSH
  flow9: scenarioFlow9,     // Flow 9: Catalog Rejection
  update: scenarioUpdate,
  igm: scenarioIGM,                    // IGM one-shot (mock only): start + status
  "igm-start": scenarioIgmStart,       // IGM 6A/6B phase 1: place order + raise issue
  "igm-reopen": scenarioIgmReopen,     // IGM 2.0: re-send issue(open) after console Start
  "igm-status": scenarioIgmStatus,     // IGM phase 2: issue_status + capture resolution
  "igm-escalate": scenarioIgmEscalate, // IGM 6B: escalate to grievance
  "igm-close": scenarioIgmClose,       // IGM phase 3: close issue + rating
  "igm2-open": scenarioIgm2Open,       // IGM 2.0 (6b–6e): place order + issue(OPEN)
  "igm2-reopen": scenarioIgm2Reopen,   // IGM 2.0: re-send issue(OPEN) after console Start
  "igm2-info": scenarioIgm2Info,       // IGM 2.0: INFO_PROVIDED (after Request Info)
  "igm2-accept": scenarioIgm2Accept,   // IGM 2.0: RESOLUTION_ACCEPTED (after Send Resolution)
  "igm2-status": scenarioIgm2Status,   // IGM 2.0: issue_status (fills ring to 100%)
  "igm2-close": scenarioIgm2Close,     // IGM 2.0: CLOSED
};
if (cmd === "track-rating") {
  await trackRating(process.argv[3], process.argv[4]);
} else if (cmd === "all") {
  for (const s of [scenarioFlow1A, scenarioCancel, scenarioFlow9]) { await s(); }
} else if (scenarios[cmd]) {
  await scenarios[cmd]();
} else {
  console.log("usage: node ondc-flow.mjs [flow1a|flow1a-start|flow1a-finish|flow2|flow9|update|igm|igm-start|igm-status|igm-escalate|igm-close|all]");
}
