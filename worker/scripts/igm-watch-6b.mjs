// IGM 6B (escalation/grievance) staged watcher. Two seller-resolution waits:
//   stage 1: probe issue_status until first RESOLVED → run igm-escalate (GRIEVANCE)
//   stage 2: probe until the GRIEVANCE resolution lands (a RESOLVED newer than the
//            escalation, or at cascaded_level ≥ 2) → run igm-close (escalated thread)
// Reads only the LATEST on_issue_status row so the respondent thread reflects current
// state (each issue_status probe writes a fresh row carrying the full thread).
//
//   node scripts/igm-watch-6b.mjs   (uses the saved flow_6_igm txn)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WORKER = new URL("..", import.meta.url).pathname;
const IGM = new URL("../ondc-logs/RET10/flow_6_igm/_igm.json", import.meta.url);
const txn = process.argv[2] || JSON.parse(readFileSync(IGM, "utf8")).txn;
const POLL_MS = 15000;
const MAX_MIN = 40;

function latestRespondentActions() {
  try {
    const out = execSync(
      `npx wrangler d1 execute pay2cash --remote --json --command "SELECT payload FROM ondc_logs WHERE action='on_issue_status' AND transaction_id='${txn}' ORDER BY created_at DESC LIMIT 1;"`,
      { cwd: WORKER, stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    const rows = JSON.parse(out)?.[0]?.results ?? [];
    if (!rows.length) return [];
    return JSON.parse(rows[0].payload).message?.issue?.issue_actions?.respondent_actions || [];
  } catch { return []; }
}
const probe = () => { try { execSync("node scripts/ondc-flow.mjs igm-status", { cwd: WORKER, stdio: ["ignore", "ignore", "ignore"] }); } catch {} };
const resolved = (acts) => acts.filter((a) => a.respondent_action === "RESOLVED");
const fmt = (acts) => acts.map((a) => `${a.respondent_action}(L${a.cascaded_level || 1})`).join(" → ") || "(none)";

function waitFor(label, predicate) {
  const deadline = Date.now() + MAX_MIN * 60000;
  let last = "";
  while (Date.now() < deadline) {
    probe();
    const acts = latestRespondentActions();
    const s = fmt(acts);
    if (s !== last) { console.log(`[6b] ${label}: ${s}`); last = s; }
    if (predicate(acts)) return true;
    execSync(`sleep ${POLL_MS / 1000}`);
  }
  return false;
}

// Stage 1 — first RESOLVED → escalate.
console.log(`[6b] txn=${txn} stage 1: waiting for first RESOLVED…`);
if (!waitFor("stage1", (acts) => resolved(acts).length >= 1)) { console.log("[6b] timed out before first RESOLVED"); process.exit(2); }
console.log("[6b] ✅ first RESOLVED — escalating (GRIEVANCE)");
execSync("node scripts/ondc-flow.mjs igm-escalate", { cwd: WORKER, stdio: "inherit" });

// Stage 2 — grievance RESOLVED (newer than the escalation, or level ≥ 2) → close.
const escalatedAt = JSON.parse(readFileSync(IGM, "utf8")).escalatedAt || new Date(0).toISOString();
console.log(`[6b] stage 2: waiting for grievance RESOLVED (after ${escalatedAt})…`);
const grievanceResolved = (acts) => resolved(acts).some((a) => (a.cascaded_level || 1) >= 2 || (a.updated_at && a.updated_at > escalatedAt));
if (!waitFor("stage2", grievanceResolved)) { console.log("[6b] timed out before grievance RESOLVED"); process.exit(2); }
console.log("[6b] ✅ grievance RESOLVED — closing");
execSync("node scripts/ondc-flow.mjs igm-close", { cwd: WORKER, stdio: "inherit" });
console.log("[6b] ✅ 6B complete (issue → resolve → escalate → resolve → close). Check Pramaan.");
process.exit(0);
