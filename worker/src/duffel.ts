// Duffel flights — the EU "order layer" for the flight-booking use case.
// search_flights -> Duffel offer request; book_flight -> Duffel order.
//
// Payment model:
//   - We ALWAYS issue a single-use Stripe Issuing virtual card (€) as the
//     user-scoped spend credential (pay2-cash's core), then cancel it after.
//   - How Duffel itself is paid is set by DUFFEL_PAYMENT_TYPE:
//       "balance" — pay from the Duffel test/sandbox balance (default; works now)
//       "card"    — charge the issued card via Duffel Payments (production path,
//                   needs Duffel card-pay approval + 3DS automation)
//
// Amounts: Duffel uses decimal strings ("90.80") + ISO currency. Internally we
// keep integer MINOR units (cents) to stay consistent with the rest of pay2-cash.

const DUFFEL_BASE = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

export interface DuffelConfig {
  apiKey?: string;
  paymentType?: "balance" | "card";
}

export interface FlightSearchInput {
  origin: string; // IATA, e.g. "CDG"
  destination: string; // IATA, e.g. "BER"
  departureDate: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD for a round trip
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
  adults?: number; // default 1
  maxConnections?: number;
  maxResults?: number; // how many offers to return (default 5)
}

export interface FlightSegment {
  from: string;
  to: string;
  departingAt: string;
  arrivingAt: string;
  marketingCarrier: string;
  flightNumber: string;
}

export interface FlightOffer {
  offerId: string;
  amountMinor: number; // total price in minor units (e.g. cents)
  amount: string; // raw decimal string from Duffel
  currency: string;
  airline: string; // owner name
  expiresAt?: string;
  segments: FlightSegment[];
}

export interface FlightSearchResult {
  offerRequestId: string;
  offers: FlightOffer[];
}

export interface Passenger {
  givenName: string;
  familyName: string;
  bornOn: string; // YYYY-MM-DD
  gender: "m" | "f";
  title: "mr" | "ms" | "mrs" | "miss" | "dr";
  email: string;
  phoneNumber: string; // E.164, e.g. +491701234567
}

export interface CreatedOrder {
  orderId: string;
  bookingReference: string; // airline PNR
  amountMinor: number;
  amount: string;
  currency: string;
}

function toMinor(amount: string): number {
  // Duffel amounts are decimal strings; flight currencies (EUR/GBP/USD) are 2dp.
  return Math.round(parseFloat(amount) * 100);
}

export class DuffelClient {
  constructor(private cfg: DuffelConfig = {}) {}

  get paymentType(): "balance" | "card" {
    return this.cfg.paymentType ?? "balance";
  }

  private async req(path: string, init: RequestInit & { method: string }): Promise<any> {
    const key = this.cfg.apiKey;
    if (!key) throw new Error("DUFFEL_API_KEY not configured");
    const r = await fetch(`${DUFFEL_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Duffel-Version": DUFFEL_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.errors?.[0]?.message ?? j?.errors?.[0]?.title ?? r.status;
      throw new Error(`duffel ${path}: ${msg}`);
    }
    return j.data;
  }

  async search(input: FlightSearchInput): Promise<FlightSearchResult> {
    const slices: any[] = [
      { origin: input.origin, destination: input.destination, departure_date: input.departureDate },
    ];
    if (input.returnDate) {
      slices.push({
        origin: input.destination,
        destination: input.origin,
        departure_date: input.returnDate,
      });
    }
    const passengers = Array.from({ length: input.adults ?? 1 }, () => ({ type: "adult" }));

    const data = await this.req("/air/offer_requests?return_offers=true&supplier_timeout=20000", {
      method: "POST",
      body: JSON.stringify({
        data: {
          slices,
          passengers,
          cabin_class: input.cabinClass ?? "economy",
          ...(input.maxConnections != null ? { max_connections: input.maxConnections } : {}),
        },
      }),
    });

    const limit = input.maxResults ?? 5;
    const offers: FlightOffer[] = (data.offers ?? [])
      .slice(0, limit)
      .map((o: any) => this.mapOffer(o));

    return { offerRequestId: data.id, offers };
  }

  // Re-fetch a single offer to get a fresh price + the passenger ids needed to book.
  async getOffer(offerId: string): Promise<{ offer: FlightOffer; passengerIds: string[] }> {
    const o = await this.req(`/air/offers/${offerId}`, { method: "GET" });
    const passengerIds: string[] = (o.passengers ?? []).map((p: any) => p.id);
    return { offer: this.mapOffer(o), passengerIds };
  }

  async createOrder(args: {
    offerId: string;
    amount: string;
    currency: string;
    passengers: Array<Passenger & { id: string }>;
  }): Promise<CreatedOrder> {
    const data = await this.req("/air/orders", {
      method: "POST",
      body: JSON.stringify({
        data: {
          selected_offers: [args.offerId],
          passengers: args.passengers.map((p) => ({
            id: p.id,
            given_name: p.givenName,
            family_name: p.familyName,
            born_on: p.bornOn,
            gender: p.gender,
            title: p.title,
            email: p.email,
            phone_number: p.phoneNumber,
          })),
          payments: [{ type: this.paymentType, amount: args.amount, currency: args.currency }],
        },
      }),
    });
    return {
      orderId: data.id,
      bookingReference: data.booking_reference,
      amount: data.total_amount,
      amountMinor: toMinor(data.total_amount),
      currency: data.total_currency,
    };
  }

  private mapOffer(o: any): FlightOffer {
    const segments: FlightSegment[] = (o.slices ?? []).flatMap((s: any) =>
      (s.segments ?? []).map((seg: any) => ({
        from: seg.origin?.iata_code ?? s.origin?.iata_code,
        to: seg.destination?.iata_code ?? s.destination?.iata_code,
        departingAt: seg.departing_at,
        arrivingAt: seg.arriving_at,
        marketingCarrier: seg.marketing_carrier?.name ?? o.owner?.name ?? "",
        flightNumber: `${seg.marketing_carrier?.iata_code ?? ""}${seg.marketing_carrier_flight_number ?? ""}`,
      })),
    );
    return {
      offerId: o.id,
      amount: o.total_amount,
      amountMinor: toMinor(o.total_amount),
      currency: o.total_currency,
      airline: o.owner?.name ?? "",
      expiresAt: o.expires_at,
      segments,
    };
  }
}
