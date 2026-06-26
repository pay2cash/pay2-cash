// Flow 11 / Network Observability — push captured logs to the NO endpoint.
//
//   node scripts/ondc-no-push.mjs <scenario|all> [--push]
//
// Reads worker/ondc-logs/RET10/<scenario>/*.json (full request + response payloads
// we already captured), wraps each via buildEnvelope(), anonymises PII, and either
// previews (default, DRY-RUN — no network) or POSTs to the NO endpoint (--push).
//
// Token: ONDC_OBSERVABILITY_TOKEN from repo-root .env (or env). Endpoint:
// ONDC_NO_ENDPOINT (preprod URL from NP Portal) else the prod default.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { buildEnvelope, anonymise, pushOne, NO_ENDPOINT_PROD } from "./ondc-no.mjs";

const ROOT = new URL("../ondc-logs/RET10/", import.meta.url);
const ENV = new URL("../../.env", import.meta.url);

// Minimal .env loader (no deps) so the token/endpoint are available to the script.
function loadEnv() {
  if (!existsSync(ENV)) return;
  for (const line of readFileSync(ENV, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// Detect any PII that slipped through (defence-in-depth before we ever push).
function leakCheck(envelope) {
  const s = JSON.stringify(envelope);
  const leaks = [];
  if (/[\w.+-]+@(?!ondc\.org)[\w.-]+\.\w+/.test(s)) leaks.push("email");
  if (/\b[6-9]\d{9}\b/.test(s.replace(/9999999999/g, ""))) leaks.push("phone");
  if (/"gps"\s*:\s*"(?!0\.0)/.test(s)) leaks.push("gps");
  return leaks;
}

const scenario = process.argv[2];
const doPush = process.argv.includes("--push");
if (!scenario) {
  console.error("usage: node scripts/ondc-no-push.mjs <scenario|all> [--push]");
  process.exit(1);
}
loadEnv();

const scenarios = scenario === "all"
  ? readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [scenario];

const endpoint = process.env.ONDC_NO_ENDPOINT || NO_ENDPOINT_PROD;
console.log(`NO push — mode=${doPush ? "PUSH" : "DRY-RUN"}  endpoint=${endpoint}`);
console.log(`token=${process.env.ONDC_OBSERVABILITY_TOKEN ? "present" : "MISSING"}\n`);

let total = 0, pushed = 0, failed = 0, leaked = 0;
for (const sc of scenarios) {
  const dir = new URL(`${sc}/`, ROOT);
  if (!existsSync(dir)) { console.log(`  ⚠ ${sc}: no log dir, skipping`); continue; }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
  console.log(`▸ ${sc}  (${files.length} actions)`);
  for (const f of files) {
    let payload;
    try { payload = JSON.parse(readFileSync(new URL(f, dir), "utf8")); } catch { continue; }
    if (!payload?.context?.action) continue; // skip non-Beckn files
    total++;
    let env;
    try { env = buildEnvelope(payload); } catch (e) { console.log(`  ✗ ${f}: ${e.message}`); failed++; continue; }
    const leaks = leakCheck(env);
    if (leaks.length) { leaked++; console.log(`  ⚠ ${f}: possible PII leak [${leaks.join(",")}]`); }
    if (doPush) {
      try {
        const r = await pushOne(env, { endpoint });
        if (r.ok) { pushed++; console.log(`  ✓ ${env.type.padEnd(16)} → ${r.status}`); }
        else { failed++; console.log(`  ✗ ${env.type.padEnd(16)} → ${r.status} ${r.body}`); }
      } catch (e) { failed++; console.log(`  ✗ ${env.type}: ${e.message}`); }
    } else {
      const keys = Object.keys(env.data.message || {}).join(",");
      console.log(`  · ${env.type.padEnd(16)} data.message={${keys}}${leaks.length ? "" : "  pii✓"}`);
    }
  }
}
console.log(`\nactions=${total}  ${doPush ? `pushed=${pushed} failed=${failed}` : "(dry-run)"}  pii-warnings=${leaked}`);
if (!doPush) console.log("→ re-run with --push once ONDC_NO_ENDPOINT (preprod) + token are confirmed.");
