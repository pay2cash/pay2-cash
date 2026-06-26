// Pramaan console network CAPTURE harness (Playwright, headed).
//
// Goal: find the request Pramaan's frontend sends to its backend to advance a stage /
// trigger a SELLER action (the call the 3C console bug never makes). We drive a flow that
// DOES work (3A/3B, or any lifecycle step), record every API call to a HAR + a filtered
// JSONL, then analyse to locate the "trigger" endpoint so we can replay it for 3C.
//
// This automates YOUR OWN cert session on a sandbox test bench — standard QA, nothing else.
//
// Usage:
//   node scripts/pramaan-capture.mjs "https://pramaan.ondc.org/<buyer-console-path>"
// Then: log in (the profile persists to ./.pramaan-profile so you only log in once),
// select Flow 3A or 3B, run it, and step the seller action. Close the window when done.
// Output: ./pramaan-capture/pramaan.har  +  ./pramaan-capture/api-calls.jsonl

import { chromium } from "playwright";
import { mkdirSync, appendFileSync } from "node:fs";

const URL_ARG = process.argv[2] || "https://pramaan.ondc.org/";
const OUT = new URL("../pramaan-capture/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const JSONL = OUT + "api-calls.jsonl";

// Asset noise we don't care about.
const SKIP = /\.(js|css|png|jpg|jpeg|svg|woff2?|ico|map|gif)(\?|$)/i;

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  recordHar: { path: OUT + "pramaan.har", content: "embed" },
});

const page = await ctx.newPage();

// Log every non-asset request (method, url, and POST body) — these are the candidates
// for the seller-trigger call.
const isPramaan = (u) => /pramaan\.ondc\.org|registry\.ondc/i.test(u) && !/google|analytics|gtm|doubleclick/i.test(u);

ctx.on("request", (req) => {
  const url = req.url();
  if (SKIP.test(url) || !isPramaan(url)) return;
  const method = req.method();
  if (method === "OPTIONS") return;
  let body = null;
  try { body = req.postData(); } catch { /* ignore */ }
  const rec = { t: Date.now(), kind: "http", method, url, body: body?.slice(0, 4000) || null };
  appendFileSync(JSONL, JSON.stringify(rec) + "\n");
  console.log(`→ ${method} ${url.split("?")[0]}${body ? "  [body " + body.length + "b]" : ""}`);
});

// The console drives live stage progression over WebSocket — capture both directions.
ctx.on("websocket", (ws) => {
  console.log("WS open:", ws.url());
  appendFileSync(JSONL, JSON.stringify({ t: Date.now(), kind: "ws-open", url: ws.url() }) + "\n");
  ws.on("framesent", (f) => {
    const p = typeof f.payload === "string" ? f.payload : "(binary)";
    appendFileSync(JSONL, JSON.stringify({ t: Date.now(), kind: "ws-sent", data: p.slice(0, 4000) }) + "\n");
    console.log(`  WS→ ${p.slice(0, 160)}`);
  });
  ws.on("framereceived", (f) => {
    const p = typeof f.payload === "string" ? f.payload : "(binary)";
    appendFileSync(JSONL, JSON.stringify({ t: Date.now(), kind: "ws-recv", data: p.slice(0, 4000) }) + "\n");
  });
});

console.log(`\nOpening ${URL_ARG}`);
console.log("Drive Flow 3A or 3B and step the seller action. POST calls print below.");
console.log("Close the browser window when done — HAR + api-calls.jsonl will be saved.\n");

await page.goto(URL_ARG, { waitUntil: "domcontentloaded" }).catch((e) => console.log("goto:", e.message));

// Stay open until the user closes the window.
await new Promise((resolve) => {
  browser.on("disconnected", resolve);
  page.on("close", resolve);
});
await ctx.close().catch(() => {});
await browser.close().catch(() => {});
console.log(`\nSaved → worker/pramaan-capture/{pramaan.har, api-calls.jsonl}`);
