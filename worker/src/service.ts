// Business logic implementing the pay2-cash tool contract.
// DB (Drizzle/D1) for our records; PayuClient for Reserve Pay + Split Settlement;
// CardIssuer for virtual-card credentials.
import { eq } from "drizzle-orm";
import type { DB } from "./db";
import { users, mandates, cards, merchants, payments, paymentIntents } from "./db/schema";
import type { PayuClient } from "./payu";
import type { CardIssuer } from "./cards";
import type {
  OnboardUserInput,
  OnboardUserResult,
  CreateMandateInput,
  CreateMandateResult,
  IssueCardInput,
  IssueCardResult,
  AgentPayInput,
  AgentPayResult,
  SplitBreakdown,
  MandateStatusInput,
  MandateStatusResult,
  OnboardMerchantInput,
  OnboardMerchantResult,
  MerchantStatusInput,
  MerchantStatusResult,
  CreatePaymentIntentInput,
  CreatePaymentIntentResult,
  ConfirmPaymentIntentInput,
  ConfirmPaymentIntentResult,
} from "./contract";

// Shared: compute the split for a payment to an active merchant.
async function computeSplit(
  db: DB,
  merchantId: string,
  amountPaise: number,
): Promise<SplitBreakdown> {
  const merchant = await db.select().from(merchants).where(eq(merchants.id, merchantId)).get();
  if (!merchant) throw new Error(`merchant not found: ${merchantId}`);
  if (merchant.status !== "active") throw new Error(`merchant not active (status=${merchant.status})`);
  const platformFeePaise = Math.floor((amountPaise * merchant.platformFeeBps) / 10000);
  return { merchantId: merchant.id, platformFeePaise, operatorSharePaise: amountPaise - platformFeePaise };
}

// ============================ DEMAND SIDE ============================

export async function onboardUser(
  db: DB,
  input: OnboardUserInput,
): Promise<OnboardUserResult> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    vpa: input.vpa,
    email: input.email ?? null,
    createdAt: Date.now(),
  });
  return { userId: id, vpa: input.vpa };
}

export async function createMandate(
  db: DB,
  payu: PayuClient,
  input: CreateMandateInput,
): Promise<CreateMandateResult> {
  const user = await db.select().from(users).where(eq(users.id, input.userId)).get();
  if (!user) throw new Error(`user not found: ${input.userId}`);

  const m = await payu.createMandate({
    vpa: user.vpa,
    limitPaise: input.limitPaise,
    merchant: input.merchant,
    expiresAt: input.expiresAt,
  });

  const id = crypto.randomUUID();
  await db.insert(mandates).values({
    id,
    userId: user.id,
    payuRef: m.payuRef,
    status: "pending", // flips to "active" once the user authorises (PayU webhook)
    limitPaise: input.limitPaise,
    spentPaise: 0,
    merchant: input.merchant ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: Date.now(),
  });

  return { mandateId: id, status: "pending", approvalUrl: m.approvalUrl };
}

export async function issueCard(
  db: DB,
  issuer: CardIssuer,
  input: IssueCardInput,
): Promise<IssueCardResult> {
  const user = await db.select().from(users).where(eq(users.id, input.userId)).get();
  if (!user) throw new Error(`user not found: ${input.userId}`);

  const provider = input.provider ?? "agentcard";
  const issued = await issuer.issueCard({
    provider,
    userVpa: user.vpa,
    limitPaise: input.limitPaise,
  });

  const id = crypto.randomUUID();
  await db.insert(cards).values({
    id,
    userId: user.id,
    provider,
    cardToken: issued.cardToken,
    status: "active",
    limitPaise: input.limitPaise,
    spentPaise: 0,
    createdAt: Date.now(),
  });

  return {
    cardId: id,
    provider,
    cardToken: issued.cardToken,
    last4: issued.last4,
    status: "active",
    limitPaise: input.limitPaise,
  };
}

