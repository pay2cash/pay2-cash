// Smoke probe: send ONE signed `search` to the Pramaan mock and print the sync ACK.
// Read-only — writes no log files, places no order, touches no saved certification data.
// Usage: node worker/scripts/ondc-probe-search.mjs
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET10/1.2.5/seller";
const BAP_ID = "ondc.pay2.cash";
const BAP_URI = "https://ondc.pay2.cash/ondc";
const DOMAIN = "ONDC:RET10";
const CITY = process.env.ONDC_CITY || "std:0124";

const body = {
  context: {
    domain: DOMAIN,
    country: "IND",
    city: CITY,
    core_version: "1.2.5",
    action: "search",
    transaction_id: crypto.randomUUID(),
    message_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    bap_id: BAP_ID,
    bap_uri: BAP_URI,
    ttl: "PT30S",
  },
  message: {
    intent: {
      fulfillment: { type: "Delivery" },
      payment: {
        "@ondc/org/buyer_app_finder_fee_type": "percent",
        "@ondc/org/buyer_app_finder_fee_amount": "3",
      },
      tags: [{ code: "catalog_full", list: [{ code: "payload_type", value: "inline" }] }],
    },
  },
};

const raw = JSON.stringify(body);
const { header } = createAuthorizationHeader(raw);
const t0 = Date.now();
const res = await fetch(`${MOCK}/search`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: header },
  body: raw,
});
const text = await res.text();
console.log(`POST ${MOCK}/search → HTTP ${res.status} in ${Date.now() - t0}ms`);
console.log("resp headers:", JSON.stringify(Object.fromEntries([...res.headers].filter(([k]) => /content|server|cf|date/i.test(k))), null, 1));
try {
  const json = JSON.parse(text);
  console.log("sync ack:", JSON.stringify(json?.message?.ack ?? json).slice(0, 400));
  console.log("full body:", JSON.stringify(json).slice(0, 600));
  console.log(json?.message?.ack?.status === "ACK"
    ? "✓ Mock seller accepted our signed search — BAP identity + signing verified."
    : "✗ Unexpected sync response.");
} catch {
  console.log("body:", text.slice(0, 600));
}
