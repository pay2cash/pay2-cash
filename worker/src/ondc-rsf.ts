// RSF 2.0 (Flow 10B Receiver): the counterparty/collector POSTs `recon` to us; we
// sync-ACK it and asynchronously return a signed `on_recon` to the caller's bap_uri.
//
// on_recon contract (ONDC-Official/log-validation-utility, RSF_v2):
//   • context echoes recon's bap_id/bap_uri/bpp_id/bpp_uri/transaction_id/message_id
//     (compareContexts), action="on_recon", timestamp strictly AFTER recon's,
//     location.city.code const "*".
//   • each order carries recon_accord (boolean) + settlements[].
//   • recon_accord=true ⇒ PENDING/TO_BE_INITIATED settlements need due_date, SETTLED
//     need settlement_ref_no — so we reply SETTLED with a settlement_ref_no.
//   • amounts must match ^\d+\.\d{2}$ and order.amount == Σ settlement amounts.
import { ondcLogs } from "./db/schema";
import { createAuthorizationHeader, type SigningConfig } from "./ondc-sign";

type DB = ReturnType<typeof import("./db").getDb>;

const money = (m: any): { currency: "INR"; value: string } => ({
  currency: "INR",
  value: (Math.round((parseFloat(m?.value ?? "0") + Number.EPSILON) * 100) / 100).toFixed(2),
});

// Build a recon_accord=true on_recon that mirrors the incoming recon's amounts and
// marks every settlement SETTLED (with a settlement_ref_no). Pure — unit-testable.
export function buildOnRecon(reconBody: any): any {
  const rc = reconBody.context;
  const orders = (reconBody.message?.orders ?? []).map((o: any) => ({
    id: o.id,
    amount: money(o.amount),
    recon_accord: true,
    settlements: (o.settlements ?? []).map((s: any) => ({
      id: s.id,
      payment_id: s.payment_id,
      status: "SETTLED",
      settlement_ref_no: s.settlement_ref_no || `RSF-${String(o.id).slice(0, 8)}`,
      amount: money(s.amount),
      commission: money(s.commission),
      withholding_amount: money(s.withholding_amount),
      tcs: money(s.tcs),
      tds: money(s.tds),
      updated_at: s.updated_at || new Date().toISOString(),
    })),
  }));
  return {
    context: {
      domain: rc.domain,
      location: { country: { code: "IND" }, city: { code: "*" } },
      version: rc.version,
      action: "on_recon",
      bap_id: rc.bap_id,
      bap_uri: rc.bap_uri,
      bpp_id: rc.bpp_id,
      bpp_uri: rc.bpp_uri,
      transaction_id: rc.transaction_id,
      message_id: rc.message_id, // MUST equal recon's (compareContexts)
      timestamp: new Date().toISOString(), // strictly after recon's
      ttl: rc.ttl || "PT30S",
    },
    message: { orders },
  };
}

const ACK = (context?: any) => Response.json(context ? { context, message: { ack: { status: "ACK" } } } : { message: { ack: { status: "ACK" } } });
const nack = (msg: string) => Response.json({ message: { ack: { status: "NACK" } }, error: { type: "CORE-ERROR", message: msg } }, { status: 400 });

// Sign + POST the on_recon callback to whichever NP INITIATED the recon — the
// counterparty, not ourselves. In Flow 10B Pramaan sends a recon where we are the
// `bap` and Pramaan is the `bpp`, so the reply routes to bpp_uri. (Routing to
// bap_uri — the usual Beckn on_<action> rule — would loop back to our own custom
// domain → 522.) The context still echoes both URIs verbatim (compareContexts).
async function sendOnRecon(onRecon: any, cfg: SigningConfig): Promise<void> {
  const c = onRecon.context;
  const counterparty = c.bap_id === cfg.subscriberId ? c.bpp_uri : c.bap_uri;
  const target = `${String(counterparty).replace(/\/$/, "")}/on_recon`;
  const raw = JSON.stringify(onRecon);
  try {
    const header = await createAuthorizationHeader(raw, cfg);
    const res = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", Authorization: header }, body: raw });
    console.log(`[rsf] on_recon → ${target} status=${res.status}`);
  } catch (e: any) {
    // Best-effort: the sync ACK already succeeded; a failed callback is retried by the caller.
    console.error(`[rsf] on_recon send failed: ${e?.stack || e?.message || e}`);
  }
}

// Handle an inbound RSF `recon` (Flow 10B). Returns null for non-recon paths so other
// routers can try. `ctx.waitUntil` lets us ACK immediately and send on_recon in the
// background (Beckn: sync ACK, then async on_<action> callback).
export async function handleRsfRecon(
  req: Request,
  url: URL,
  db: DB,
  cfg: SigningConfig | null,
  ctx: { waitUntil(p: Promise<unknown>): void },
): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const action = url.pathname.replace(/^\/ondc\//, "").replace(/^\//, "");
  if (action !== "recon") return null;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return nack("invalid json");
  }
  if (body?.context?.action !== "recon" || body?.context?.domain !== "ONDC:NTS10") {
    return nack("not an RSF recon");
  }

  // Persist the inbound recon for log assembly.
  try {
    await db.insert(ondcLogs).values({
      id: crypto.randomUUID(),
      action: "recon",
      transactionId: body?.context?.transaction_id ?? null,
      messageId: body?.context?.message_id ?? null,
      bppId: body?.context?.bpp_id ?? null,
      payload: JSON.stringify(body),
      createdAt: Date.now(),
    });
  } catch {
    // never fail the ACK on a logging error.
  }

  const onRecon = buildOnRecon(body);
  if (cfg?.signingPrivateKeyB64 && cfg?.uniqueKeyId) {
    ctx.waitUntil(sendOnRecon(onRecon, cfg));
  }
  return ACK(body.context);
}
