// One-shot: send the Buyer_Delivery_Flow's first action (select) to the ONIX
// workbench and print the sync ACK. Mirrors the flow's published example payload
// with OUR BAP identity. Usage: node workbench-select.mjs [txnId]
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET10/1.2.5/seller";
const txn = process.argv[2] || crypto.randomUUID();

const body = {
  context: {
    domain: "ONDC:RET10",
    action: "select",
    timestamp: new Date().toISOString(),
    transaction_id: txn,
    message_id: crypto.randomUUID(),
    bap_id: process.env.WB_BAP_ID || "ondc.agentbuy.online",
    bap_uri: "https://ondc.agentbuy.online/ondc",
    ttl: "PT30S",
    bpp_id: "sample-bpp-id",
    bpp_uri: "https://bpp.example.com",
    country: "IND",
    city: "std:011",
    core_version: "1.2.5",
  },
  message: {
    order: {
      provider: { id: "P1", locations: [{ id: "L1" }] },
      items: [{ id: "I1", quantity: { count: 1 }, location_id: "L1" }],
      fulfillments: [
        {
          end: {
            location: { gps: "19.129076,72.825803", address: { area_code: "400053" } },
          },
        },
      ],
    },
  },
};

const raw = JSON.stringify(body);
const { header } = createAuthorizationHeader(raw);
const res = await fetch(`${MOCK}/select`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: header },
  body: raw,
});
const text = await res.text();
console.log(`txn=${txn}`);
console.log(`POST ${MOCK}/select → HTTP ${res.status}`);
console.log(text.slice(0, 800));