export async function agentPay(
  db: DB,
  payu: PayuClient,
  input: AgentPayInput,
): Promise<AgentPayResult> {
  const m = await db.select().from(mandates).where(eq(mandates.id, input.mandateId)).get();
  if (!m) throw new Error(`mandate not found: ${input.mandateId}`);
  if (m.status !== "active") {
    throw new Error(`mandate not active (status=${m.status})`);
  }

  const remaining = m.limitPaise - m.spentPaise;
  if (input.amountPaise > remaining) {
    throw new Error(`amount ${input.amountPaise} exceeds remaining ${remaining}`);
  }

  // Compute the split if paying a known operator.
  let split: SplitBreakdown | undefined;
  if (input.merchantId) {
    const merchant = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, input.merchantId))
      .get();
    if (!merchant) throw new Error(`merchant not found: ${input.merchantId}`);
    if (merchant.status !== "active") {
      throw new Error(`merchant not active (status=${merchant.status})`);
    }
    const platformFeePaise = Math.floor((input.amountPaise * merchant.platformFeeBps) / 10000);
    split = {
      merchantId: merchant.id,
      platformFeePaise,
      operatorSharePaise: input.amountPaise - platformFeePaise,
    };
  }

  const debit = await payu.debit({
    payuRef: m.payuRef!,
    amountPaise: input.amountPaise,
    merchant: input.merchantId,
  });

  const paymentId = crypto.randomUUID();
  await db.insert(payments).values({
    id: paymentId,
    mandateId: m.id,
    merchantId: input.merchantId ?? null,
    payuTxnId: debit.payuTxnId,
    amountPaise: input.amountPaise,
    operatorSharePaise: split?.operatorSharePaise ?? null,
    platformFeePaise: split?.platformFeePaise ?? null,
    status: debit.ok ? "success" : "failed",
    createdAt: Date.now(),
  });

  const newSpent = debit.ok ? m.spentPaise + input.amountPaise : m.spentPaise;
  if (debit.ok) {
    await db.update(mandates).set({ spentPaise: newSpent }).where(eq(mandates.id, m.id));
  }

  return {
    paymentId,
    status: debit.ok ? "success" : "failed",
    remainingPaise: m.limitPaise - newSpent,
    split,
  };
}

export async function mandateStatus(
  db: DB,
  input: MandateStatusInput,
): Promise<MandateStatusResult> {
  const m = await db.select().from(mandates).where(eq(mandates.id, input.mandateId)).get();
  if (!m) throw new Error(`mandate not found: ${input.mandateId}`);
  return {
    mandateId: m.id,
    status: m.status,
    limitPaise: m.limitPaise,
    spentPaise: m.spentPaise,
    remainingPaise: m.limitPaise - m.spentPaise,
  };
}

// Called by the PayU webhook once the user authorises the mandate in their UPI app.
export async function activateMandate(db: DB, mandateId: string): Promise<void> {
  await db.update(mandates).set({ status: "active" }).where(eq(mandates.id, mandateId));
}

// ============================ SUPPLY SIDE ============================

export async function onboardMerchant(
  db: DB,
  payu: PayuClient,
  input: OnboardMerchantInput,
): Promise<OnboardMerchantResult> {
  const child = await payu.onboardChildMerchant({
    name: input.name,
    settleVpa: input.settleVpa,
  });

  const id = crypto.randomUUID();
  const platformFeeBps = input.platformFeeBps ?? 200;
  await db.insert(merchants).values({
    id,
    name: input.name,
    payuChildId: child.payuChildId,
    settleVpa: input.settleVpa,
    platformFeeBps,
    status: "active", // PayU child onboarding is synchronous in this stub
    createdAt: Date.now(),
  });

  return { merchantId: id, status: "active", payuChildId: child.payuChildId, platformFeeBps };
}

export async function merchantStatus(
  db: DB,
  input: MerchantStatusInput,
): Promise<MerchantStatusResult> {
  const merchant = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, input.merchantId))
    .get();
  if (!merchant) throw new Error(`merchant not found: ${input.merchantId}`);
  return {
    merchantId: merchant.id,
    name: merchant.name,
    status: merchant.status,
    platformFeeBps: merchant.platformFeeBps,
  };
}

// ===================== PAYMENT INTENTS (propose → confirm) =====================

