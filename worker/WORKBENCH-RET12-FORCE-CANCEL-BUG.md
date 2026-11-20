# RET12 Force_Cancellation_Flow — the mock's `on_cancel_yes` step never generates

**Environment:** Workbench `https://workbench.ondc.tech` · Domain `ONDC:RET12` · Version `1.2.5` · Usecase FASHION · Buyer App (BAP) `ondc.agentbuy.online`

## Summary
In the **Force_Cancellation_Flow**, after the buyer app sends `cancel` (force: no) and
`cancel` (force: yes) — both accepted and recorded by the engine — the mock's own
`on_cancel_yes` step (the BPP response) is never generated or delivered. The flow stalls
at step 14/15, and the subsequent `update_settlement_cancel` (settlement refund) is
rejected by the sequence gate with `<update> not supported after <cancel>`, since the
engine never advanced past `cancel`. No error envelope is pushed to the participant.

## Reproduced
Twice, identically (transactions `39d5e811-27cb-4e13-8bda-e177c03ff5ff` and
`2dd80d53-1ac2-44b4-85c4-f46a65a0c86c`, 2026-11-19):

1. `select → init → confirm` accepted; all five lifecycle pushes
   (Accepted/Packed/Agent-assigned/Picked/Out-for-delivery) received.
2. `cancel` with `params` tag `force=no` (reason 052) — sync ACK, recorded.
3. `cancel` with `params` tag `force=yes` — sync ACK, recorded (transaction's last
   action is `cancel`, confirmed by the sequence-gate error below).
4. `on_cancel_yes` **never arrives** (nothing pushed to the subscriber URL; the
   buyer app polls for 60s+ and receives nothing).
5. `update` (`update_target: payment`, refund settlement) — NACK:
   `[FROM ONIX WORKBENCH] <update> not supported after <cancel>`.

## Why this is not a participant error
- The flow config itself is consistent: `on_cancel_yes` declares
  `responseFor: cancel_yes`, `unsolicited: false`; its `requirements` function is a
  pass-through; its `validate` is a pass-through.
- Every session-data key its `generate` dereferences is populated by earlier steps'
  `saveData` (items/provider/billing from init, quote/tat from on_select,
  payment/order_id/order_created_at from confirm, cancellation_reason_id from the
  cancel itself, last_updated_at from the on_status pushes).
- The same run pattern works on RET10's `Forced_Cancellation_Flow` (mock responds
  with `on_cancel` correctly), so the participant's cancel payloads are well-formed.
- `addDurationToTimestamp` (used in the generate) also runs successfully in this very
  flow's `on_status_out_for_delivery_force` generate, so the sandbox helper exists.

## Request
Please investigate why the mock engine does not generate/deliver `on_cancel_yes` for
this flow. Happy to re-run with a debug session or provide full captured logs.

## Impact
`Force_Cancellation_Flow` cannot be completed by any buyer app on RET12 1.2.5 FASHION
— the flow stalls after the forced cancel and the settlement-refund update is
unreachable.
