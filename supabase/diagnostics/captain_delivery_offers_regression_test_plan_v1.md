# Captain delivery offers — regression test plan

## Safety
Run only against an isolated disposable Supabase database. Do not apply this migration to production before the SQL checks below pass. Use synthetic users and orders only.

## Root-cause evidence from production (read-only)
- 0 rows exist in `public.user_roles` for `captain`.
- 3 approved captain requests exist, but none of their users currently has `captain` as the active `user_roles.role`; two distinct users still have `customer` as their active role, and one user has duplicate approved captain requests.
- `public.user_roles.user_id` is the primary key, so this app supports one active role per user. Approving another role must replace the previous role, not aggregate roles.
- The current direct-post notification function selects recipients from `public.user_roles`, so it had no captain recipients.
- Existing notification triggers cover apparel and electronics only; food-post orders had no offer notification trigger.
- Captain RLS policies for food/apparel/electronics already permit users with `deliveries.claim` to read confirmed, unassigned orders.

## Regression matrix
1. Single active role: approving any role replaces the previous `user_roles.role`; historical repair reconciles a user to `captain` only when captain is their most recent approved role request overall, their current role is `customer` or missing, and the role row was not updated after that approval; it must never overwrite a non-customer role or resurrect a stale captain role on rerun; pending/rejected requests do not change the active role.
2. Food order confirmation: pending food order does not notify; transition to confirmed with delivery pending and captain_id null inserts a `delivery_offer` for each active captain.
3. Apparel/electronics confirmation: same behavior for both direct-post order tables.
4. Insert already confirmed: a confirmed, unassigned order inserted directly creates offers.
5. Non-offer updates: updates to unrelated fields, or updates when status remains confirmed, do not duplicate notifications.
6. Ineligible orders: cancelled/rejected orders, assigned orders, and non-pending delivery statuses do not create offers.
7. Catch-up: existing confirmed, unassigned offers create notifications for active captains that lack a matching notification; repeat migration is safe and creates no duplicates.
8. Dashboard: an authenticated captain can query open offers through existing RLS and see the order in the “داواکارییە نوێکان” section; the claim RPC atomically assigns it to at most one captain.
9. Financial safety: order status, delivery status, payment status, wallet balances, COD ledger, captain earnings, and commission holds are unchanged by the migration.
10. Existing store/restaurant delivery flow and notifications remain intact.

## Role model
The app has exactly one active role per user. Approval of a new role replaces the previous active role. Do not aggregate permissions across old and new roles; all category/dashboard permissions must follow the newly approved role.

## Current status
This is a test plan only. No test database has executed the migration. Frontend CI does not validate SQL syntax, trigger behavior, RLS, or data reconciliation. Keep the PR Draft until isolated database evidence is available.