export async function createPaymentIntent(
  db: DB,
  payu: PayuClient,
  issuer: CardIssuer,
  input: CreatePaymentIntentInput,
): Promise<CreatePaymentIntentResult> {
  const user = await db.select().from(users).where(eq(users.id, input.userId)).get();
  if (!user) throw new Error(`user not found: ${input.userId}`);
  if (input.merchantId) await computeSplit(db, input.merchantId, input.amountPaise); // validate merchant

  const id = crypto.randomUUID();
  let mandateId: string | null = null;
  let cardId: string | null = null;
  let payuRef: string | null = null;
  let approvalUrl: string | null = null;
  let cardToken: string | undefined;
  let last4: string | undefined;

  if (input.method === "upi_mandate") {
    if (!input.mandateId) throw new Error("mandateId required for method upi_mandate");
    const m = await db.select().from(mandates).where(eq(mandates.id, input.mandateId)).get();
    if (!m) throw new Error(`mandate not found: ${input.mandateId}`);
    if (m.status !== "active") throw new Error(`mandate not active (status=${m.status})`);
    if (input.amountPaise > m.limitPaise - m.spentPaise) {
      throw new Error(`amount ${input.amountPaise} exceeds remaining ${m.limitPaise - m.spentPaise}`);
    }
    mandateId = m.id;
  } else if (input.method === "upi_intent") {
    const intent = await payu.createUpiIntent({
      vpa: user.vpa,
      amountPaise: input.amountPaise,
      merchant: input.merchantId,
    });
    payuRef = intent.payuRef;
    approvalUrl = intent.approvalUrl;
  } else if (input.method === "card") {
    const provider = input.cardProvider ?? "stripe";
    const issued = await issuer.issueCard({ provider, userVpa: user.vpa, limitPaise: input.amountPaise });
    cardId = crypto.randomUUID();
    await db.insert(cards).values({
      id: cardId,
      userId: user.id,
      provider,
      cardToken: issued.cardToken,
      status: "active",
      limitPaise: input.amountPaise,
      spentPaise: 0,
      createdAt: Date.now(),
    });
    cardToken = issued.cardToken;
    last4 = issued.last4;
  } else {
    throw new Error(`unknown method: ${input.method}`);
  }

  await db.insert(paymentIntents).values({
    id,
    userId: user.id,
    mandateId,
    cardId,
    merchantId: input.merchantId ?? null,
    amountPaise: input.amountPaise,
    description: input.description ?? null,
    method: input.method,
    status: "requires_confirmation",
    payuRef,
    approvalUrl,
    createdAt: Date.now(),
  });

  return {
    intentId: id,
    status: "requires_confirmation",
    method: input.method,
    amountPaise: input.amountPaise,
    approvalUrl: approvalUrl ?? undefined,
    cardId: cardId ?? undefined,
    cardToken,
    last4,
  };
}

export async function confirmPaymentIntent(
  db: DB,
  payu: PayuClient,
  issuer: CardIssuer,
  input: ConfirmPaymentIntentInput,
): Promise<ConfirmPaymentIntentResult> {
  const it = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.intentId)).get();
  if (!it) throw new Error(`intent not found: ${input.intentId}`);
  if (it.status !== "requires_confirmation") {
    throw new Error(`intent not confirmable (status=${it.status})`);
  }

  // Capture by method.
  let ok = false;
  let payuTxnId: string | null = null;
  if (it.method === "upi_mandate") {
    const m = await db.select().from(mandates).where(eq(mandates.id, it.mandateId!)).get();
    if (!m) throw new Error(`mandate not found: ${it.mandateId}`);
    if (m.status !== "active") throw new Error(`mandate not active (status=${m.status})`);
    if (it.amountPaise > m.limitPaise - m.spentPaise) throw new Error("amount exceeds remaining");
    const debit = await payu.debit({ payuRef: m.payuRef!, amountPaise: it.amountPaise });
    ok = debit.ok;
    payuTxnId = debit.payuTxnId;
    if (ok) await db.update(mandates).set({ spentPaise: m.spentPaise + it.amountPaise }).where(eq(mandates.id, m.id));
  } else if (it.method === "upi_intent") {
    const debit = await payu.captureUpiIntent({ payuRef: it.payuRef! });
    ok = debit.ok;
    payuTxnId = debit.payuTxnId;
  } else if (it.method === "card") {
    // The card was presented at the merchant; treat the intent as the capture record.
    ok = true;
    payuTxnId = `card_${it.cardId}`;
  }

  const split = it.merchantId && ok ? await computeSplit(db, it.merchantId, it.amountPaise) : undefined;

  const paymentId = crypto.randomUUID();
  await db.insert(payments).values({
    id: paymentId,
    mandateId: it.mandateId,
    merchantId: it.merchantId,
    intentId: it.id,
    payuTxnId,
    amountPaise: it.amountPaise,
    operatorSharePaise: split?.operatorSharePaise ?? null,
    platformFeePaise: split?.platformFeePaise ?? null,
    status: ok ? "success" : "failed",
    createdAt: Date.now(),
  });

  // Single-use card: delete (cancel) it after the payment is done.
  let cardDeleted: boolean | undefined;
  if (it.method === "card" && it.cardId && ok) {
    const card = await db.select().from(cards).where(eq(cards.id, it.cardId)).get();
    if (card) {
      cardDeleted = await issuer.cancelCard({ provider: card.provider, cardToken: card.cardToken });
      await db.update(cards).set({ status: "closed" }).where(eq(cards.id, card.id));
    }
  }

  await db
    .update(paymentIntents)
    .set({ status: ok ? "captured" : "failed" })
    .where(eq(paymentIntents.id, it.id));

  return {
    intentId: it.id,
    status: ok ? "captured" : "failed",
    paymentId,
    split,
    cardDeleted,
  };
}
