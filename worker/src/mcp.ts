// Minimal MCP server over Streamable HTTP (JSON-RPC 2.0), zero dependencies.
// Modern MCP clients (Claude, etc.) connect to POST /mcp and call these tools.
import type { DB } from "./db";
import type { PayuClient } from "./payu";
import type { CardIssuer } from "./cards";
import * as svc from "./service";

const PROTOCOL_VERSION = "2025-06-18";

export interface McpCtx {
  db: DB;
  payu: PayuClient;
  cards: CardIssuer;
}

const TOOLS = [
  // ---- demand side ----
  {
    name: "onboard_user",
    description: "Register a user by their UPI VPA. Returns the pay2-cash user id.",
    inputSchema: {
      type: "object",
      properties: {
        vpa: { type: "string", description: "UPI address, e.g. alice@okhdfcbank" },
        email: { type: "string" },
      },
      required: ["vpa"],
    },
  },
  {
    name: "create_mandate",
    description:
      "Credential A — create a UPI Reserve Pay mandate. User authorises ONCE; returns 'pending' until approved.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string" },
        limitPaise: { type: "integer", description: "Total spend limit, in paise" },
        merchant: { type: "string", description: "Optional: restrict to one merchant" },
        expiresAt: { type: "integer", description: "Optional epoch ms" },
      },
      required: ["userId", "limitPaise"],
    },
  },
  {
    name: "issue_card",
    description:
      "Credential B — issue a scoped virtual card token (agentcard.sh/Stripe) the agent presents at card checkouts.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string" },
        limitPaise: { type: "integer" },
        provider: { type: "string", enum: ["agentcard", "stripe"] },
      },
      required: ["userId", "limitPaise"],
    },
  },
  {
    name: "agent_pay",
    description:
      "Spend against an ACTIVE mandate within the remaining limit. If merchantId is given, the payment is split (operator share + platform fee).",
    inputSchema: {
      type: "object",
      properties: {
        mandateId: { type: "string" },
        amountPaise: { type: "integer" },
        merchantId: { type: "string", description: "Operator being paid; enables split" },
      },
      required: ["mandateId", "amountPaise"],
    },
  },
  {
    name: "mandate_status",
    description: "Get a mandate's status and remaining spendable amount.",
    inputSchema: {
      type: "object",
      properties: { mandateId: { type: "string" } },
      required: ["mandateId"],
    },
  },
  {
    name: "create_payment_intent",
    description:
      "Propose a specific purchase (amount + merchant + description). method: 'upi_mandate' | 'upi_intent' | 'card'. Returns an intent requiring confirmation (+ approvalUrl for UPI, or a single-use card for 'card').",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string" },
        amountPaise: { type: "integer" },
        method: { type: "string", enum: ["upi_mandate", "upi_intent", "card"] },
        merchantId: { type: "string" },
        description: { type: "string" },
        mandateId: { type: "string", description: "required when method = upi_mandate" },
        cardProvider: { type: "string", enum: ["stripe", "agentcard"] },
      },
      required: ["userId", "amountPaise", "method"],
    },
  },
  {
    name: "confirm_payment_intent",
    description:
      "Confirm and capture a payment intent. Splits to the merchant; for a 'card' intent the single-use card is DELETED after capture.",
    inputSchema: {
      type: "object",
      properties: { intentId: { type: "string" } },
      required: ["intentId"],
    },
  },
  // ---- supply side ----
  {
    name: "onboard_merchant",
    description:
      "Onboard an operator as a PayU child merchant for Split Settlement (PayU handles KYC/nodal/settlement).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        settleVpa: { type: "string", description: "Where the operator gets settled" },
        platformFeeBps: { type: "integer", description: "Platform fee in basis points (default 200 = 2%)" },
      },
      required: ["name", "settleVpa"],
    },
  },
  {
    name: "merchant_status",
    description: "Get an onboarded merchant's status and platform fee.",
    inputSchema: {
      type: "object",
      properties: { merchantId: { type: "string" } },
      required: ["merchantId"],
    },
  },
];

async function callTool(name: string, args: any, ctx: McpCtx): Promise<unknown> {
  switch (name) {
    case "onboard_user":
      return svc.onboardUser(ctx.db, args);
    case "create_mandate":
      return svc.createMandate(ctx.db, ctx.payu, args);
    case "issue_card":
      return svc.issueCard(ctx.db, ctx.cards, args);
    case "agent_pay":
      return svc.agentPay(ctx.db, ctx.payu, args);
    case "mandate_status":
      return svc.mandateStatus(ctx.db, args);
    case "onboard_merchant":
      return svc.onboardMerchant(ctx.db, ctx.payu, args);
    case "merchant_status":
      return svc.merchantStatus(ctx.db, args);
    case "create_payment_intent":
      return svc.createPaymentIntent(ctx.db, ctx.payu, ctx.cards, args);
    case "confirm_payment_intent":
      return svc.confirmPaymentIntent(ctx.db, ctx.payu, ctx.cards, args);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

export async function handleMcpRequest(req: Request, ctx: McpCtx): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
      { status: 400 },
    );
  }

  const { id, method, params } = body ?? {};
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) =>
    Response.json({ jsonrpc: "2.0", id, error: { code, message } });

  try {
    switch (method) {
      case "initialize":
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "pay2-cash", version: "0.2.0" },
        });
      case "notifications/initialized":
        return new Response(null, { status: 202 });
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: TOOLS });
      case "tools/call": {
        const result = await callTool(params?.name, params?.arguments ?? {}, ctx);
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }] });
      }
      default:
        return fail(-32601, `method not found: ${method}`);
    }
  } catch (e) {
    return fail(-32603, e instanceof Error ? e.message : "internal error");
  }
}
