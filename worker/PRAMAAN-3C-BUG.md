# Flow 3C (RET_4c) "Merchant Side Full Order Cancellation" — backend returns "No test flow configured", impossible to certify

**Environment:** Pre-Prod · Domain `ONDC:RET10` · Version `1.2.5` · Buyer App (BAP) `ondc.pay2.cash`
**Console:** `https://pramaan.ondc.org/beta/preprod/gui/iframe`

## Summary
The buyer console exposes a **Flow 3C — "Merchant Side Full Order Cancellation"** card, but its backend test flow (`flow_id: RET_4c`) is **not configured on the server**. Pressing **Start** calls the test runner, which immediately **NACKs**, so the flow can never run and no buyer app can be certified on it. Flows **3A** and **3B** (same merchant-cancellation family) work correctly, so this is specific to 3C / `RET_4c`.

## Steps to reproduce
1. As a certified Pre-Prod BAP, place a prepaid RET10 order (`search → … → confirm`); the order reaches `Accepted / Pending`.
2. In the console, select **Flow 3C — Merchant Side Full Order Cancellation** and press **Start**.

## Expected
The mock seller fires an unsolicited `on_cancel` (order `Cancelled`, `cancelled_by` = seller) to the BAP, as it does for 3A/3B.

## Actual
The console's Start button issues:

```
POST https://pramaan.ondc.org/beta/preprod/testing/buyer/runTest
{
  "test_id": "<id>",
  "tests": [{ "flow_id": "RET_4c", "transaction_id": "<txn>" }],
  "id": "ondc.pay2.cash",
  "version": "1.2.5",
  "environment": "Preprod",
  "type": "RETAIL",
  "domain": "ONDC:RET10"
}
```

and the server responds:

```json
{
  "message": { "ack": { "status": "NACK" } },
  "error": { "code": "30000", "message": "No test flow configured for flow_id RET_4c" }
}
```

No `on_cancel` is ever sent; the order stays `Accepted / Pending` indefinitely. The transaction's dashboard config
(`GET /beta/preprod/gui/iframe/seller/dashboard?...`) shows `technical_cancellation_flow: false` and it never flips,
consistent with the test flow never being invoked.

## Impact
Flow 3C cannot be completed by **any** buyer app — the card is shown in the UI but has no corresponding backend test
flow, so the "Submit to ONDC" gate can't be satisfied for this scenario.

## Request
Please either configure the `RET_4c` test flow on the Pre-Prod test runner, or remove/disable the 3C card if it is
not a required certification flow (3A + 3B already cover merchant-side cancellation).
