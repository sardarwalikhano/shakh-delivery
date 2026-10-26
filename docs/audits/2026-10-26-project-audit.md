# SHAKH Delivery project audit — 2026-10-26

## Scope and evidence

Repository: sardarwalikhano/shakh-delivery  
Branch: feature/shakh-complete-audit-captain-presence  
Pull request: https://github.com/sardarwalikhano/shakh-delivery/pull/68  
Production Supabase project was inspected with read-only catalog queries. The new migration in this PR has **not** been applied to production. No PR was merged and no production deployment was promoted as part of this work.

This is a staged audit report, not a claim that every application route has been manually end-to-end tested.

## Changes implemented on this branch

- Added profiles.is_online and profiles.last_seen_at with an index for online-captain selection.
- Added authenticated RPC public.set_captain_presence(boolean). It requires auth.uid() and an active captain role, and only updates the caller's own profile.
- Added a profile trigger that rejects direct changes to the presence columns unless they are made through the authorized presence RPC.
- Added a database trigger on deliveries, food_post_orders, apparel_post_orders, and electronics_post_orders that rejects a new captain assignment/claim if the captain is not online or their heartbeat is older than two minutes. Existing delivery status changes for already assigned captains are not blocked.
- Added an Online/Offline control to the existing captain dashboard. While online, it sends a 45-second heartbeat and handles read/write failures with an error message.
- Changed dispatcher captain lookup to a restricted RPC that checks dispatcher permissions and uses the database clock, returning only captains whose online flag is set and whose heartbeat is within two minutes.
- Added a Realtime subscription to profile changes in the dispatcher view so the available captain list refreshes when presence changes.
- Added 28 FK lookup indexes for the 28 live-schema FK relationships that lacked a suitable left-prefix B-tree index in the audit query. This covers wallet/settlement, order receipt, role request, share-earning, WhatsApp outbox, cart cleanup, and remaining FK constraint checks. At audit time, every affected table was under about 130 KB; the index columns were matched to live column names and names are guarded with IF NOT EXISTS.
- Fixed confirmed payment-state gaps: (1) the food-post captain payment RPC previously allowed marking Mobile Cash orders as collected; it now restricts captain collection to COD, and the UI shows pending Mobile Cash as awaiting trusted confirmation. (2) both `update_product_post_order_status` (the RPC used by the UI) and `update_electronics_post_order_status` previously changed `payment_status` to `collected` when a seller changed order status to delivered. They now change order status without fabricating payment collection; payment remains at its existing status until a verified collection/confirmation flow records it.
- Fixed invalid dashboard navigation: links to non-existent payments/users/reports/support/audit routes were hidden until real pages exist, the missing reports quick action was removed, and unknown dashboard paths no longer silently render the dashboard home. Wallet, receipt, role-request, delivery, and system-auditor pages remain available at their implemented routes.

## Security review findings

### SECURITY DEFINER inventory

Read-only catalog query found public SECURITY DEFINER functions have a pinned search_path; the reviewed ACL query returned no such function executable by anon. 47 functions are executable by authenticated, which is not inherently a vulnerability: function bodies must authorize each operation. A representative inspection of delivery claim, COD recording, withdrawal, top-up review, captain cash balance, role-review, share link, and audit functions found ownership/permission checks in the examined implementations.

This is not yet a complete line-by-line security certification of every function body. Remaining work is to systematically review all 47 bodies and test adversarial caller identities using a non-production Supabase environment.

### Tables with RLS enabled and no direct policies

The live schema currently has no direct RLS policies on:
- private.customer_delivery_points
- private.system_audit_runs
- public.whatsapp_message_outbox

Read-only catalog/function inspection indicates these are intentionally accessed through restricted definer functions/triggers rather than direct client table access:
- customer delivery coordinates are written through public.set_my_delivery_point and consumed internally by the delivery-zone trigger;
- audit runs are inserted by public.run_system_audit and read through public.get_system_audit_history, which checks Super Admin plus audit.view;
- WhatsApp outbox rows are queued by server-side functions and recipient status is read through public.get_my_whatsapp_outbox_status, filtered by recipient_user_id = auth.uid().

No broad table policies were added. Keep the tables private and test the RPC boundaries in a test environment.

### Advisor and schema observations

- Supabase Security Advisor reports 47 authenticated-executable definer functions. The ACL/search-path checks above narrowed this from a blanket finding to a body-review task.
- Supabase Advisor reports 25 unindexed foreign-key relationships. An independent catalog query identified additional uncovered FK columns under a stricter left-prefix rule; not all deserve indexes, particularly low-frequency audit columns and parent references that are rarely deleted.
- Supabase Advisor reports the pg_net extension in the public schema. Moving it may affect existing function references and needs a separate dependency audit before any change.
- The historic 42703 error (column "category" does not exist) was not reproduced by the current schema catalog: public.posts.category exists as a user-defined enum. No production schema change was made for this historic error. If the error returns, capture the exact table/query and compare it to the current schema rather than adding a duplicate column.

## Verification status

- GitHub Actions CI: the run for the earlier commit 34a845ef... passed TypeScript and production build. A new run for the current head 884977c... was in progress at last check; rerun/confirm this latest result before review. CI uses placeholder public environment variables and does not test production database access.
- Vercel: the preview for earlier commit 34a845ef... was READY and returned HTTP 200 for the Sorani RTL app shell. A new preview for current head 884977c... was queued at last check; verify the latest-head deployment before review.
- Preview for the exact audited commit returned HTTP 200 and served the Kurdish Sorani RTL app shell. This is not an authenticated workflow test.
- Live Storage inspection found public post/product image buckets constrained to JPEG/PNG/WebP and 5 MiB per file, and private payout/wallet-receipt buckets allowing common image/PDF MIME types with 5 MiB limits. Existing object policies scope uploads by permission and folder ownership; no storage policy was changed.
- Not yet run: authenticated captain online/offline integration tests, RLS tests using multiple users, full financial integrity tests, all-role dashboard tests, all route/profile UI regression tests, mobile/tablet visual checks, and full end-to-end tests.
- The presence-only subset migration was applied to the separate `testing` Supabase project (not production); unauthenticated calls to `set_captain_presence` and `get_available_captains` were rejected with SQLSTATE 42501 as expected. An authenticated positive-path test was blocked by the SQL tool's security checks and no test users were created. No migration has been applied to production. The full feature will not work against production until the migration is reviewed and applied.

## Required next checks before release

1. Confirm latest GitHub Actions CI and latest-head Vercel Preview are successful.
2. Apply the migration only in a non-production Supabase test project first; verify captain self-toggle, direct-column update rejection, heartbeat timeout, and assignment rejection for offline/stale captains.
3. Run two-user/RLS tests for the three private/no-policy tables and all sensitive definer RPCs.
4. Audit the remaining financial, role review, storage, authentication, and catalog query paths. Review the pg_net dependency before any schema move.
5. After approved tests, schedule production migration execution and merge separately. Do not promote production until those checks pass.
