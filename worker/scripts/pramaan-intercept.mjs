// Pramaan console intercept harness (Playwright, headed).
//
// Diagnostic for the Flow 3C console bug: the buyer console posts runTest with
// flow_id "RET_4c" (a 1.2.0-only flow) but version "1.2.5", so the server NACKs
// "No test flow configured". This intercepts that single call and rewrites the
// body to align version → "1.2.0" (the version RET_4c is actually registered at),
// forwards it, and logs the server's real ACK/NACK response. We then watch our
// worker for an inbound on_cancel. This automates YOUR OWN cert sandbox session.
//
// Usage: node scripts/pramaan-intercept.mjs "<buyer-console-url>"

import { chromium } from "playwright";
import { mkdirSync, appendFileSync } from "node:fs";

const URL_ARG = process.argv[2] || "https://pramaan.ondc.org/beta/preprod/gui/iframe";
const OUT = new URL("../pramaan-capture/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const LOG = OUT + "intercept.jsonl";

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Intercept ONLY the runTest POST; rewrite version to 1.2.0 for RET_4c, forward,
// and surface the server's response.
await page.route("**/testing/buyer/runTest", async (route) => {
  const req = route.request();
  let body = req.postData() || "{}";
  let mutated = body;
  try {
    const j = JSON.parse(body);
    const isRet4c = (j.tests || []).some((t) => t.flow_id === "RET_4c");
    if (isRet4c) {
      j.version = "1.2.0";              // align to the version RET_4c is registered at
      mutated = JSON.stringify(j);
      console.log(`\n[intercept] rewrote version 1.2.5 -> 1.2.0 for RET_4c`);
      console.log(`[intercept] body: ${mutated}`);
    }
  } catch (e) { console.log("[intercept] parse err", e.message); }

  const res = await route.fetch({ postData: mutated });
  const text = await res.text();
  console.log(`[intercept] server ${res.status()} -> ${text.slice(0, 300)}`);
  appendFileSync(LOG, JSON.stringify({ t: Date.now(), sent: mutated, status: res.status(), resp: text.slice(0, 1000) }) + "\n");
  await route.fulfill({ response: res, body: text });
});

console.log(`\nOpening ${URL_ARG}`);
console.log("Log in, select the transaction, and click Start on the merchant-cancel (3C) card.");
console.log("The runTest call will be intercepted + version-corrected automatically.\n");

await page.goto(URL_ARG, { waitUntil: "domcontentloaded" }).catch((e) => console.log("goto:", e.message));
await new Promise((resolve) => { browser.on("disconnected", resolve); page.on("close", resolve); });
await ctx.close().catch(() => {});
await browser.close().catch(() => {});
