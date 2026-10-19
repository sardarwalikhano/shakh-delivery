# Supabase migration-history recovery inventory

**Status:** Investigation only — no production writes  
**Production project:** `jjtmtxrkbewmdxdmgtrf`  
**Related issue:** [#43 — Restore reproducible Supabase migration history for food orders and share links](https://github.com/sardarwalikhano/shakh-delivery/issues/43)  
**Related change:** [PR #42 — Captain delivery offers and notifications](https://github.com/sardarwalikhano/shakh-delivery/pull/42)

## Purpose and safety boundary

This inventory records verified migration-history gaps and the evidence needed to recover them. It is not a schema migration and must not be applied to a database.

- Keep production read-only until a complete schema-only recovery and clean replay are verified.
- Do not drop, recreate, or rename production objects.
- Do not change order, payment, wallet, commission, referral, or ledger rows.
- Preserve every existing trigger, policy, grant, constraint, index, function, and feature.
- Do not treat the partial `testing` project or its test-only fixtures as a clean replay or production-equivalent schema.

## Confirmed repository / production drift

1. Production migration history includes `20261012081736 / food_post_order_flow_v1`, but the corresponding versioned SQL file is not present at the expected path in `main`.
2. Production records the food cart migration as version `20261013072843`, while the source tree contains `20261013071759_food_post_cart.sql`. The source file creates `food_post_cart_items` and cart RPCs, but delegates checkout to the existing `public.create_food_post_order(...)` function; it does not create the base `food_post_orders` table.
3. `20261013075200_food_post_captain_payment_ledger.sql` alters `food_post_orders` and adds financial logic assuming the base table already exists; it is not a base-table migration.
4. `20261015170000_electronics_posts_checkout_share_rewards_v1.sql` creates electronics orders with a foreign key to `public.post_share_links(id)`, but the source migration tree has no identified authoritative creation migration for that table.
5. The Oct 15 Share & Earn UI commit explicitly describes reusing a production-applied migration rather than adding a new migration in that UI commit: [commit 4e9f03f](https://github.com/sardarwalikhano/shakh-delivery/commit/4e9f03fdffbad3b8add62aef05d8f885be87a0ec). The source SQL for that feature was subsequently recovered from its historical branch; see below.

These findings indicate incomplete/relabelled migration history; they do **not** indicate that these tables are absent from production.

## Recovered source history — food order base schema

A source copy of the missing initial food-order migration was found on the historical branch `feature/food-post-orders-20261012`:

- File: [`20261012081736_food_post_order_flow_v1.sql`](https://github.com/sardarwalikhano/shakh-delivery/blob/feature/food-post-orders-20261012/supabase/migrations/20261012081736_food_post_order_flow_v1.sql)
- The file creates `public.food_post_orders`, participant SELECT RLS, `create_food_post_order(...)`, `update_food_post_order_status(...)`, indexes, grants, and the Realtime publication entry.
- It is a credible source-recovery candidate for the missing production migration version `20261012081736`; however, it is **not yet a verified complete baseline** for the current production table. Production has 49 columns and additional delivery, payment, share-attribution, seller-fee, and captain-fee accounting objects added later. The recovered historical file defines a smaller initial table and must not be replayed directly against production or treated as sufficient to bootstrap the full schema.
- The follow-up commit [`6923b36`](https://github.com/sardarwalikhano/shakh-delivery/commit/6923b36def3a77b6ce100be1f60539e367c3d9b4) contains later `ALTER TABLE public.food_post_orders` additions and financial/delivery functions, but does not establish the missing original base schema by itself.

This narrows the recovery task: preserve the historical migration as provenance, then reconstruct the complete ordered chain of later additive changes and compare it to the read-only production catalog before writing any canonical migration. The source definition for `public.post_share_links` has now been recovered, but it does **not** match the current production catalog shape; the migration history/reconciliation path remains unresolved.

## Additional historical evidence — Share & Earn and financial follow-ups

Further source-history review found commit [`6df3ac8`](https://github.com/sardarwalikhano/shakh-delivery/commit/6df3ac8af96fc520413a90ff1d08168c3fff21ae) (Oct 19, 2026), titled “Complete prepaid wallets, Share rewards, commissions and COD settlement.” Its SQL changes **alter and use** `public.post_share_links` and `public.food_post_orders`, including expiry/attribution behavior, seller-funded reward holds, wallet/commission/COD settlement, and delivery-finance triggers. The diff does not contain a `CREATE TABLE public.post_share_links` base definition. This confirms the later financial migration depends on pre-existing objects and that reconstructing only the table columns is not sufficient.

The commit is useful provenance for the follow-up object graph, but its large combined diff is not a standalone clean bootstrap. Before any canonical migration is drafted, split its changes by original migration/commit boundaries and recover the actual production-applied SQL/version records. In particular, inventory every trigger on `food_post_orders` and `post_share_links` before replaying any follow-up, to avoid duplicate financial side effects.



## Recovered source history — Share & Earn base migration

The authoritative source-file candidate for the initial Share & Earn feature was found on historical branch `feat/post-share-rewards-referral-wallet-20261014`:

- File: [`20261014162000_post_share_rewards_referral_wallet_v1.sql`](https://github.com/sardarwalikhano/shakh-delivery/blob/feat/post-share-rewards-referral-wallet-20261014/supabase/migrations/20261014162000_post_share_rewards_referral_wallet_v1.sql)
- The migration creates `public.post_share_links`, `post_share_attributions`, referral wallet/transaction tables, referral reward and withdrawal tables, RLS policies, and RPCs. Its `post_share_links` shape is `id`, `token`, `post_id`, `sharer_id`, `click_count`, `created_at`, and `updated_at`, with uniqueness on `token` and `(post_id, sharer_id)`.
- PR #25 records that production had applied the Share & Earn migration under version `20261014172551` (`share_rewards_referrals_wallet_v1`), whereas the recovered source file is timestamped `20261014162000`. Treat this as a migration-version/source-path discrepancy to reconcile against the actual production migration ledger, not permission to reapply the file.
- The read-only production catalog currently reports a different six-column shape for `post_share_links`: `id`, `post_id`, `sharer_id`, `is_active`, `created_at`, and `expires_at`; it does not list `token`, `click_count`, or `updated_at`. The source migration's unique token and 30-day attribution behavior also differ from later source history describing fresh 24-hour share tokens.
- This is a material schema drift, not just a missing filename. Before any replay, recover the intermediate migrations/DDL or deployed schema changes that transformed the original table and verify dependencies of all RPCs, foreign keys, indexes, RLS policies, and financial triggers. Do not add/drop columns or replace the production table as a shortcut.



## Current-main evidence — 24-hour share-link evolution

The current main migration [`20261019120000_share_wallet_commissions_cod_settlement_v1.sql`](https://github.com/sardarwalikhano/shakh-delivery/blob/main/supabase/migrations/20261019120000_share_wallet_commissions_cod_settlement_v1.sql) explains part of the schema evolution: it expects `is_active` and `expires_at`, backfills a 24-hour expiry, adds active/expiry indexes, replaces `create_post_share_link(uuid)` to deactivate older links and create a fresh link per share, and drops several earlier reward/COD/captain-commission triggers to prevent duplicate financial side effects.

This is strong source evidence for why the original 30-day/token/click-count migration does not match the later production catalog. It is **not proof that this migration has been applied in production**. Its explicit trigger drops and financial behavior require exact comparison with the live trigger/function inventory before any replay. The main branch also contains later financial migrations; do not infer deployment state from merge status or code presence alone.

## Read-only production catalog evidence

### `public.food_post_orders`

- 49 columns across order identity, buyer/seller/post references, quantities and prices, delivery address/city/coordinates, delivery and payment states, captain assignment, share attribution/rewards, seller-fee accounting, and captain-fee accounting.
- Constraints cover foreign keys to `auth.users`, `profiles`, `posts`, and `post_share_links`; order number uniqueness; buyer/request idempotency; status and payment enumerations; phone/address lengths; quantity bounds; total consistency; and nonnegative/integer share amounts.
- Indexes include buyer-created, buyer/request unique, captain-delivery, order number unique, post-created, and seller-created.
- RLS is enabled. The SELECT policy covers the buyer, seller, `posts.manage` permission, and `deliveries.claim` users for assigned deliveries or confirmed/pending/unassigned offers.
- Existing triggers include wallet charges, share rewards, captain commission reservation/finalization, delivery-zone enforcement, cancellation share-credit refund, seller-fee reservation, and share-reward reservation.

### `public.post_share_links`

- Six columns: `id`, `post_id`, `sharer_id`, `is_active`, `created_at`, and `expires_at`.
- Foreign keys reference `posts` and `auth.users`; indexes cover active expiry, post/sharer expiry, and sharer-created ordering.
- RLS is enabled. SELECT is limited to the sharer or users with `share_rewards.manage`.

## Required recovery sequence

1. Compare the recovered initial SQL for `food_post_orders` and `post_share_links` against the production schema and recover the missing intermediate/deployed DDL from deployment records, backups, or source-control history. The initial source files alone are not sufficient baselines.
2. Recover the full related object graph: referenced enum types, constraints, indexes, RLS policies and grants, triggers, trigger functions, RPCs, and publication settings. In particular, inspect every function that touches fee holds, wallet balances, cash ledgers, share earnings, or delivery state.
3. Record source provenance and compare each recovered definition to production catalog output. Avoid replacing existing objects merely to make a clean replay pass.
4. Add versioned migrations or a documented bootstrap path that handles clean databases and existing production databases safely. Any baseline must be additive/idempotent where appropriate and must not duplicate already-applied production changes.
5. Build a truly disposable database from the repository's migration chain without test-only fixture tables/columns.
6. Run schema, RLS, role-transition, delivery-offer, notification idempotency, atomic-claim, and financial-invariance tests.
7. Keep PR #42 Draft until the SQL and end-to-end tests pass. Production changes require a separate explicit deployment decision.

## Known validation limitation

The existing `testing` project was only a partial migration replay and required test-only fixture schemas/columns for food, electronics, and apparel delivery fields before PR #42's migration could be applied. The migration rerun and trigger-catalog checks on that project are useful partial checks, but they do not prove a clean migration replay, production schema parity, end-to-end RLS behavior, or atomic claim correctness.
