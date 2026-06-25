// pay2-cash Worker entry. Routes:
//   GET  /              health check
//   POST /mcp           MCP server (AI agents call the product's tools here)
//   POST /payu/webhook  PayU notifies us when a user authorises a mandate
import { getDb } from "./db";
import { PayuClient } from "./payu";
import { CardIssuer } from "./cards";
import { handleMcpRequest } from "./mcp";
import { activateMandate } from "./service";

export interface Env {
  DB: D1Database;
  PAYU_MERCHANT_KEY: string;
  PAYU_SALT: string;
  PAYU_BASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_ISSUING_CURRENCY: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response("pay2-cash worker ok");
    }

    const db = getDb(env.DB);
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
        const res = await handleMcpRequest(req, { db, payu, cards });
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
