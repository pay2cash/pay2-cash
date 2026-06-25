// Drizzle schema — single source of truth for the pay2-cash tables (Cloudflare D1).
// Two-sided: users + credentials (demand) and merchants + splits (supply).
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type {
  MandateStatus,
  PaymentStatus,
  MerchantStatus,
  CardStatus,
  PaymentMethod,
  IntentStatus,
  FlightBookingStatus,
} from "../contract";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  vpa: text("vpa").notNull(), // user's UPI address, e.g. alice@okhdfcbank
  email: text("email"),
  createdAt: integer("created_at").notNull(), // epoch ms
});

// Credential A — a UPI Reserve Pay mandate: user authorises ONCE, agent spends within limit.
export const mandates = sqliteTable("mandates", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  payuRef: text("payu_ref"),
  status: text("status").$type<MandateStatus>().notNull(),
  limitPaise: integer("limit_paise").notNull(),
  spentPaise: integer("spent_paise").notNull().default(0),
  merchant: text("merchant"),
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at").notNull(),
});

// Credential B — a scoped virtual card token (agentcard.sh / Stripe Issuing).
export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  provider: text("provider").notNull(), // agentcard | stripe
  cardToken: text("card_token").notNull(),
  status: text("status").$type<CardStatus>().notNull(),
  limitPaise: integer("limit_paise").notNull(),
  spentPaise: integer("spent_paise").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// Operators onboarded as PayU child merchants (PayU does KYC/nodal/settlement).
export const merchants = sqliteTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  payuChildId: text("payu_child_id"), // PayU child-merchant id once onboarded
  settleVpa: text("settle_vpa").notNull(),
  platformFeeBps: integer("platform_fee_bps").notNull().default(200), // 2%
  status: text("status").$type<MerchantStatus>().notNull(),
  createdAt: integer("created_at").notNull(),
});

// A payment action intent: a specific proposed purchase, confirmed then captured.
export const paymentIntents = sqliteTable("payment_intents", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  mandateId: text("mandate_id").references(() => mandates.id),
  cardId: text("card_id").references(() => cards.id),
  merchantId: text("merchant_id").references(() => merchants.id),
  amountPaise: integer("amount_paise").notNull(),
  description: text("description"),
  method: text("method").$type<PaymentMethod>().notNull(),
  status: text("status").$type<IntentStatus>().notNull(),
  payuRef: text("payu_ref"),
  approvalUrl: text("approval_url"),
  createdAt: integer("created_at").notNull(),
});

// Flight bookings (EU use case) — a Duffel order paid with a single-use € card.
export const flightBookings = sqliteTable("flight_bookings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  cardId: text("card_id").references(() => cards.id), // the single-use card issued for it
  offerId: text("offer_id").notNull(), // Duffel offer id
  orderId: text("order_id"), // Duffel order id once booked
  bookingReference: text("booking_reference"), // airline PNR
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  status: text("status").$type<FlightBookingStatus>().notNull(),
  createdAt: integer("created_at").notNull(),
});

// ONDC Beckn callbacks (on_search/on_select/.../on_status) captured from the BPP
// during Pramaan flows — assembled into the verification logs submitted for prod.
export const ondcLogs = sqliteTable("ondc_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  transactionId: text("transaction_id"),
  messageId: text("message_id"),
  bppId: text("bpp_id"),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Audit trail of every agent-initiated payment, with the split breakdown.
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  mandateId: text("mandate_id").references(() => mandates.id), // null for card / upi_intent
  merchantId: text("merchant_id").references(() => merchants.id),
  intentId: text("intent_id").references(() => paymentIntents.id),
  payuTxnId: text("payu_txn_id"),
  amountPaise: integer("amount_paise").notNull(),
  operatorSharePaise: integer("operator_share_paise"),
  platformFeePaise: integer("platform_fee_paise"),
  status: text("status").$type<PaymentStatus>().notNull(),
  createdAt: integer("created_at").notNull(),
});
