# Captain delivery offers — regression test plan

## Safety
Run only against an isolated disposable Supabase database. Do not apply this migration to production before the SQL checks below pass. Use synthetic users and orders only.

## Root-cause evidence from production (read-only)
- 0 rows exist in `public.user_roles` for `captain`.
- 3 role requests are marked `requested_role='captain'` and `status='approved'`, but all 3 are missing the corresponding captain role assignment.
- The current direct-post notification function selects recipients from `public.user_roles`, so it had no captain recipients.
- Existing notification triggers cover apparel and electronics only; food-post orders had no offer notification trigger.
- Captain RLS policies for food/apparel/electronics already permit users with `deliveries.claim` to read confirmed, unassigned orders.

## Regression matrix
1. Approved-role reconciliation: approved captain request with no user_roles row gets exactly one captain role; pending/rejected requests are unchanged; existing role rows are not duplicated.
2. Food order confirmation: pending food order does not notify; transition to confirmed with delivery pending and captain_id null inserts a `delivery_offer` for each active captain.
3. Apparel/electronics confirmation: same behavior for both direct-post order tables.
4. Insert already confirmed: a confirmed, unassigned order inserted directly creates offers.
5. Non-offer updates: updates to unrelated fields, or updates when status remains confirmed, do not duplicate notifications.
6. Ineligible orders: cancelled/rejected orders, assigned orders, and non-pending delivery statuses do not create offers.
7. Catch-up: existing confirmed, unassigned offers create notifications for active captains that lack a matching notification; repeat migration is safe and creates no duplicates.
8. Dashboard: an authenticated captain can query open offers through existing RLS and see the order in the “داواکارییە نوێکان” section; the claim RPC atomically assigns it to at most one captain.
9. Financial safety: order status, delivery status, payment status, wallet balances, COD ledger, captain earnings, and commission holds are unchanged by the migration.
10. Existing store/restaurant delivery flow and notifications remain intact.

## Current status
This is a test plan only. No test database has executed the migration. Frontend CI does not validate SQL syntax, trigger behavior, RLS, or data reconciliation. Keep the PR Draft until isolated database evidence is available.
