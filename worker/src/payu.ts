// PayU client — the money rail behind pay2-cash.
//
// PayU shipped agentic payments (Feb 2026): an MCP server + UPI Reserve Pay
// mandates that AI agents can transact against. We already have a PayU account.
// Docs: https://docs.payu.in/docs/payu-mcp-server  and the Reserve Pay / mandate APIs.
//
// Everything here is a STUB returning fake data so the rest of the system runs
// end-to-end before real keys are wired. Replace each `// TODO(payu)` body with a
// real fetch() to PayU once agentic/Reserve Pay is confirmed enabled on the account.

export interface PayuConfig {
  merchantKey: string; // PAYU_MERCHANT_KEY
  salt: string; // PAYU_SALT
  baseUrl: string; // test vs prod base URL
}

export interface PayuMandate {
  payuRef: string;
  approvalUrl?: string;
}

export interface PayuDebit {
  payuTxnId: string;
  ok: boolean;
}

export class PayuClient {
  constructor(private cfg: PayuConfig) {}

  // Create a UPI Reserve Pay mandate; user authorises once in their UPI app.
  async createMandate(args: {
    vpa: string;
    limitPaise: number;
    merchant?: string;
    expiresAt?: number;
  }): Promise<PayuMandate> {
    // TODO(payu): POST to PayU Reserve Pay mandate-registration endpoint,
    // signed with merchantKey + salt hash. Return real ref + approval link.
    return { payuRef: `stub_mandate_${args.vpa}`, approvalUrl: undefined };
  }

  // Debit against an authorised mandate — no per-txn PIN.
  async debit(args: {
    payuRef: string;
    amountPaise: number;
    merchant?: string;
  }): Promise<PayuDebit> {
    // TODO(payu): POST to PayU Reserve Pay debit endpoint using the mandate ref.
    return { payuTxnId: `stub_txn_${args.payuRef}`, ok: true };
  }

  // UPI Intent / Collect: push a payment request to the user's VPA. The user
  // approves it in their UPI app, then we capture. (Stubbed — wire PayU S2S UPI.)
  async createUpiIntent(args: {
    vpa: string;
    amountPaise: number;
    merchant?: string;
  }): Promise<{ payuRef: string; approvalUrl: string }> {
    // TODO(payu): PayU UPI Collect/Intent S2S — returns a ref; user approves in-app.
    return {
      payuRef: `stub_intent_${args.vpa}`,
      approvalUrl: `upi://pay?pa=${args.vpa}&am=${(args.amountPaise / 100).toFixed(2)}`,
    };
  }

  async captureUpiIntent(args: { payuRef: string }): Promise<PayuDebit> {
    // TODO(payu): poll/verify the UPI Intent status after user approval.
    return { payuTxnId: `stub_txn_${args.payuRef}`, ok: true };
  }

  // Onboard an operator as a PayU child merchant for Split Settlement.
  // PayU handles their nodal registration, KYC, and settlement.
  async onboardChildMerchant(args: {
    name: string;
    settleVpa: string;
  }): Promise<{ payuChildId: string }> {
    // TODO(payu): call PayU Aggregator/Split-Settlement child-merchant onboarding API.
    return { payuChildId: `stub_child_${args.settleVpa}` };
  }
}
