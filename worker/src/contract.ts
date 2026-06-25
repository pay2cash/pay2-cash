// The pay2-cash MCP tool contract — a two-sided agentic-commerce platform.
//
//   SUPPLY side: onboard operators as merchants (PayU child merchants).
//   DEMAND side: issue agents a user-authorised spend credential (UPI mandate OR card).
//   When an agent pays an operator, PayU split-settles: operator share + platform fee.
//
//   model/agent  ->  pay2-cash MCP (these tools)  ->  PayU (Reserve Pay + Split Settlement)
//
// Amounts are always in PAISE (integer) to avoid float money bugs.

export type MandateStatus = "pending" | "active" | "paused" | "revoked" | "expired";
export type PaymentStatus = "initiated" | "success" | "failed";
export type MerchantStatus = "onboarding" | "active" | "suspended";
export type CardStatus = "active" | "frozen" | "closed";

// ============================ DEMAND SIDE ============================

// ---- tool: onboard_user -----------------------------------------------------
export interface OnboardUserInput {
  vpa: string; // e.g. "alice@okhdfcbank"
  email?: string;
}
export interface OnboardUserResult {
  userId: string;
  vpa: string;
}

// ---- tool: create_mandate (credential option A: UPI Reserve Pay) ------------
// User authorises a spend limit ONCE; agent spends within it. Pending until approved.
export interface CreateMandateInput {
  userId: string;
  limitPaise: number;
  merchant?: string; // optional: lock mandate to one merchant
  expiresAt?: number; // optional epoch ms
}
export interface CreateMandateResult {
  mandateId: string;
  status: MandateStatus;
  approvalUrl?: string;
}

// ---- tool: issue_card (credential option B: virtual card token) -------------
// A scoped, user-authorised card token the agent presents at any card checkout
// (agentcard.sh / Stripe Issuing). Works anywhere cards are accepted.
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

// ---- tool: agent_pay --------------------------------------------------------
// Agent spends against an ACTIVE mandate, within the remaining limit. If a
// merchantId is given, the payment is split (operator share + platform fee).
export interface AgentPayInput {
  mandateId: string;
  amountPaise: number;
  merchantId?: string; // operator being paid; enables split settlement
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

// ---- tool: mandate_status ---------------------------------------------------
export interface MandateStatusInput {
  mandateId: string;
}
export interface MandateStatusResult {
  mandateId: string;
  status: MandateStatus;
  limitPaise: number;
  spentPaise: number;
  remainingPaise: number;
}

// ============================ SUPPLY SIDE ============================

// ---- tool: onboard_merchant -------------------------------------------------
// Register an operator as a PayU child merchant (PayU handles KYC/nodal/settlement).
export interface OnboardMerchantInput {
  name: string;
  settleVpa: string; // where the operator gets settled
  platformFeeBps?: number; // platform commission in basis points (default 200 = 2%)
}
export interface OnboardMerchantResult {
  merchantId: string;
  status: MerchantStatus;
  payuChildId?: string;
  platformFeeBps: number;
}

// ---- tool: merchant_status --------------------------------------------------
export interface MerchantStatusInput {
  merchantId: string;
}
export interface MerchantStatusResult {
  merchantId: string;
  name: string;
  status: MerchantStatus;
  platformFeeBps: number;
}

// ======================= PAYMENT INTENTS (propose → confirm) =======================
// A payment action intent names a SPECIFIC purchase (amount + merchant + description)
// that the agent proposes; the user confirms; then it captures.
//   method "upi_mandate" — spend against an existing Reserve Pay mandate
//   method "upi_intent"  — a UPI Intent/collect the user approves in their app
//   method "card"        — a single-use virtual card; DELETED after capture

export type PaymentMethod = "upi_mandate" | "upi_intent" | "card";
export type IntentStatus = "requires_confirmation" | "captured" | "canceled" | "failed";

export interface CreatePaymentIntentInput {
  userId: string;
  amountPaise: number;
  method: PaymentMethod;
  merchantId?: string;
  description?: string;
  mandateId?: string; // required when method = "upi_mandate"
  cardProvider?: "stripe" | "agentcard"; // for method = "card" (default stripe)
}
export interface CreatePaymentIntentResult {
  intentId: string;
  status: IntentStatus; // "requires_confirmation"
  method: PaymentMethod;
  amountPaise: number;
  approvalUrl?: string; // UPI flows: where/how the user approves
  cardId?: string; // card flow: the single-use card to present
  cardToken?: string;
  last4?: string;
}

export interface ConfirmPaymentIntentInput {
  intentId: string;
}
export interface ConfirmPaymentIntentResult {
  intentId: string;
  status: IntentStatus; // "captured" | "failed"
  paymentId?: string;
  split?: SplitBreakdown;
  cardDeleted?: boolean; // true when a single-use card was deleted after capture
}

// ============================ FLIGHTS (EU use case) ============================
// search_flights -> Duffel offers; book_flight -> issue a single-use € card,
// create the Duffel order, then cancel the card. Amounts here are in MINOR units
// of the offer currency (e.g. EUR cents), kept separate from UPI paise.

export interface SearchFlightsInput {
  userId: string;
  origin: string; // IATA, e.g. "CDG"
  destination: string; // IATA, e.g. "BER"
  departureDate: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD for a round trip
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
  adults?: number; // default 1
  maxPriceMinor?: number; // optional budget filter, in minor units of the fare currency
  maxResults?: number; // default 5
}
export interface FlightOfferSummary {
  offerId: string;
  amountMinor: number;
  amount: string;
  currency: string;
  airline: string;
  expiresAt?: string;
  segments: Array<{
    from: string;
    to: string;
    departingAt: string;
    arrivingAt: string;
    marketingCarrier: string;
    flightNumber: string;
  }>;
}
export interface SearchFlightsResult {
  offerRequestId: string;
  currency?: string;
  offers: FlightOfferSummary[];
}

export interface FlightPassengerInput {
  givenName: string;
  familyName: string;
  bornOn: string; // YYYY-MM-DD
  gender: "m" | "f";
  title: "mr" | "ms" | "mrs" | "miss" | "dr";
  email: string;
  phoneNumber: string; // E.164
}
export interface BookFlightInput {
  userId: string;
  offerId: string;
  passengers: FlightPassengerInput[];
  maxPriceMinor?: number; // hard ceiling; booking fails if the fresh fare exceeds it
}
export type FlightBookingStatus = "confirmed" | "failed";
export interface BookFlightResult {
  bookingId: string;
  status: FlightBookingStatus;
  orderId?: string;
  bookingReference?: string; // airline PNR
  amountMinor?: number;
  currency?: string;
  cardLast4?: string; // the single-use card issued for this booking
  cardDeleted?: boolean; // card cancelled after the order was placed
  error?: string;
}
