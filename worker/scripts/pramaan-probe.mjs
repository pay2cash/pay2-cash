// Pramaan 3C deep-probe (Playwright, headed).
//
// Goal: drive Flow 3C and capture EVERYTHING the console does "from the request
// onwards" — every Pramaan API request + RESPONSE body (to find the malformed
// RET_4c test-data that crashes BuyerNp.tsx:353), while:
//   • rewriting runTest version 1.2.5 -> 1.2.0 (past the backend NACK), and
//   • injecting a global error suppressor so the undefined.action throw doesn't
//     halt the rest of the page JS (best-effort — the stage list may still be empty).
//
// Output: worker/pramaan-capture/probe.jsonl  (requests, responses, runTest rewrite).
// Watch our worker in parallel: npx wrangler tail.

import { chromium } from "playwright";
import { mkdirSync, appendFileSync } from "node:fs";

const URL_ARG = process.argv[2] || "https://pramaan.ondc.org/beta/preprod/gui/iframe";
const OUT = new URL("../pramaan-capture/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const LOG = OUT + "probe.jsonl";
const rec = (o) => appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...o }) + "\n");

const SKIP = /\.(js|css|png|jpg|jpeg|svg|woff2?|ico|map|gif)(\?|$)/i;
const isPramaan = (u) => /pramaan\.ondc\.org|analytics-api|registry\.ondc/i.test(u) && !/google|gtm|analytics\.js/i.test(u);
// Endpoints whose RESPONSE body we want to inspect (test-data / flow-data sources).
const WANT_RESP = /runTest|lookup|buyerconsole|transactionID|flow-data|fetch-flow|testcase|getTest|dashboard/i;

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

// Keep page JS alive past the BuyerNp.tsx:353 `undefined.action` throw so we can
// observe whatever requests would follow.
await ctx.addInitScript(() => {
  window.addEventListener("error", (e) => { try { console.log("[probe] suppressed error:", e.message); } catch {} e.preventDefault?.(); }, true);
  window.addEventListener("unhandledrejection", (e) => { try { console.log("[probe] suppressed rejection:", e.reason?.message || e.reason); } catch {} e.preventDefault?.(); });
});

const page = await ctx.newPage();

// Intercept Pramaan API calls: rewrite runTest version, capture request+response.
await page.route((u) => isPramaan(u.toString()) && !SKIP.test(u.toString()), async (route) => {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  if (method === "OPTIONS") return route.continue();
  let body = null; try { body = req.postData(); } catch {}

  // Rewrite runTest 1.2.5 -> 1.2.0 for RET_4c.
  let sendBody = body;
  if (/runTest/.test(url) && body) {
    try { const j = JSON.parse(body); if ((j.tests || []).some((t) => t.flow_id === "RET_4c")) { j.version = "1.2.0"; sendBody = JSON.stringify(j); rec({ kind: "rewrite", note: "version 1.2.5->1.2.0", body: sendBody }); } } catch {}
  }

  try {
    const res = await route.fetch(sendBody !== body ? { postData: sendBody } : {});
    const status = res.status();
    let respText = null;
    if (WANT_RESP.test(url)) { try { respText = (await res.text()).slice(0, 2000); } catch {} }
    rec({ kind: "http", method, url: url.split("?")[0], reqBody: body?.slice(0, 1500) || null, status, respBody: respText });
    console.log(`→ ${method} ${url.split("?")[0]} [${status}]${respText ? "  resp:" + respText.slice(0, 120) : ""}`);
    await route.fulfill({ response: res });
  } catch (e) {
    rec({ kind: "error", url: url.split("?")[0], msg: e.message });
    try { await route.continue(); } catch {}
  }
});

// Surface page console errors (the BuyerNp.tsx ones) into our log.
page.on("console", (m) => { const t = m.text(); if (/error|undefined|action|cancel|stage|Test-Data/i.test(t)) { rec({ kind: "console", level: m.type(), text: t.slice(0, 300) }); } });

console.log(`\nOpening ${URL_ARG}`);
console.log("Log in, select the txn, click Start on Flow 3C. All requests+responses are logged to probe.jsonl.\n");
await page.goto(URL_ARG, { waitUntil: "domcontentloaded" }).catch((e) => console.log("goto:", e.message));
await new Promise((resolve) => { browser.on("disconnected", resolve); page.on("close", resolve); });
await ctx.close().catch(() => {});
await browser.close().catch(() => {});
console.log("\nSaved → worker/pramaan-capture/probe.jsonl");
