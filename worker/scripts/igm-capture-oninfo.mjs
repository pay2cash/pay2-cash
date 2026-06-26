// READ-ONLY IGM 2.0 on_issue capture. No sends (so we don't perturb the mock's state
// machine the way repeated issue_status probing did). Polls D1 for on_issue rows on the
// txn; when a NEW on_issue arrives (the seller's "Request Info" or "Send Resolution"
// push) or any on_issue carries a resolution / non-PROCESSING respondent_action, it dumps
// the full payload so we can read the exact IGM 2.0 structure and build the buyer reply.
//
//   node scripts/igm-capture-oninfo.mjs   (uses the saved flow_6_igm txn)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const WORKER = new URL("..", import.meta.url).pathname;
const OUT = new URL("../ondc-logs/RET10/flow_6_igm/_captured_on_issue.json", import.meta.url);
const txn = process.argv[2] || JSON.parse(readFileSync(new URL("../ondc-logs/RET10/flow_6_igm/_igm.json", import.meta.url), "utf8")).txn;
const POLL_MS = 8000;
const MAX_MIN = 30;

function onIssueRows() {
  try {
    const out = execSync(
      `npx wrangler d1 execute pay2cash --remote --json --command "SELECT payload, created_at FROM ondc_logs WHERE action='on_issue' AND transaction_id='${txn}' ORDER BY created_at ASC;"`,
      { cwd: WORKER, stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    return (JSON.parse(out)?.[0]?.results ?? []).map((r) => { try { return JSON.parse(r.payload); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
const interesting = (p) => {
  const i = p.message?.issue || {};
  const ra = i.issue_actions?.respondent_actions || [];
  const hasRes = i.resolution && Object.keys(i.resolution).length;
  const nonProc = ra.some((a) => a.respondent_action && a.respondent_action !== "PROCESSING");
  return hasRes || nonProc;
};

console.log(`[capture] txn=${txn} — READ-ONLY, waiting for the seller's Request-Info / resolution on_issue…`);
const deadline = Date.now() + MAX_MIN * 60000;
console.log(`[capture] ignoring PROCESSING pushes; firing only on a resolution or non-PROCESSING respondent_action`);
while (Date.now() < deadline) {
  const rows = onIssueRows();
  const hit = rows.find(interesting); // ONLY a real Request-Info / resolution push, never PROCESSING
  if (hit) {
    const payload = hit;
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    const i = payload.message.issue;
    console.log(`[capture] ✅ new/relevant on_issue captured (rows now ${rows.length}):`);
    console.log("  respondent_actions:", JSON.stringify((i.issue_actions?.respondent_actions || []).map((a) => a.respondent_action)));
    console.log("  resolution:", JSON.stringify(i.resolution || {}));
    console.log("  issue keys:", Object.keys(i).join(", "));
    console.log(`[capture] full payload → ondc-logs/RET10/flow_6_igm/_captured_on_issue.json`);
    process.exit(0);
  }
  execSync(`sleep ${POLL_MS / 1000}`);
}
console.log("[capture] timed out — no new on_issue arrived (seller's Request-Info push isn't reaching the subscriber).");
process.exit(2);
