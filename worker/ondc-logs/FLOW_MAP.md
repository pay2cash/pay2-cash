# ONDC RET10 v1.2.5 — flow code → required action sequence

Decoded from ONDC-Official/log-validation-utility `shared/validateRetailLogsV2.ts`.
Pramaan/console flow IDs == these codes. The validator REQUIRES exactly these action
keys per flow (missing any → "Missing required data of: <action>").

Pass the code as the 2nd arg to the local validator:
  cd /tmp/lvu && npx ts-node --transpile-only p2c-validate.ts <logdir> <code>

| Code | Likely name | Required actions |
|------|-------------|------------------|
| 1   | Catalog refresh (full + incremental) | search, on_search, inc_search, inc_onsearch |
| 2   | Order → full delivery lifecycle (+track) | search…on_confirm, on_status_pending→packed→agent_assigned→at_pickup→out_for_pickup→pickup_failed→picked→at_delivery→in_transit→at_destination_hub, track, on_track, on_status_out_for_delivery→delivery_failed→delivered |
| 3   | Out of stock then order | search, on_search, select_out_of_stock, on_select_out_of_stock, select…on_confirm, full on_status lifecycle, track, on_track |
| 4   | Order cancellation | search…on_confirm, cancel, on_cancel |
| 5   | Part cancel + RTO | search…on_confirm, on_update_part_cancel, update_settlement_part_cancel, on_status…, on_cancel, on_status_rto_delivered |
| 6   | Return / liquidation | search…on_confirm, on_status…delivered, update_liquidated, on_update_interim_liquidated, on_update_liquidated, update_settlement_liquidated |
| 7   | Catalog rejection (full search) | search, on_search, catalog_rejection |
| 8   | Search only | search, on_search |
| 9   | Catalog rejection (incremental) | inc_search, inc_onsearch, catalog_rejection |
| 020 | Standard order → delivery (simple) | search…on_confirm, on_status_pending→packed→picked→out_for_delivery→delivered |
| 0091–0098 | Offers (discount, buyXgetY, freebie, slab, combo, delivery, exchange, financing) | search…on_confirm (+cancel for 0091) |
| 00A | Order → delivery | search…on_confirm, on_status pending→packed→agent_assigned→picked→out_for_delivery→delivered |
| 00B | Replacement | order→delivered, update_replacement, on_update_interim_reverse_qc, on_update_approval, on_update_replacement, replacement_on_status pending→…→delivered |
| 00C | Order → delivery + update | order→delivered + update |
| 00D | Order → delivery + cancel | order→delivered, cancel, on_cancel |
| 00E | Order → packed + update | search…on_confirm, on_status pending→packed→picked, update |
| 00F | Update delivery address | search…on_confirm, update_address, on_update_address |
| 001 | Order to confirm (basic) | search…on_confirm |
| 002 | Order → picked | search…on_confirm, on_status pending→packed→agent_assigned→picked |
| 003 | Order → picked | search…on_confirm, on_status pending→packed→picked |
| 004 | Order → delivery | search…on_confirm, on_status pending→packed→agent_assigned→picked→out_for_delivery→delivered |
| 005 | Cancel + force cancel | order, on_status…picked, cancel, force_cancel, on_cancel |
| 010 | Delivery with OTP auth | order→out_for_delivery, on_update_delivery_auth, on_status_delivered |
| 011 | Update instructions | search…on_confirm, update_instructions, on_update_instructions |
| 012 | Order + track mid-flow | order, on_status…picked, track, on_track, on_status out_for_delivery→delivered |
| 015 | Liquidation (agent-assigned variant) | order→delivered, update_liquidated chain |
| 016 / 01E / 01F | Order to confirm (variants) | search…on_confirm |
| 017 | Order + on_update + on_cancel | order→delivered, on_update, on_cancel |
| 019 | Order + track + at_delivery | order, on_status…picked, track, on_track, on_status_at_delivery→delivered |
| 01C | Order → delivery | search…on_confirm, on_status pending→packed→picked→out_for_delivery→delivered |
| 01D | Order → pending | search…on_confirm, on_status_pending |
| 008 | Order to init only | search, on_search, select, on_select, init, on_init |
| 022 | Search only | search, on_search |
| 025 | Search + select | search, on_search, select, on_select |

NOTE: the on_status_* transitions are SELLER-driven (Pramaan mock emits them to our
subscriber). Our driver must trigger/capture each — a single `status` call only yields
one on_status. This is the main build work for the fulfillment-lifecycle flows (2,3,5,6,
020,00A,00B,00C,00D, etc.).
