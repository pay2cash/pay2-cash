// Search-first watch for workbench flows that open with `search`
// (Catalog_Rejection, Discovery variants). Fires the flow's published search
// shape every 20s until the armed expectation accepts it.
// Usage: node workbench-search-watch.mjs [tries]
import crypto from "node:crypto";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const DOMAIN = process.env.WB_DOMAIN || "ONDC:RET10";
const MOCK =
  process.env.PRAMAAN_MOCK ||
  `https://workbench.ondc.tech/api-service/${DOMAIN}/1.2.5/seller`;
const SEARCH_MODE = process.env.SEARCH_MODE || "full"; // "full" | "inc"
const TRIES = Number(process.argv[2] || 60);
const DELAY_MS = 20_000;
const txn = crypto.randomUUID();
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const body = SEARCH_MODE === "inc"
  ? {
      context: {
        domain: DOMAIN,
        action: "search",
        timestamp: new Date().toISOString(),
        transaction_id: txn,
        message_id: crypto.randomUUID(),
        bap_id: process.env.WB_BAP_ID || "ondc.agentbuy.online",
        bap_uri: "https://ondc.agentbuy.online/ondc",
        ttl: "PT30S",
        country: "IND",
        city: "std:080",
        core_version: "1.2.5",
      },
      message: {
        intent: {
          payment: {
            "@ondc/org/buyer_app_finder_fee_type": "percent",
            "@ondc/org/buyer_app_finder_fee_amount": "3",
          },
          tags: [{ code: "catalog_inc", list: [{ code: "mode", value: "start" }] }],
        },
      },
    }
  : {
  context: {
    domain: DOMAIN,
    action: "search",
    timestamp: new Date().toISOString(),
    transaction_id: txn,
    message_id: crypto.randomUUID(),
    bap_id: process.env.WB_BAP_ID || "ondc.agentbuy.online",
    bap_uri: "https://ondc.agentbuy.online/ondc",
    ttl: "PT30S",
    country: "IND",
    city: "std:080",
    core_version: "1.2.5",
  },
  message: {
    intent: {
      payment: {
        "@ondc/org/buyer_app_finder_fee_type": "percent",
        "@ondc/org/buyer_app_finder_fee_amount": "3",
      },
      tags: [
        {
          code: "bap_terms",
          list: [
            { code: "static_terms", value: "https://ondc.agentbuy.online/terms" },
            { code: "static_terms_new", value: "https://github.com/ONDC-Official/NP-Static-Terms/buyerNP_BNP/1.0/tc.pdf" },
            { code: "effective_date", value: new Date().toISOString() },
          ],
        },
        {
          code: "bap_features",
          list: [
            { code: "001", value: "yes" },
            { code: "001", value: "yes" },
          ],
        },
      ],
    },
  },
};

for (let i = 1; i <= TRIES; i++) {
  body.context.timestamp = new Date().toISOString();
  body.context.message_id = crypto.randomUUID();
  const payload = JSON.stringify(body);
  const { header } = createAuthorizationHeader(payload);
  let res, text;
  try {
    res = await fetch(`${MOCK}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: header },
      body: payload,
    });
    text = await res.text();
  } catch (e) {
    log(`try ${i}/${TRIES}: transport error ${e.cause?.code ?? e.message}`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    continue;
  }
  let ack = "";
  try { ack = JSON.parse(text)?.message?.ack?.status ?? ""; } catch {}
  if (res.status === 200 && ack === "ACK") {
    log(`✓ ACCEPTED on try ${i}/${TRIES} — transaction ${txn} is LIVE`);
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
