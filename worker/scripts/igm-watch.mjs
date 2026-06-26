// IGM resolution watcher (active probe). The Pramaan console drives the seller; the
// resolution surfaces in on_issue_status (respondent_action RESOLVED), and the console
// then waits for the buyer to CLOSE. So this loop actively sends issue_status, inspects
// the captured on_issue_status, and the moment it sees RESOLVED it auto-runs igm-close —
// completing the lifecycle without hand-holding. Just step the console; this flips it.
//
//   node scripts/igm-watch.mjs        (uses the saved flow_6_igm txn)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WORKER = new URL("..", import.meta.url).pathname;
const ig = JSON.parse(readFileSync(new URL("../ondc-logs/RET10/flow_6_igm/_igm.json", import.meta.url), "utf8"));
const txn = process.argv[2] || ig.txn;
const RESOLVED = new Set(["RESOLVED", "CASCADED"]); // seller has proposed/closed a resolution
const POLL_MS = 15000;
const MAX_MIN = 30;

function respondentActions() {
  try {
    const out = execSync(
      `npx wrangler d1 execute pay2cash --remote --json --command "SELECT payload FROM ondc_logs WHERE action IN ('on_issue','on_issue_status') AND transaction_id='${txn}' ORDER BY created_at ASC;"`,
      { cwd: WORKER, stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    const rows = JSON.parse(out)?.[0]?.results ?? [];
    return rows.flatMap((r) => {
      try { return (JSON.parse(r.payload).message?.issue?.issue_actions?.respondent_actions || []).map((a) => a.respondent_action); } catch { return []; }
    });
  } catch { return []; }
}

console.log(`[igm-watch] txn=${txn} — probing issue_status until the seller RESOLVES…`);
const deadline = Date.now() + MAX_MIN * 60000;
let last = "";
while (Date.now() < deadline) {
  // Active probe: send issue_status so the seller's latest on_issue_status lands in D1.
  try { execSync(`node scripts/ondc-flow.mjs igm-status`, { cwd: WORKER, stdio: ["ignore", "ignore", "ignore"] }); } catch {}
  const acts = respondentActions();
  const latest = acts[acts.length - 1] || "(none)";
  if (latest !== last) { console.log(`[igm-watch] respondent_actions: ${acts.join(" → ") || "(none)"}`); last = latest; }
  if (acts.some((a) => RESOLVED.has(a))) {
    console.log(`[igm-watch] ✅ seller RESOLVED — running igm-close`);
    execSync("node scripts/ondc-flow.mjs igm-close", { cwd: WORKER, stdio: "inherit" });
    console.log("[igm-watch] ✅ IGM 6A lifecycle complete (issue → status → close). Check Pramaan.");
    process.exit(0);
  }
  execSync(`sleep ${POLL_MS / 1000}`);
}
console.log(`[igm-watch] timed out after ${MAX_MIN}m still PROCESSING — step the console, then re-run.`);
process.exit(2);
