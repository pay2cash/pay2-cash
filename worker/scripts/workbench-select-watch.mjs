// Retry loop for the workbench Buyer_Delivery_Flow: fire the first `select` every
// 20s until the workbench accepts it (expectation armed) or the bound is hit.
// 412s are harmless NACKs; the first armed expectation consumes the select and
// the transaction begins. Usage: node workbench-select-watch.mjs [tries]
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const DOMAIN = process.env.WB_DOMAIN || "ONDC:RET10";
const MOCK =
  process.env.PRAMAAN_MOCK ||
  `https://workbench.ondc.tech/api-service/${DOMAIN}/1.2.5/seller`;
const TRIES = Number(process.argv[2] || 45); // ~15 min at 20s
const DELAY_MS = 20_000;
const txn = crypto.randomUUID();
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const body = {
  context: {
    domain: DOMAIN,
    action: "select",
    timestamp: new Date().toISOString(),
    transaction_id: txn,
    message_id: crypto.randomUUID(),
    bap_id: process.env.WB_BAP_ID || "ondc.agentbuy.online",
    bap_uri: process.env.WB_BAP_URI || "https://ondc.agentbuy.online/ondc",
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

for (let i = 1; i <= TRIES; i++) {
  // refresh timestamp + message_id per attempt (time validations are on).
  body.context.timestamp = new Date().toISOString();
  body.context.message_id = crypto.randomUUID();
  const payload = JSON.stringify(body);
  const { header: h } = createAuthorizationHeader(payload);
  let res, text;
  try {
    res = await fetch(`${MOCK}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: h },
      body: payload,
    });
    text = await res.text();
  } catch (e) {
    log(`try ${i}/${TRIES}: transport error ${e.message}`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    continue;
  }
  let ack = "";
  try { ack = JSON.parse(text)?.message?.ack?.status ?? ""; } catch {}
  if (res.status === 200 && ack === "ACK") {
    log(`✓ ACCEPTED on try ${i}/${TRIES} — transaction ${txn} is LIVE`);
    // Hand the txn to the follow-on driver (chained via _txn.txt).
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const dir = new URL("../ondc-logs/RET10/workbench_buyer_delivery/", import.meta.url).pathname;
    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + "_txn.txt", txn);
    console.log(text.slice(0, 500));
    process.exit(0);
  }
  const isExpectation = /No active expectation/.test(text);
  log(`try ${i}/${TRIES}: HTTP ${res.status} ${ack || "NACK"}${isExpectation ? " (no expectation yet)" : " — " + text.slice(0, 220)}`);
  await new Promise((r) => setTimeout(r, DELAY_MS));
}
log(`bound reached without acceptance — stopping`);
process.exit(1);
