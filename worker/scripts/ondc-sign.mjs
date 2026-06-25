// ONDC request signer — builds the Authorization header for any Beckn request
// (search/select/init/confirm/...) and for log/observability submissions.
// Algorithm verified against ONDC-Official/ondc-crypto-sdk-go:
//   digest        = base64(BLAKE2b-512(body))
//   signingString = "(created): {c}\n(expires): {e}\ndigest: BLAKE-512={digest}"
//   signature     = base64(ed25519_sign(signingString, signing_private_key))
//   header        = Signature keyId="{sub}|{ukid}|ed25519",algorithm="ed25519",
//                   created="{c}",expires="{e}",headers="(created) (expires) digest",
//                   signature="{sig}"
//
// Usage:  node worker/scripts/ondc-sign.mjs <payload.json>   (prints header + self-test)
//         node worker/scripts/ondc-sign.mjs --selftest
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {}
  return env;
}
const ENV = loadEnv();

const SUBSCRIBER_ID = ENV.ONDC_SUBSCRIBER_ID || "ondc.pay2.cash";
const UNIQUE_KEY_ID = ENV.ONDC_UNIQUE_KEY_ID || "REPLACE_WITH_REGISTERED_unique_key_id";
const SIGNING_PRIVATE_KEY = ENV.ONDC_SIGNING_PRIVATE_KEY; // base64 (32B seed or 64B)
const SIGNING_PUBLIC_KEY = ENV.ONDC_SIGNING_PUBLIC_KEY; // base64 raw 32B

function ed25519KeyFromB64(b64) {
  const raw = Buffer.from(b64, "base64");
  const seed = raw.length === 64 ? raw.subarray(0, 32) : raw; // libsodium 64B -> seed
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  return crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
}
function ed25519PubFromB64(b64) {
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(b64, "base64")]);
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
}

export function createAuthorizationHeader(body, opts = {}) {
  const created = opts.created ?? Math.floor(Date.now() / 1000);
  const expires = opts.expires ?? created + 3600;
  const digest = crypto.createHash("blake2b512").update(body, "utf8").digest("base64");
  const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digest}`;
  const sk = ed25519KeyFromB64(SIGNING_PRIVATE_KEY);
  const signature = crypto.sign(null, Buffer.from(signingString, "utf8"), sk).toString("base64");
  return {
    header: `Signature keyId="${SUBSCRIBER_ID}|${UNIQUE_KEY_ID}|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}"`,
    created,
    expires,
    digest,
    signingString,
    signature,
  };
}

function verify(signingString, signatureB64) {
  return crypto.verify(
    null,
    Buffer.from(signingString, "utf8"),
    ed25519PubFromB64(SIGNING_PUBLIC_KEY),
    Buffer.from(signatureB64, "base64"),
  );
}

// CLI — only when run directly, not when imported as a module.
import { pathToFileURL } from "node:url";
const runDirectly = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (runDirectly) {
const arg = process.argv[2];
if (!SIGNING_PRIVATE_KEY) {
  console.error("ONDC_SIGNING_PRIVATE_KEY missing from .env");
  process.exit(1);
}
if (arg === "--selftest" || !arg) {
  const body = JSON.stringify({ context: { action: "search" }, message: { intent: {} } });
  const r = createAuthorizationHeader(body);
  console.log("signingString:\n" + r.signingString);
  console.log("\nAuthorization:\n" + r.header);
  console.log("\nself-verify (sig valid against our public key):", verify(r.signingString, r.signature));
  if (UNIQUE_KEY_ID.startsWith("REPLACE")) console.log("\n⚠ set ONDC_UNIQUE_KEY_ID in .env to the unique_key_id you registered at /subscribe");
} else {
  const body = readFileSync(arg, "utf8");
  const r = createAuthorizationHeader(body);
  console.log(r.header);
  console.error("self-verify:", verify(r.signingString, r.signature));
}
}
