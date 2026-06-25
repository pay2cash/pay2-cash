// ONDC Buyer App (BAP) subscriber endpoint — Pre-Prod.
//
// Two things the ONDC registry needs from us during /subscribe:
//   1. GET  /ondc-site-verification.html   — proves we own the domain
//        (an Ed25519 signature of request_id, precomputed; served verbatim).
//   2. POST <subscriber_url>/on_subscribe   — the registry sends an encrypted
//        challenge; we decrypt it with the X25519 ECDH shared secret (our enc
//        private key + ONDC's public key) using AES-256-ECB, and echo {answer}.
//
// The crypto was validated end-to-end in scripts/ondc-crypto-test.mjs.
import { aes256EcbDecrypt } from "./aes";
import type { DB } from "./db";
import { ondcLogs } from "./db/schema";

// ONDC registry public encryption keys (ASN.1 DER / SPKI, base64).
// Only `preprod` is verified (we're registering there). VERIFY staging/prod from
// the ONDC registry docs before switching ONDC_ENV to them.
const ONDC_PUBLIC_KEYS: Record<string, string> = {
  preprod: "MCowBQYDK2VuAyEAa9Wbpvd9SsrpOZFcynyt/TO3x0Yrqyys4NUGIvyxX2Q=",
};

export interface OndcConfig {
  subscriberId: string; // FQDN, e.g. ondc.pay2.cash
  encPrivateKeyPkcs8: string; // base64 PKCS8 X25519 private key (secret)
  signedReqId: string; // precomputed Ed25519 signature of request_id (public)
  env?: string; // "preprod" | "staging" | "prod"
}

const b64ToBytes = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function siteVerificationHtml(signedReqId: string): string {
  return `<html>
    <head>
        <meta name='ondc-site-verification' content='${signedReqId}' />
    </head>
    <body>
        ONDC Site Verification Page
    </body>
</html>
`;
}

// Decrypt the registry's challenge: shared = X25519(ourPriv, ondcPub); AES-256-ECB.
export async function decryptChallenge(challengeB64: string, cfg: OndcConfig): Promise<string> {
  const ondcPubB64 = ONDC_PUBLIC_KEYS[cfg.env ?? "preprod"];
  if (!ondcPubB64) throw new Error(`unknown ONDC env: ${cfg.env}`);

  const priv = await crypto.subtle.importKey(
    "pkcs8",
    b64ToBytes(cfg.encPrivateKeyPkcs8),
    { name: "X25519" },
    false,
    ["deriveBits"],
  );
  const pub = await crypto.subtle.importKey(
    "spki",
    b64ToBytes(ondcPubB64),
    { name: "X25519" },
    false,
    [],
  );
  // `public` is valid for X25519 deriveBits at runtime but missing from the type defs.
  const algo = { name: "X25519", public: pub } as unknown as Parameters<
    typeof crypto.subtle.deriveBits
  >[0];
  const sharedBits = await crypto.subtle.deriveBits(algo, priv, 256);
  const sharedKey = new Uint8Array(sharedBits);

  const plain = aes256EcbDecrypt(b64ToBytes(challengeB64), sharedKey);
  return new TextDecoder().decode(plain);
}

// Handle the ONDC subscriber routes. Returns a Response, or null if not an ONDC path.
export async function handleOndc(req: Request, url: URL, cfg: OndcConfig): Promise<Response | null> {
  // Site verification — always at the ROOT of the subscriber_id domain.
  if (url.pathname === "/ondc-site-verification.html" && req.method === "GET") {
    return new Response(siteVerificationHtml(cfg.signedReqId), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // on_subscribe challenge — accept both /ondc/on_subscribe and /on_subscribe.
  if (
    req.method === "POST" &&
    (url.pathname === "/ondc/on_subscribe" || url.pathname === "/on_subscribe")
  ) {
    try {
      const body = (await req.json().catch(() => ({}))) as { challenge?: string };
      if (!body.challenge) {
        return Response.json({ error: "missing challenge" }, { status: 400 });
      }
      const answer = await decryptChallenge(body.challenge, cfg);
      return Response.json({ answer });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "decrypt failed" },
        { status: 500 },
      );
    }
  }

  return null;
}

// Beckn ACK / NACK envelopes.
const ACK = { message: { ack: { status: "ACK" } } };
const nack = (msg: string) => ({
  message: { ack: { status: "NACK" } },
  error: { type: "CORE-ERROR", message: msg },
});

// All Beckn callback actions the BPP/Pramaan posts to our subscriber callback_url.
const CALLBACK_ACTIONS = new Set([
  "on_search",
  "on_select",
  "on_init",
  "on_confirm",
  "on_status",
  "on_track",
  "on_cancel",
  "on_update",
  "on_rating",
  "on_support",
  "on_issue",
  "on_issue_status",
]);

// Capture an on_* callback (persist for log assembly) and ACK. Path: /ondc/<action>
// (also tolerates /<action>). Returns null if not a Beckn callback path.
export async function handleOndcCallback(req: Request, url: URL, db: DB): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const action = url.pathname.replace(/^\/ondc\//, "").replace(/^\//, "");
  if (!CALLBACK_ACTIONS.has(action)) return null;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json(nack("invalid json"), { status: 400 });
  }

  try {
    await db.insert(ondcLogs).values({
      id: crypto.randomUUID(),
      action,
      transactionId: body?.context?.transaction_id ?? null,
      messageId: body?.context?.message_id ?? null,
      bppId: body?.context?.bpp_id ?? null,
      payload: JSON.stringify(body),
      createdAt: Date.now(),
    });
  } catch {
    // never fail the ACK on a logging error — the network only cares about the ACK.
  }
  // ONDC validates the SYNC ACK to a callback and requires a context — echo the
  // incoming request's context (Pramaan: "on_* sync response verification").
  return Response.json(body?.context ? { context: body.context, message: { ack: { status: "ACK" } } } : ACK);
}
