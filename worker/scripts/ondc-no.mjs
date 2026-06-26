// ONDC Network Observability (NO) — reusable module (Flow 11 / MBL_NO).
//
// Spec: ONDC-Official/automation-framework docs/developer-docs/network-observability.md
//   POST <NO endpoint>  with  Authorization: Bearer <token>
//   body = { "type": "<action>", "data": { context, message, error? } }  per action.
// Rules: push every action from on_search onwards (+ IGM from issue); include
//   unsolicited calls + ACK/NACKs; anonymise PII but KEEP city + pincode(area_code);
//   automated (not manual); same-day push.
//
// This module is transport-agnostic: buildEnvelope() + anonymise() are pure and
// unit-testable; pushOne()/pushMany() do the HTTP. Used by ondc-no-push.mjs (CLI)
// and can be imported by a real-time worker hook.

// Prod endpoint is published in the spec; preprod URL comes from NP Portal →
// Configuration Settings. Override with ONDC_NO_ENDPOINT.
export const NO_ENDPOINT_PROD = "https://analytics-api.aws.ondc.org/v1/api/push-txn-logs";

const REDACT = {
  name: "REDACTED",
  phone: "9999999999",
  email: "redacted@ondc.org",
  gps: "0.000000,0.000000",
};

// Keys that are ALWAYS personal data wherever they appear.
const ALWAYS_PII = new Set(["phone", "email", "gps", "authorization", "signature"]);
// "name" is PII only inside a person/contact/billing/customer context (NOT provider
// names, item names, descriptor names, etc.).
const NAME_PII_PARENTS = new Set(["billing", "person", "contact", "customer"]);
// Inside an `address` object: redact the granular lines, KEEP locality identifiers.
const ADDR_REDACT = new Set(["door", "building", "street", "ward", "locality", "name"]);
const ADDR_KEEP = new Set(["city", "area_code", "state", "country", "pincode"]);

// Custom ONDC keys that pack contact PII into a single (often CSV) string value,
// e.g. `@ondc/org/contact_details_consumer_care` = "Name,email,phone".
const CONTACT_BLOB_KEY = /contact_details|consumer_care/i;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;

// Scrub PII embedded inside a free-text string value (emails anywhere — they are
// always contact data regardless of the key holding them).
function scrubString(s) {
  return s.replace(EMAIL_RE, "redacted@ondc.org");
}

// Recursively anonymise PII in-place-safe (returns a deep-cloned, scrubbed copy).
// `parentKey` carries the enclosing object key so we can be context-aware about `name`.
export function anonymise(node, parentKey = "") {
  if (typeof node === "string") return scrubString(node);
  if (Array.isArray(node)) return node.map((v) => anonymise(v, parentKey));
  if (node && typeof node === "object") {
    const out = {};
    const inAddress = parentKey === "address";
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      if (CONTACT_BLOB_KEY.test(k)) { out[k] = "REDACTED"; continue; }
      if (inAddress) {
        if (ADDR_KEEP.has(kl)) { out[k] = v; continue; }
        if (ADDR_REDACT.has(kl)) { out[k] = typeof v === "string" ? "REDACTED" : anonymise(v, k); continue; }
      }
      if (ALWAYS_PII.has(kl)) { out[k] = REDACT[kl] ?? "REDACTED"; continue; }
      if (kl === "name" && NAME_PII_PARENTS.has(parentKey.toLowerCase())) { out[k] = REDACT.name; continue; }
      out[k] = anonymise(v, k);
    }
    return out;
  }
  return node;
}

// Wrap a Beckn payload ({context, message, error?}) into the NO submission envelope.
// `type` defaults to context.action (the canonical action name).
export function buildEnvelope(payload, typeOverride) {
  const ctx = payload?.context ?? {};
  const type = typeOverride || ctx.action;
  if (!type) throw new Error("buildEnvelope: missing context.action (and no typeOverride)");
  const data = { context: anonymise(ctx, "context"), message: anonymise(payload?.message ?? {}, "message") };
  if (payload?.error) data.error = anonymise(payload.error, "error");
  return { type, data };
}

// POST one envelope to the NO endpoint. Returns {ok, status, body}.
export async function pushOne(envelope, { endpoint, token } = {}) {
  const url = endpoint || process.env.ONDC_NO_ENDPOINT || NO_ENDPOINT_PROD;
  const tok = token || process.env.ONDC_OBSERVABILITY_TOKEN;
  if (!tok) throw new Error("pushOne: no token (set ONDC_OBSERVABILITY_TOKEN)");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify(envelope),
  });
  let body = "";
  try { body = await res.text(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: body.slice(0, 500) };
}
