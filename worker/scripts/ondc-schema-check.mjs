// Pre-flight schema validator for ONDC RET10 v1.2.5 payloads.
//
// Validates a directory of <action>.json files against the OFFICIAL ONDC schemas
// vendored under scripts/ondc-schemas/ (copied from ONDC-Official/log-validation-utility,
// commit 4d13362). Zero-dep — walks `required` / `type` / `enum` / `minLength` / `const`
// / `pattern`, which is exactly the class of failure Pramaan rejects on
// (missing required field, bad enum value). Run this BEFORE every Pramaan run.
//
//   node scripts/ondc-schema-check.mjs <logdir>
//   node scripts/ondc-schema-check.mjs <logdir> cancel        # one action
//
// Empty output per action = passes the schema. Pramaan stays the real gate, but this
// catches the field/enum mistakes locally so we don't burn console sessions on them.

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, "ondc-schemas");

// action (request file basename, no .json) → { file, export }. Only the REQUESTS we
// send are listed; on_* are seller/mock callbacks (we don't author those).
const SCHEMA_MAP = {
  search: ["RET/search.mjs", "searchSchema"],
  inc_search: ["RET/search.mjs", "searchSchema"],
  select: ["RET/select.mjs", "selectSchema"],
  select_out_of_stock: ["RET/select.mjs", "selectSchema"],
  init: ["RET/init.mjs", "initSchema"],
  confirm: ["RET/confirm.mjs", "confirmSchema"],
  status: ["Status/status.mjs", "statusSchema"],
  track: ["Track/track.mjs", "trackSchema"],
  cancel: ["Cancel/cancel.mjs", "cancelSchema"],
  update: ["Update/update.mjs", "updateSchema"],
  catalog_rejection: ["CatalogRejection/catalogRejection.mjs", "catalogRejectionSchema"],
  // IGM (domain nic2004:60232) — requests the buyer authors
  issue: ["Igm/issue.mjs", "issueSchema"],
  issue_escalate: ["Igm/issue.mjs", "issueSchema"], // ESCALATE reuses the full issue schema
  issue_status: ["Igm/issueStatus.mjs", "issueStatusSchema"],
  issue_close: ["Igm/issueClose.mjs", "issueCloseSchema"],
  // RSF v2 (10A/10B) — settlement requests
  settle: ["RSF/settle.mjs", "settleSchema"],
  recon: ["RSF/recon.mjs", "reconSchema"],
};

async function loadSchema(action) {
  const entry = SCHEMA_MAP[action];
  if (!entry) return null;
  const mod = await import(join(SCHEMA_DIR, entry[0]));
  return mod[entry[1]];
}

// Recursively validate `data` against JSON-schema-ish `schema`. Returns string[] of paths+reasons.
function validate(schema, data, path = "") {
  const errs = [];
  if (!schema || typeof schema !== "object") return errs;

  const type = schema.type;
  const present = data !== undefined && data !== null;

  if (present) {
    if (type === "object" && (typeof data !== "object" || Array.isArray(data))) errs.push(`${path}: should be object`);
    else if (type === "array" && !Array.isArray(data)) errs.push(`${path}: should be array`);
    else if (type === "string" && typeof data !== "string") errs.push(`${path}: should be string`);
    else if ((type === "integer" || type === "number") && typeof data !== "number") errs.push(`${path}: should be ${type}`);
    else if (type === "boolean" && typeof data !== "boolean") errs.push(`${path}: should be boolean`);

    if (schema.enum && !schema.enum.includes(data)) errs.push(`${path}: value ${JSON.stringify(data)} not in enum [${schema.enum.join(", ")}]`);
    if (schema.const !== undefined && data !== schema.const) errs.push(`${path}: must equal const ${JSON.stringify(schema.const)} (got ${JSON.stringify(data)})`);
    if (schema.minLength !== undefined && typeof data === "string" && data.length < schema.minLength) errs.push(`${path}: shorter than minLength ${schema.minLength}`);
    if (schema.pattern && typeof data === "string" && !new RegExp(schema.pattern).test(data)) errs.push(`${path}: does not match pattern ${schema.pattern}`);
  }

  if (type === "object" && present) {
    for (const req of schema.required || []) {
      if (data[req] === undefined || data[req] === null) errs.push(`${path}/${req}: MISSING required property`);
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (data[k] !== undefined) errs.push(...validate(sub, data[k], `${path}/${k}`));
    }
  }
  if (type === "array" && Array.isArray(data) && schema.items) {
    data.forEach((el, i) => errs.push(...validate(schema.items, el, `${path}[${i}]`)));
  }
  return errs;
}

const dir = process.argv[2];
const only = process.argv[3];
if (!dir) {
  console.error("usage: node scripts/ondc-schema-check.mjs <logdir> [action]");
  process.exit(1);
}

let total = 0, checked = 0, skipped = [];
for (const f of readdirSync(dir).sort()) {
  if (!f.endsWith(".json") || f.startsWith("_") || f.startsWith("on_")) continue;
  const action = f.replace(/\.json$/, "");
  if (only && action !== only) continue;
  if (!SCHEMA_MAP[action]) { skipped.push(action); continue; }
  const schema = await loadSchema(action);
  const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const errs = validate(schema, data, action);
  checked++;
  if (errs.length) {
    total += errs.length;
    console.log(`\n❌ ${action} (${errs.length})`);
    for (const e of errs) console.log("   " + e);
  } else {
    console.log(`✅ ${action}`);
  }
}
if (skipped.length) console.log(`\n(no request-schema for: ${[...new Set(skipped)].join(", ")} — on_* callbacks / rating are seller-validated)`);
console.log(total ? `\n❌ ${total} schema issue(s) across ${checked} action(s) — FIX BEFORE PRAMAAN` : `\n✅ all ${checked} request action(s) pass the vendored ONDC schema`);
process.exit(total ? 1 : 0);
