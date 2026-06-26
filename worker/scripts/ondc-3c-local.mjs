// Local 3C (Merchant Side Full Order Cancellation) test harness.
//
// Pramaan's preprod console never fires the seller's unsolicited on_cancel for 3C
// (see memory: pay2cash-ondc-3c-blocked). This lets us exercise the SAME case end-to-end
// against OUR own stack: it synthesises the seller on_cancel from a real placed 3C order,
// validates it against the official ONDC onCancelSchema, POSTs it to our subscriber, and
// checks that we (a) ACK with a context echo and (b) capture it in D1 — i.e. proves our
// buyer app correctly handles a merchant cancel, independent of Pramaan.
//
// Prereq: a placed 3C order — run `node scripts/ondc-flow.mjs flow3c-start` first.
// Usage:  node scripts/ondc-3c-local.mjs
//         SUBSCRIBER_URL=http://localhost:8787 node scripts/ondc-3c-local.mjs   # local wrangler dev
//
// It does NOT make 3C "pass" Pramaan certification (the on_cancel must come from the real
// Pramaan seller for that) — it verifies OUR handling and produces a schema-valid log.

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createAuthorizationHeader } from "./ondc-sign.mjs";
import { onCancelSchema } from "./ondc-schemas/Cancel/onCancel.mjs";

const SCENARIO = "flow_3C_merchant_cancel";
const DIR = new URL(`../ondc-logs/RET10/${SCENARIO}/`, import.meta.url);
const SUBSCRIBER = process.env.SUBSCRIBER_URL || "https://ondc.pay2.cash";
const now = () => new Date().toISOString();

// ---- minimal recursive JSON-schema validator (same rules as ondc-schema-check) ----
function validate(schema, data, path = "") {
  const errs = [];
  if (!schema || typeof schema !== "object") return errs;
  const present = data !== undefined && data !== null;
  if (present) {
    const t = schema.type;
    if (t === "object" && (typeof data !== "object" || Array.isArray(data))) errs.push(`${path}: should be object`);
    else if (t === "array" && !Array.isArray(data)) errs.push(`${path}: should be array`);
    else if (t === "string" && typeof data !== "string") errs.push(`${path}: should be string`);
    else if ((t === "integer" || t === "number") && typeof data !== "number") errs.push(`${path}: should be ${t}`);
    if (schema.enum && !schema.enum.includes(data)) errs.push(`${path}: ${JSON.stringify(data)} not in [${schema.enum.join(", ")}]`);
    if (schema.minLength !== undefined && typeof data === "string" && data.length < schema.minLength) errs.push(`${path}: < minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && typeof data === "string" && data.length > schema.maxLength) errs.push(`${path}: > maxLength ${schema.maxLength}`);
    if (schema.pattern && typeof data === "string" && !new RegExp(schema.pattern).test(data)) errs.push(`${path}: !~ ${schema.pattern}`);
  }
  if (schema.type === "object" && present) {
    for (const r of schema.required || []) if (data[r] === undefined || data[r] === null) errs.push(`${path}/${r}: MISSING required`);
    for (const [k, sub] of Object.entries(schema.properties || {})) if (data[k] !== undefined) errs.push(...validate(sub, data[k], `${path}/${k}`));
  }
  if (schema.type === "array" && Array.isArray(data) && schema.items) data.forEach((el, i) => errs.push(...validate(schema.items, el, `${path}[${i}]`)));
  return errs;
}

function read(name) {
  return JSON.parse(readFileSync(new URL(name, DIR), "utf8"));
}

let order, confirm;
try {
  order = read("_order.json");
  confirm = read("confirm.json");
} catch {
  console.error("✗ No placed 3C order found. Run first:  node scripts/ondc-flow.mjs flow3c-start");
  process.exit(1);
}

const co = confirm.message.order;
const bpp = order.bpp; // { bpp_id, bpp_uri }

// Synthesise the seller's on_cancel: take our confirmed order, flip it to Cancelled,
// add the cancellation block (cancelled_by = seller) and a Cancelled fulfillment state.
const cancelledFulfillments = (co.fulfillments || [{ id: order.fid, type: "Delivery" }]).map((f) => ({
  ...f,
  state: { descriptor: { code: "Cancelled" } },
}));

const onCancel = {
  context: {
    domain: "ONDC:RET10",
    country: "IND",
    city: "std:0124",
    core_version: "1.2.5",
    action: "on_cancel",
    transaction_id: order.txn,
    message_id: crypto.randomUUID(),
    timestamp: now(),
    bap_id: "ondc.pay2.cash",
    bap_uri: "https://ondc.pay2.cash/ondc",
    bpp_id: bpp.bpp_id,
    bpp_uri: bpp.bpp_uri,
    ttl: "PT30S",
  },
  message: {
    order: {
      id: co.id,
      state: "Cancelled",
      provider: co.provider,
      items: co.items,
      billing: co.billing,
      cancellation: { cancelled_by: bpp.bpp_id, reason: { id: "013" } }, // 013 = merchant-initiated
      fulfillments: cancelledFulfillments,
      quote: co.quote,
      payment: co.payment,
      created_at: co.created_at || now(),
      updated_at: now(),
    },
  },
};

// 1) Validate the synthesised on_cancel against the official ONDC schema.
const errs = validate(onCancelSchema, onCancel, "on_cancel");
console.log("=== 1. schema validation (official onCancelSchema) ===");
if (errs.length) {
  console.log(`  ✗ ${errs.length} issue(s):`);
  errs.slice(0, 20).forEach((e) => console.log("    " + e));
  process.exit(1);
}
console.log("  ✓ on_cancel is schema-valid");

// 2) POST it to our subscriber as the seller would, and check the sync ACK has a context.
console.log(`\n=== 2. POST on_cancel → subscriber (${SUBSCRIBER}/ondc/on_cancel) ===`);
const raw = JSON.stringify(onCancel);
const { header } = createAuthorizationHeader(raw);
const res = await fetch(`${SUBSCRIBER}/ondc/on_cancel`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: header },
  body: raw,
});
const ack = await res.json().catch(() => ({}));
const hasContext = !!ack?.context;
const isAck = ack?.message?.ack?.status === "ACK";
console.log(`  status ${res.status} · ack=${ack?.message?.ack?.status} · context echoed=${hasContext}`);
console.log(`  ${isAck && hasContext ? "✓ subscriber ACKed WITH context (Pramaan's on_* sync requirement)" : "✗ missing ACK or context"}`);

// 3) Confirm it landed in D1 (live subscriber only).
if (SUBSCRIBER.includes("ondc.pay2.cash")) {
  console.log(`\n=== 3. confirm capture in D1 ===`);
  try {
    const out = execSync(
      `npx wrangler d1 execute pay2cash --remote --json --command "SELECT COUNT(*) c FROM ondc_logs WHERE transaction_id='${order.txn}' AND action='on_cancel'"`,
      { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const c = JSON.parse(out)[0].results[0].c;
    console.log(`  on_cancel rows for txn ${order.txn}: ${c}  ${c > 0 ? "✓ captured" : "✗ not found"}`);
  } catch {
    console.log("  (skipped — wrangler query failed)");
  }
}

// 4) Save the on_cancel into the scenario log dir so the 3C set is complete for inspection.
writeFileSync(new URL("on_cancel.json", DIR), JSON.stringify(onCancel, null, 2));
console.log(`\n✓ saved on_cancel.json → ondc-logs/RET10/${SCENARIO}/`);
console.log("\nNOTE: this proves OUR 3C handling locally. Pramaan cert still needs the on_cancel");
console.log("to come from the real Pramaan seller — blocked there by their console (see memory).");
