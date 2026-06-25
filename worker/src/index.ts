// pay2-cash Worker entry. Routes:
//   GET  /              health check
//   POST /mcp           MCP server (AI agents call the product's tools here)
//   POST /payu/webhook  PayU notifies us when a user authorises a mandate
import { getDb } from "./db";
import { PayuClient } from "./payu";
import { CardIssuer } from "./cards";
import { DuffelClient } from "./duffel";
import { handleMcpRequest } from "./mcp";
import { handleOndc, handleOndcCallback } from "./ondc";
import { activateMandate } from "./service";

export interface Env {
  DB: D1Database;
  PAYU_MERCHANT_KEY: string;
  PAYU_SALT: string;
  PAYU_BASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_ISSUING_CURRENCY: string;
  DUFFEL_API_KEY: string;
  DUFFEL_PAYMENT_TYPE: string; // "balance" (sandbox) | "card" (production)
  // ONDC Buyer App (Pre-Prod)
  ONDC_SUBSCRIBER_ID: string;
  ONDC_ENC_PRIVATE_KEY: string; // secret: base64 PKCS8 X25519 private key
  ONDC_SIGNED_REQ_ID: string; // precomputed Ed25519 signature of request_id
  ONDC_ENV: string; // "preprod"
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response("pay2-cash worker ok");
    }

    // ONDC subscriber routes (site verification + /on_subscribe challenge).
    if (env.ONDC_ENC_PRIVATE_KEY) {
      const ondcRes = await handleOndc(req, url, {
        subscriberId: env.ONDC_SUBSCRIBER_ID,
        encPrivateKeyPkcs8: env.ONDC_ENC_PRIVATE_KEY,
        signedReqId: env.ONDC_SIGNED_REQ_ID,
        env: env.ONDC_ENV || "preprod",
      });
      if (ondcRes) return ondcRes;
    }

    const db = getDb(env.DB);

    // ONDC Beckn callbacks (on_search/on_select/.../on_status) → capture + ACK.
    const ondcCb = await handleOndcCallback(req, url, db);
    if (ondcCb) return ondcCb;

    const payu = new PayuClient({
      merchantKey: env.PAYU_MERCHANT_KEY,
      salt: env.PAYU_SALT,
      baseUrl: env.PAYU_BASE_URL,
    });

    if (url.pathname === "/mcp") {
      // CORS so the pay2.cash website can call the MCP directly from the browser.
      const cors: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      };
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (req.method === "POST") {
        const cards = new CardIssuer({
          stripeSecretKey: env.STRIPE_SECRET_KEY,
          issuingCurrency: env.STRIPE_ISSUING_CURRENCY,
        });
        const duffel = new DuffelClient({
          apiKey: env.DUFFEL_API_KEY,
          paymentType: env.DUFFEL_PAYMENT_TYPE === "card" ? "card" : "balance",
        });
        const res = await handleMcpRequest(req, { db, payu, cards, duffel });
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(cors)) headers.set(k, v);
        return new Response(res.body, { status: res.status, headers });
      }
    }

    // TODO(payu): verify the webhook signature before trusting it.
    if (url.pathname === "/payu/webhook" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { mandateId?: string };
      if (body.mandateId) await activateMandate(db, body.mandateId);
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  },
};
