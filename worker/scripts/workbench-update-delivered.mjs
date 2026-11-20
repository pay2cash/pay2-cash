// One-shot: send the final update_delivered for a live workbench transaction.
// Mirrors the flow's published update example. Retries on transport errors.
// Usage: node workbench-update-delivered.mjs <txn> <orderId> <fulfillmentId>
import { writeFileSync, mkdirSync } from "node:fs";
import { createAuthorizationHeader } from "./ondc-sign.mjs";

const MOCK =
  process.env.PRAMAAN_MOCK ||
  "https://workbench.ondc.tech/api-service/ONDC:RET10/1.2.5/seller";
const [txn, orderId, fid] = [process.argv[2], process.argv[3], process.argv[4] || "F3"];
if (!txn || !orderId) {
  console.error("usage: workbench-update-delivered.mjs <txn> <orderId> [fid]");
  process.exit(1);
}

const mk = () => ({
  context: {
    domain: "ONDC:RET10",
    country: "IND",
    city: "std:011",
    core_version: "1.2.5",
    action: "update",
    transaction_id: txn,
    message_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    bap_id: process.env.WB_BAP_ID || "ondc.agentbuy.online",
    bap_uri: "https://ondc.agentbuy.online/ondc",
    bpp_id: "sample-bpp-id",
    bpp_uri: "https://bpp.example.com",
    ttl: "PT30S",
  },
  message: {
    update_target: "fulfillment",
    order: {
      id: orderId,
      fulfillments: [
        {
          id: fid,
          tags: [
            { code: "update_state", list: [{ code: "state", value: "Order-delivered" }] },
            {
              code: "update_fulfillment_time",
              list: [
                { code: "state", value: "Order-delivered" },
                { code: "timestamp", value: new Date().toISOString() },
              ],
            },
          ],
        },
      ],
    },
  },
});

for (let i = 1; i <= 5; i++) {
  const body = mk();
  const raw = JSON.stringify(body);
  const { header } = createAuthorizationHeader(raw);
  try {
    const res = await fetch(`${MOCK}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: header },
      body: raw,
    });
    const text = await res.text();
    let ack = "", err = "";
    try {
      const j = JSON.parse(text);
      ack = j?.message?.ack?.status ?? "";
      err = j?.error?.message ?? "";
    } catch {}
    console.log(`try ${i}: HTTP ${res.status} ack=${ack}${err ? " — " + String(err).slice(0, 800) : ""}`);
    if (res.status === 200 && ack === "ACK") {
      const dir = new URL("../ondc-logs/RET10/workbench_buyer_delivery/", import.meta.url).pathname;
      mkdirSync(dir, { recursive: true });
      writeFileSync(dir + "update_delivered.json", JSON.stringify(body, null, 2) + "\n");
      console.log("✓ update_delivered accepted — flow complete");
      process.exit(0);
    }
    if (err) process.exit(1); // protocol NACK — don't hammer
  } catch (e) {
    console.log(`try ${i}: transport error ${e.cause?.code ?? e.message}`);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
process.exit(1);
