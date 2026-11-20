// Pre-flight a saved payload against the ONIX standalone validator oracle.
// POST {base}/{domain}/{version}/test/{action} — validates L0+L1, stores nothing,
// creates no session (verified side-effect-free upstream). No signature needed.
// Usage: node workbench-validate.mjs <payload.json> [action]
import { readFileSync } from "node:fs";

const file = process.argv[2];
const action = process.argv[3] || JSON.parse(readFileSync(file, "utf8")).context.action;
const base =
  process.env.PRAMAAN_MOCK?.replace(/\/seller$/, "") ||
  "https://workbench.ondc.tech/api-service";
const url = `${base}/ONDC:RET10/1.2.5/test/${action}`;

const raw = readFileSync(file, "utf8");
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "text/plain" },
  body: raw,
});
const text = await res.text();
let ack = "", err = "";
try {
  const j = JSON.parse(text);
  ack = j?.message?.ack?.status ?? "";
  err = j?.error?.message ?? "";
} catch {}
console.log(`POST ${url} → HTTP ${res.status} ack=${ack}`);
if (ack === "ACK") console.log("✓ payload is L0+L1 valid");
else if (err) console.log(err.slice(0, 3000));
else console.log(text.slice(0, 1000));
