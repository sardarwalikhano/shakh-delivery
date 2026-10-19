# Shakh financial status migration — regression test plan

## Safety boundary

- Run only against an isolated disposable Supabase project/database, never production.
- Use synthetic users, posts, variants, and orders only.
- Do not seed real customer data, wallet balances, or financial ledger entries.
- Do not mark the migration production-ready based only on frontend CI.

## Preconditions to verify in the isolated database

1. The baseline migrations install both RPCs with these signatures:
   - `public.update_apparel_post_order_status(uuid,text)`
   - `public.update_electronics_post_order_status(uuid,text)`
2. `public.apparel_post_orders` and `public.electronics_post_orders` contain the columns referenced by the migration.
3. The `status`, `delivery_status`, and `payment_status` enum/text values support the expected transitions.
4. The deployed RPC owners and grants are preserved as intended after `CREATE OR REPLACE FUNCTION`.
5. The installed delivery/payment triggers in `20261018120000_direct_post_captain_delivery_v1.sql` remain present and enabled.

## Test matrix

| Case | Initial state | Action | Expected result |
|---|---|---|---|
| Apparel: prevent false delivery | status=confirmed, delivery_status=pending, payment_status=pending | seller calls status RPC with delivered | RPC raises; order and ledgers unchanged |
| Apparel: delivery complete but unpaid | status=confirmed, delivery_status=delivered, payment_status=pending | seller calls status RPC with delivered | RPC raises; payment remains pending |
| Apparel: legitimate COD completion | captain completes delivery and payment RPC records exact total | seller/admin calls status RPC with delivered | status becomes delivered; no duplicate commission or COD ledger entries |
| Electronics: prevent false collection | status=confirmed, delivery_status=pending, payment_status=pending | seller calls status RPC with delivered | RPC raises; payment stays pending |
| Electronics: legacy false-collection regression | status=confirmed, delivery_status=delivered, payment_status=pending | seller calls status RPC with delivered | RPC raises; payment stays pending |
| Electronics: legitimate completion | delivery_status=delivered and payment_status=collected through authoritative paths | seller/admin calls status RPC with delivered | status becomes delivered; ledger counts and amounts unchanged by final status call |
| Authorization | user is neither buyer, seller, nor authorized admin | call status RPC | RPC raises authorization error |
| Cancellation/restock | synthetic pending/confirmed order with known stock | cancel/reject once | stock is restored once, with expected order transition |
| Duplicate retry | already completed delivery/payment records | retry authoritative delivery/payment RPCs | idempotent behavior; no duplicate earnings, commission, or COD ledger rows |
| Rollback | any intentional failing test | assert state then rollback transaction | no test rows persist |

## Required evidence before approval

- SQL test run output for each case, including expected failures.
- Before/after snapshots for synthetic order status, stock quantity, wallet balance/held amount, commission holds, captain earnings, and COD ledger.
- Confirmation that repeated RPC calls do not duplicate ledger records.
- Confirmation that the application CI build passes on the exact commit.
- Independent review of any differences between the existing production function definitions and the replacement bodies in this migration.

## Current status

This is a test plan only. It does not execute SQL, create test data, or modify any database. Supabase database branching is unavailable on the current plan, so the migration remains unverified at database level and must not be applied to production yet.
