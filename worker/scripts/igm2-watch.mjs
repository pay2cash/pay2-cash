// IGM 2.0 (Flow 6b–6e) FULLY autonomous driver. Reads the seller's latest on_issue
// action code and fires the matching buyer leg, then runs the buyer-driven tail
// (status → close → status → close) that completes the Pramaan card. Just click through
// the console (Start → Request Info → Send Resolution); this does the rest.
//
// Sequence (learned from a passing 6b run):
//   reopen* (until INFO_REQUESTED, catches issue_open post-Start)
//   INFO_REQUESTED      → igm2-info
//   RESOLUTION_PROPOSED → igm2-accept → TAIL
//   TAIL: igm2-status → igm2-close → igm2-status (triggers seller on_issue_status: CLOSED)
//         → wait for seller status CLOSED → igm2-close → done
//
//   node scripts/igm2-watch.mjs   (uses the saved flow_6b_igm2 txn)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WORKER = new URL("..", import.meta.url).pathname;
const txn = process.argv[2] || JSON.parse(readFileSync(new URL("../ondc-logs/RET10/flow_6b_igm2/_igm2.json", import.meta.url), "utf8")).txn;
const POLL_MS = 12000, MAX_MIN = 40, REOPEN_EVERY = 3;

function latest(action) {
  try {
    const out = execSync(
      `npx wrangler d1 execute pay2cash --remote --json --command "SELECT payload FROM ondc_logs WHERE action='${action}' AND transaction_id='${txn}' ORDER BY created_at DESC LIMIT 1;"`,
      { cwd: WORKER, stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    const rows = JSON.parse(out)?.[0]?.results ?? [];
    return rows.length ? JSON.parse(rows[0].payload).message?.issue : null;
  } catch { return null; }
}
const codes = (is) => (is?.actions || []).map((a) => a.descriptor?.code);
const run = (cmd) => { console.log(`[igm2] → ${cmd}`); execSync(`node scripts/ondc-flow.mjs ${cmd}`, { cwd: WORKER, stdio: "inherit" }); };
const sleep = (s) => execSync(`sleep ${s}`);

function onIssueStatusCount() {
  try {
    const out = execSync(`npx wrangler d1 execute pay2cash --remote --json --command "SELECT COUNT(*) c FROM ondc_logs WHERE action='on_issue_status' AND transaction_id='${txn}';"`, { cwd: WORKER, stdio: ["ignore", "pipe", "ignore"] }).toString();
    return JSON.parse(out)?.[0]?.results?.[0]?.c ?? 0;
  } catch { return 0; }
}
// Wait until the seller answers our issue_status with a NEW on_issue_status (don't race
// the next step on a fixed timer — this was the 6e flake).
function waitStatusAck(baseline, label) {
  for (let i = 0; i < 12; i++) { if (onIssueStatusCount() > baseline) { console.log(`[igm2] ${label}: seller on_issue_status received`); return true; } sleep(5); }
  console.log(`[igm2] ${label}: timed out waiting on on_issue_status (continuing)`); return false;
}
function tail() {
  console.log("[igm2] === TAIL: status → close → status → (await CLOSED) → close ===");
  let base = onIssueStatusCount();
  run("igm2-status"); waitStatusAck(base, "status#1");
  sleep(6); run("igm2-close"); sleep(6);
  base = onIssueStatusCount();
  run("igm2-status"); waitStatusAck(base, "status#2");
  // Wait for the seller to register CLOSED (its on_issue/on_issue_status flips to CLOSED).
  for (let i = 0; i < 12; i++) {
    const is = latest("on_issue_status") || latest("on_issue");
    if (is?.status === "CLOSED" || codes(is).includes("CLOSED")) { console.log("[igm2] seller CLOSED registered"); break; }
    sleep(6);
  }
  // Final close RACE FIX: the console reaches "waiting for issue_close" a beat after the
  // seller CLOSED registers, so a single close can miss the window. Retry a few times,
  // spaced out, so the console catches one when it's ready (issue_close is idempotent).
  for (let k = 0; k < 4; k++) {
    sleep(10);
    console.log(`[igm2] final close attempt ${k + 1}/4`);
    run("igm2-close");
  }
  console.log("[igm2] ✅ 6x complete (open→info→accept→status→close→status→close×retry). Check Pramaan.");
}

console.log(`[igm2] txn=${txn} — autonomous. Click: Start → Request Info → Send Resolution.`);
const deadline = Date.now() + MAX_MIN * 60000;
let lastActedId = null, progressed = false, i = 0, seen = "";
while (Date.now() < deadline) {
  const is = latest("on_issue");
  const cs = codes(is);
  const last = is?.actions?.[is.actions.length - 1];
  const code = last?.descriptor?.code;
  if (cs.join("→") !== seen) { console.log(`[igm2] seller: ${cs.join("→") || "(none)"}`); seen = cs.join("→"); }

  if (last && last.id !== lastActedId) {
    if (code === "INFO_REQUESTED") { run("igm2-info"); lastActedId = last.id; progressed = true; }
    else if (code === "RESOLUTION_PROPOSED") { run("igm2-accept"); tail(); process.exit(0); }
  }
  if (!progressed && (code === "OPEN" || code === "PROCESSING" || !code) && i % REOPEN_EVERY === 0) run("igm2-reopen");
  i++;
  sleep(POLL_MS / 1000);
}
console.log("[igm2] timed out — re-run when you've stepped the console further.");
process.exit(2);
