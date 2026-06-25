// Card issuer — the "virtual card token" credential the agent presents at
// card-accepting checkouts.
//   provider "stripe"    -> REAL Stripe Issuing (international account)
//   provider "agentcard" -> stubbed (wire agentcard.sh later)

export interface IssuedCard {
  cardToken: string;
  last4?: string;
  brand?: string;
}

export interface CardIssuerConfig {
  stripeSecretKey?: string;
  issuingCurrency?: string; // e.g. "usd" for a US Stripe account
}

async function stripePost(key: string, path: string, params: Record<string, string>) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`stripe ${path}: ${j?.error?.message ?? r.status}`);
  return j;
}

export class CardIssuer {
  constructor(private cfg: CardIssuerConfig = {}) {}

  async issueCard(args: {
    provider: string;
    userVpa: string;
    limitPaise: number;
  }): Promise<IssuedCard> {
    if (args.provider === "stripe") return this.issueStripe(args);
    // agentcard.sh path — still stubbed.
    // TODO(cards): call agentcard.sh (`agent-cards-admin`) to mint a scoped card.
    return { cardToken: `stub_agentcard_card_${args.limitPaise}` };
  }

  // Real Stripe Issuing: create a cardholder, then a virtual card with a spend limit.
  private async issueStripe(args: { userVpa: string; limitPaise: number }): Promise<IssuedCard> {
    const key = this.cfg.stripeSecretKey;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    const currency = this.cfg.issuingCurrency ?? "usd";

    // Derive an E.164 phone from the VPA local-part (required for EU 3D-Secure).
    const local = args.userVpa.split("@")[0];
    const phone = /^\d{10}$/.test(local) ? `+91${local}` : "+919999999999";

    const cardholder = await stripePost(key, "issuing/cardholders", {
      type: "individual",
      // Stripe requires letters only, max 24 chars — VPA can't be used here.
      name: "Pay Cash User",
      phone_number: phone,
      "metadata[vpa]": args.userVpa, // keep the VPA linkage in metadata instead

      // Stripe Issuing account is in Latvia (LV/EUR) — cardholder must match.
      "billing[address][line1]": "Brivibas iela 1",
      "billing[address][city]": "Riga",
      "billing[address][postal_code]": "LV-1010",
      "billing[address][country]": "LV",
      // EU individual cardholders need a first/last name and Issuing terms acceptance.
      "individual[first_name]": "Pay",
      "individual[last_name]": "Cash",
      "individual[card_issuing][user_terms_acceptance][date]": String(Math.floor(Date.now() / 1000)),
      "individual[card_issuing][user_terms_acceptance][ip]": "1.1.1.1",
    });

    const card = await stripePost(key, "issuing/cards", {
      cardholder: cardholder.id,
      currency,
      type: "virtual",
      status: "active",
      // Limit reuses limitPaise as the spend cap in the card-currency minor unit.
      "spending_controls[spending_limits][0][amount]": String(args.limitPaise),
      "spending_controls[spending_limits][0][interval]": "all_time",
    });

    return { cardToken: card.id, last4: card.last4, brand: card.brand };
  }

  // Single-use card cleanup: cancel (permanently kill) a card after it's been paid.
  // Stripe Issuing has no hard delete — "canceled" is terminal and irreversible.
  async cancelCard(args: { provider: string; cardToken: string }): Promise<boolean> {
    if (args.provider !== "stripe") return false; // agentcard stub: nothing to call
    const key = this.cfg.stripeSecretKey;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    await stripePost(key, `issuing/cards/${args.cardToken}`, { status: "canceled" });
    return true;
  }
}
