// pay2-cash — TypeScript SDK for the pay2 Cash agentic-payments MCP.
// Zero dependencies; uses global fetch (Node 18+, browsers, Workers).
//
//   import { Pay2Cash } from "pay2-cash";
//   const p2c = new Pay2Cash();
//   const user = await p2c.onboardUser({ vpa: "alice@okhdfcbank" });
//
// Amounts are in PAISE (integer). ₹1 = 100 paise.

export type MandateStatus = "pending" | "active" | "paused" | "revoked" | "expired";
export type PaymentStatus = "initiated" | "success" | "failed";
export type MerchantStatus = "onboarding" | "active" | "suspended";
export type CardStatus = "active" | "frozen" | "closed";

export interface OnboardUserInput { vpa: string; email?: string }
export interface OnboardUserResult { userId: string; vpa: string }

export interface CreateMandateInput {
  userId: string;
  limitPaise: number;
  merchant?: string;
  expiresAt?: number;
}
export interface CreateMandateResult {
  mandateId: string;
  status: MandateStatus;
  approvalUrl?: string;
}

export interface IssueCardInput {
  userId: string;
  limitPaise: number;
  provider?: "agentcard" | "stripe";
}
export interface IssueCardResult {
  cardId: string;
  provider: string;
  cardToken: string;
  last4?: string;
  status: CardStatus;
  limitPaise: number;
}

export interface AgentPayInput {
  mandateId: string;
  amountPaise: number;
  merchantId?: string;
}
export interface SplitBreakdown {
  merchantId: string;
  operatorSharePaise: number;
  platformFeePaise: number;
}
export interface AgentPayResult {
  paymentId: string;
  status: PaymentStatus;
  remainingPaise: number;
  split?: SplitBreakdown;
}

export interface MandateStatusResult {
  mandateId: string;
  status: MandateStatus;
  limitPaise: number;
  spentPaise: number;
  remainingPaise: number;
}

export interface OnboardMerchantInput {
  name: string;
  settleVpa: string;
  platformFeeBps?: number;
}
export interface OnboardMerchantResult {
  merchantId: string;
  status: MerchantStatus;
  payuChildId?: string;
  platformFeeBps: number;
}

export interface MerchantStatusResult {
  merchantId: string;
  name: string;
  status: MerchantStatus;
  platformFeeBps: number;
}

export type PaymentMethod = "upi_mandate" | "upi_intent" | "card";
export type IntentStatus = "requires_confirmation" | "captured" | "canceled" | "failed";

export interface CreatePaymentIntentInput {
  userId: string;
  amountPaise: number;
  method: PaymentMethod;
  merchantId?: string;
  description?: string;
  mandateId?: string;
  cardProvider?: "stripe" | "agentcard";
}
export interface CreatePaymentIntentResult {
  intentId: string;
  status: IntentStatus;
  method: PaymentMethod;
  amountPaise: number;
  approvalUrl?: string;
  cardId?: string;
  cardToken?: string;
  last4?: string;
}
export interface ConfirmPaymentIntentResult {
  intentId: string;
  status: IntentStatus;
  paymentId?: string;
  split?: SplitBreakdown;
  cardDeleted?: boolean;
}

export interface Pay2CashOptions {
  /** Base URL of the pay2 Cash MCP server. Defaults to https://mcp.pay2.cash */
  baseUrl?: string;
  /** Custom fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
}

export class Pay2Cash {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: Pay2CashOptions = {}) {
    this.url = (opts.baseUrl ?? "https://mcp.pay2.cash").replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error("no fetch available — pass opts.fetch");
  }

  private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(`${this.url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    const data: any = await res.json();
    if (data.error) throw new Error(`pay2-cash ${name}: ${data.error.message}`);
    return JSON.parse(data.result.content[0].text) as T;
  }

  /** List the MCP tools the server exposes. */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const res = await this.fetchImpl(`${this.url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const data: any = await res.json();
    return data.result.tools;
  }

  onboardUser(input: OnboardUserInput) {
    return this.call<OnboardUserResult>("onboard_user", { ...input });
  }
  createMandate(input: CreateMandateInput) {
    return this.call<CreateMandateResult>("create_mandate", { ...input });
  }
  issueCard(input: IssueCardInput) {
    return this.call<IssueCardResult>("issue_card", { ...input });
  }
  agentPay(input: AgentPayInput) {
    return this.call<AgentPayResult>("agent_pay", { ...input });
  }
  mandateStatus(mandateId: string) {
    return this.call<MandateStatusResult>("mandate_status", { mandateId });
  }
  onboardMerchant(input: OnboardMerchantInput) {
    return this.call<OnboardMerchantResult>("onboard_merchant", { ...input });
  }
  merchantStatus(merchantId: string) {
    return this.call<MerchantStatusResult>("merchant_status", { merchantId });
  }

  /** Propose a specific purchase (propose → confirm). */
  createPaymentIntent(input: CreatePaymentIntentInput) {
    return this.call<CreatePaymentIntentResult>("create_payment_intent", { ...input });
  }
  /** Confirm & capture an intent. For a 'card' intent, the card is deleted after capture. */
  confirmPaymentIntent(intentId: string) {
    return this.call<ConfirmPaymentIntentResult>("confirm_payment_intent", { intentId });
  }
}

/** ₹ rupees -> paise. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);
/** paise -> ₹ rupees. */
export const toRupees = (paise: number) => paise / 100;
