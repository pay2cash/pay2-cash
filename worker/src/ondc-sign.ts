// ONDC Beckn request signer for the WORKER runtime (WebCrypto + blakejs).
//
// Mirrors scripts/ondc-sign.mjs exactly (verified against ONDC-Official/
// ondc-crypto-sdk-go), but uses Workers-native primitives instead of node:crypto
// (the worker has no nodejs_compat):
//   digest        = base64(BLAKE2b-512(body))            — blakejs
//   signingString = "(created): {c}\n(expires): {e}\ndigest: BLAKE-512={digest}"
//   signature     = base64(ed25519_sign(signingString))  — WebCrypto subtle "Ed25519"
//   header        = Signature keyId="{sub}|{ukid}|ed25519",algorithm="ed25519",
//                   created="…",expires="…",headers="(created) (expires) digest",signature="…"
import blakejs from "blakejs";

const { blake2b } = blakejs;

// PKCS8 DER prefix for an Ed25519 private key carrying a raw 32-byte seed.
const ED25519_PKCS8_PREFIX = hexToBytes("302e020100300506032b657004220420");

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Import an Ed25519 signing key from a base64 seed (32B) or libsodium 64B secret key.
async function importSigningKey(privateKeyB64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(privateKeyB64);
  const seed = raw.length === 64 ? raw.subarray(0, 32) : raw; // 64B → first 32B is the seed
  const pkcs8 = new Uint8Array(ED25519_PKCS8_PREFIX.length + seed.length);
  pkcs8.set(ED25519_PKCS8_PREFIX, 0);
  pkcs8.set(seed, ED25519_PKCS8_PREFIX.length);
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
}

export interface SigningConfig {
  subscriberId: string; // e.g. ondc.pay2.cash
  uniqueKeyId: string; // the unique_key_id registered at /subscribe
  signingPrivateKeyB64: string; // base64 Ed25519 seed (32B) or 64B secret key
}

// Build the ONDC Authorization header for `body` (the exact JSON string that will be POSTed).
export async function createAuthorizationHeader(
  body: string,
  cfg: SigningConfig,
  opts: { created?: number; expires?: number } = {},
): Promise<string> {
  const created = opts.created ?? Math.floor(Date.now() / 1000);
  const expires = opts.expires ?? created + 3600;
  const digest = bytesToBase64(blake2b(new TextEncoder().encode(body), undefined, 64));
  const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digest}`;
  const key = await importSigningKey(cfg.signingPrivateKeyB64);
  const sigBytes = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(signingString)));
  const signature = bytesToBase64(sigBytes);
  return `Signature keyId="${cfg.subscriberId}|${cfg.uniqueKeyId}|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}"`;
}
