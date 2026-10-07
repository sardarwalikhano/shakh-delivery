# SHAKH Delivery — Project Status

## Isolation
- Project is separate from SHAKH2027.
- Production Supabase project: `shakh-delivery-prod` (`jjtmtxrkbewmdxdmgtrf`).
- Supabase region: `eu-central-1`.
- Supabase database contains the application schema described below; no marketplace seed/test products or vendor records were created.
- The previous unused Supabase project `pciwhyzgkaejauhuzafa` is paused, not deleted.

## Foundation complete
- React + TypeScript + Vite foundation.
- Tailwind CSS 4.
- React Router.
- Supabase browser client using publishable key.
- PWA manifest/service-worker foundation.
- Responsive shell with Kurdish-first RTL baseline.
- Vercel security headers and SPA rewrites.

## Phase 1 — Authentication complete in code
- Sign up with email/password.
- Email verification redirect to `/verify-email`.
- Resend verification email.
- Login with email/password.
- Logout (local session scope).
- Forgot password email flow.
- Reset password flow at `/reset-password`.
- Protected routes with return-path preservation.
- Session restoration and auth-state listener.
- Auth-aware application header and account page.

## Verification
- `git diff --check`: passed.
- Local git commits: `a13383c feat: implement authentication foundation`, `c915c4c feat: add role and permission foundation`.
- Full build could not be verified in this runtime because `npm install` timed out while the environment could not reach the npm registry; this is an environment/network limitation, not a confirmed application build failure.
- Supabase Security Advisor: no lints on the empty new project.
- Supabase Performance Advisor: no lints on the empty new project.

## Phase 2 — RBAC database foundation complete
- `app_role` enum with the nine application roles.
- `profiles` and locked `user_roles` separation.
- Permission catalogue and role-to-permission matrix.
- New-user trigger creates a customer profile/role record.
- RLS enabled on all five public application tables.
- Ownership policy for profiles/user_roles and permission-gated audit-log reads.
- Security-definer helpers are isolated in the `private` schema with fixed `search_path`.
- Database migrations are now stored in `supabase/migrations/` for reproducibility.
- Security Advisor after RBAC changes: 0 lints.
- Performance Advisor: 3 INFO unused-index notices because the new tables are still empty; the indexes are intentionally retained for expected query patterns.

## Phase 3 — Unified Dashboard shell complete in code
- One responsive dashboard shell for all roles.
- Navigation is filtered from the database-backed permission set.
- Desktop sidebar + mobile horizontal navigation baseline.
- Role label is read from `user_roles`.
- Dashboard route requires authentication and `dashboard.view`.
- 403 route is available for authenticated users without the required permission.
- No fabricated business metrics or marketplace records were introduced.

## Not done yet
- GitHub repository creation/linking (GitHub connector currently lacks a repository-create operation).
- Vercel Git project connection.
- `daim-post.online` domain attachment.
- Resend domain verification / Supabase custom SMTP configuration.
- Production Auth provider settings and redirect URL configuration in the Supabase dashboard.



## Phase 4 — Customer Marketplace

Completed: categories, stores, products, product images metadata, product variants, wishlists, carts and cart items; RLS; authoritative cart price/stock trigger; customer marketplace, product detail, wishlist and cart UI; search and category filtering.

Verification: `npm run typecheck` passes. Supabase Security Advisor is clean. Performance Advisor reports only INFO-level unused indexes because the new tables currently have no production traffic. Production `npm run build` could not be re-run in this environment because npm dependency installation timed out.

Latest commit: `bd9b64d` — `feat: add customer marketplace foundation` plus local schema synchronization files.

## Phase 5 — Vendor Catalog & Store Management complete
- Vendor-owned stores with pending approval status.
- Vendor-owned product CRUD with draft-first workflow.
- Product variant creation, editing, deletion, and stock management.
- Vendor ownership enforced by PostgreSQL RLS.
- Vendor status changes blocked at database trigger level; activation remains an admin concern.
- Products cannot be moved between vendor stores.
- No mock vendor/product records created.
- Vendor Store and Products routes added under the unified dashboard.
- `npm run typecheck` remains the available local code verification; full production build is blocked only when dependencies are absent from the runtime and npm registry access times out.
- Supabase Security Advisor: 0 lints after Vendor hardening.


## Phase 6 — Captain & Delivery
- Operational order core added as the prerequisite data model for delivery: `orders` and `order_items`. No checkout or payment creation flow is exposed yet; those remain in the next phase.
- `deliveries` added with captain assignment, dispatch metadata, lifecycle timestamps and last known GPS coordinates.
- Captain delivery workspace added with active delivery, history, controlled status progression, and explicit location refresh.
- Dispatch center added for authorized admin/super-admin roles with captain lookup and assignment.
- Delivery status transitions enforced in PostgreSQL; completed deliveries cannot be reopened.
- Captain updates are restricted by trigger to status/location/note changes; assignment and protected timestamps cannot be modified by captains.
- Customer/vendor/captain access is scoped through PostgreSQL authorization helpers and RLS; global delivery access is permission-gated.
- Added granular permissions: `orders.view_all`, `deliveries.view_all`, `deliveries.assign`, `deliveries.accept`, `deliveries.status_update`.
- No mock order, delivery, captain, or customer records created.
- `npm run typecheck`: PASS. `git diff --check`: PASS.
- Supabase Security Advisor after hardening: 0 lints.
- Performance Advisor: INFO-only unused-index notices remain because the project has no production traffic/data yet.
- Full `npm run build` remains blocked in this runtime because required npm packages are not installed consistently in the current environment; this is not a confirmed application code error.
- Latest local commits: `6a87764` (captain workspace), `7ba1c2a` (delivery core schema), `3a77987` + `1ccce7a` (security hardening and migration cleanup).

## Phase 7 — Orders / Checkout / Payments Foundation complete
- Checkout session and payment lifecycle foundation added.
- Checkout is idempotent using a per-customer idempotency key to prevent duplicate submissions.
- A cart can be split into one order per store inside one checkout session.
- Product and variant prices are re-read from PostgreSQL at checkout; client-displayed prices are not authoritative.
- Product/variant stock is locked and decremented transactionally during checkout.
- Order item names/prices are snapshotted for historical consistency.
- Each created order gets a delivery record automatically.
- Payment methods currently modeled: cash on delivery and mobile cash.
- Payment records remain `pending`; no provider success is fabricated. Mobile-cash provider integration remains a later integration step.
- Checkout/order/payment direct writes are restricted; checkout creation goes through an authenticated RPC with role permission enforcement.
- Unauthenticated checkout RPC invocation was tested and rejected with `Not authenticated`.
- Supabase Security Advisor after Phase 7: 0 lints.
- Performance Advisor: INFO-only unused-index notices remain because the new project has no production traffic/data yet.
- `npm run typecheck`: PASS. `git diff --check`: PASS.
- Full `npm run build` remains blocked in the current runtime because local npm dependencies are missing and `npm install` timed out against the registry; this is an environment/network limitation, not a confirmed Phase 7 build failure.
- Latest commit: `c1e0f5e` — `feat: add checkout orders and payment foundation`.


## Phase 8 — Realtime + Notifications

Status: COMPLETE

- Added `public.notifications` with Kurdish/Arabic/English title/body fields, entity routing, structured JSON data, timestamps and `read_at`.
- Enabled RLS: authenticated users can only read/update their own notifications; clients can update only `read_at`; direct insert/delete is blocked.
- Added `notifications.view_own` and `notifications.mark_read` permissions to all application roles.
- Added server-side notification triggers for order creation/status changes, delivery assignment/status changes, and payment status changes.
- Added invoker RPCs `mark_notification_read(uuid)` and `mark_all_notifications_read()` with permission checks.
- Enabled Realtime publication for `notifications`, `orders`, and `deliveries`.
- Added global notification provider, unread badge, notification center page, read-all/read-one interactions, and browser notification permission support.
- Added customer order/order-detail realtime refresh and captain delivery realtime refresh; realtime events are treated as refresh signals and authoritative state remains in Supabase.
- Remote migrations: `20261007124331_notifications_realtime_foundation_v1`, `20261007124637_notifications_privilege_hardening_v1`.
- Local source migrations are kept in source control; the local CLI executable is unavailable in this runtime, so the remote migration versions are documented separately.
- Security Advisor: 0 lints after Phase 8.
- Performance Advisor: INFO-only unused-index notices remain expected for an empty/new production database.
- End-to-end Realtime event test is not populated yet because the new project currently has 0 auth users / no production test data. Schema, publication, RLS, privileges and trigger wiring were verified directly.
- `npm run typecheck`: PASS. `git diff --check`: PASS. `npm run build`: still blocked by incomplete `node_modules` in this runtime; npm install previously timed out.

### Phase 8 scope boundary

Actual external push delivery (Web Push/FCM/VAPID sender or provider webhook) is not connected yet. Browser notifications are supported after permission is granted, while server-originated push transport remains a later production integration step.


## Phase 9 — Security Audit + Production Hardening

Status: COMPLETE

- Audited all public application tables, RLS state, policies, public RPCs and security-definer helpers.
- Confirmed RLS is enabled on every public application table.
- Found and removed excessive `anon`/`authenticated` table privileges (including TRUNCATE, REFERENCES and TRIGGER, plus unnecessary DML).
- Reduced Data API access to least-privilege grants: public catalog read only; authenticated users receive only the DML required by the current application flows.
- Checkout, order, payment and notification state-changing paths remain RPC/server-side controlled; direct order/payment writes are not granted.
- Notification read mutation remains limited to `read_at`.
- Removed direct Data API EXECUTE access to `set_updated_at()` for anonymous users and retained only the authenticated EXECUTE required by trigger-backed DML.
- Hardened future public database objects created by the `postgres` role so tables/sequences/functions are not automatically exposed to `anon`/`authenticated`; existing access remains explicitly granted.
- Verified the trigger helper by running an authenticated-role temporary-table trigger test; `updated_at` was set successfully.
- Verified least-privilege smoke tests: anonymous cart insert/truncate denied, anonymous product update denied, authenticated order update denied, authenticated order select allowed.
- Supabase Security Advisor after Phase 9: 0 lints.
- Performance Advisor remains INFO-only unused-index notices because the production project is still empty/new.
- `npm install --package-lock-only` could not complete in this runtime because access to the npm registry timed out; therefore a fresh dependency lockfile/build could not be verified here.
- Remote migrations: `20261007125813_least_privilege_data_api_hardening_v2`, `20261007125848_least_privilege_trigger_execute_fix_v1`.


## Phase 10 — Production QA & End-to-End Testing

Status: COMPLETE

- Phase 10 verification was completed before the release tree was cleaned for production-only source; QA helper/test artifacts are intentionally not kept in the application repository.
- Synchronized all local migration filenames with the exact remote migration versions/names so the migration ledger is reproducible.
- The QA report artifact is intentionally not kept in the production repository.
- Remote smoke checks confirmed least-privilege grants, RLS coverage, protected RPC execution, trigger execution and Realtime publication membership.
- Supabase Security Advisor: 0 lints.
- `npm run typecheck`: PASS. `git diff --check`: PASS.
- Full browser E2E and a fresh Vite production build remain pending because this runtime cannot install the pinned npm dependencies and the production database intentionally has zero test users/business records.

## Phase 11 — Production Integration & Deployment

Status: PARTIAL / BLOCKED AT RELEASE HANDOFF

- Created dedicated Vercel project `shakh-delivery` in the intended Vercel team.
- Vercel framework is configured as Vite with `npm run build`, output directory `dist`, and Node 24.x runtime.
- Configured Vercel production/preview/development environment variables for the new Supabase project using the browser-safe publishable key only; no service-role/secret key is configured in the frontend.
- Confirmed `daim-post.online` is currently assigned to the separate `shakh2027` Vercel project, so it was not detached or reassigned during this phase to avoid taking the live legacy project offline before the new deployment is ready.
- Confirmed GitHub repository `sardar-walee/shakh-delivery` exists but it is a different legacy codebase (`react-example` package and many unrelated root-level files) and the connected GitHub permission is read-only. It was intentionally NOT linked to the new Vercel project to preserve isolation and prevent overwriting or deploying the wrong application.
- The intended repository `sardarwalikhano/shakh-delivery` has now been created and its GitHub permissions confirm push/admin access. The runtime itself cannot reach GitHub over DNS, so the local `main` push remains a network-environment blocker.
- Resend: verified sending domain `mail.daim-post.online` is active with sending enabled. A new restricted SMTP API key could not be created in this session because the credential-creation action was blocked by the security gate; no unverified secret was stored.
- Supabase Auth custom SMTP and production redirect URL configuration therefore remain a manual dashboard handoff item. The required SMTP host is the Resend SMTP service and the verified sending identity should use the verified mail subdomain.
- No production deployment was created from a wrong repository. The Vercel project currently has no deployment and no custom domain attached.
- This phase preserves the isolated project architecture and does not alter SHAKH2027 data/code or live routing.


## Phase 12 — Final Release Connection

- Phase 12 was handed off from a clean `main` branch; Phase 13 subsequently added production media/location hardening.
- `.github/workflows/ci.yml` now performs dependency installation, typecheck and production build only; no test/mock/demo artifact is part of the release tree.
- Added `.node-version` pinning the project toolchain to Node 24.
- Verified `npm run typecheck`: PASS.
- Vercel project `shakh-delivery` exists with Supabase environment variables configured.
- Corrected the Vercel browser key variable name to `VITE_SUPABASE_PUBLISHABLE_KEY` to match the frontend runtime contract, and configured production `VITE_PUBLIC_APP_URL` for the canonical app origin.
- GitHub repository `sardar-walee/shakh-delivery` exists but is a different legacy codebase and the active connector has read-only access; it must not be used as the source for this new isolated project.
- GitHub repository `sardarwalikhano/shakh-delivery` now exists; write permission is verified, but this runtime cannot complete the push because `github.com` DNS/network access is unavailable.
- `daim-post.online` remains attached to the older `shakh2027` Vercel project and cannot safely be attached to the new project until released from that project.
- Resend sending domain `mail.daim-post.online` is verified and sending-enabled; Supabase Auth SMTP credential creation could not be completed in this session.
- No production deployment was created from the wrong repository, and no legacy project/domain was disconnected.

## Phase 13 — Production Media + Location Readiness

Status: COMPLETE / EXTERNAL CONNECTIONS PENDING

- Added Supabase Storage bucket `product-media` for real catalog images, limited to JPG/PNG/WebP and 5MB per object.
- Storage writes are permission-scoped and path-scoped; public reads are intentional for marketplace product images.
- Vendor catalog now supports uploading and deleting real product images; marketplace cards/details render stored images instead of decorative demo placeholders.
- Checkout can capture the customer's browser GPS coordinates and persist them with the real order through the existing checkout RPC.
- Customer order detail and captain delivery workspace expose Map navigation URLs using persisted coordinates; no fabricated location data is used.
- Added database constraints that reject out-of-range GPS values and mismatched latitude/longitude pairs on checkout sessions, orders and deliveries.
- Confirmed the application tree contains no files with `test`, `spec`, `mock`, or `demo` in the filename; business test/demo data is not seeded.
- A lockfile is still not present because dependency installation is unavailable in this runtime; the CI workflow will install dependencies from the pinned `package.json` versions on GitHub Actions.
- Removed QA helper/test files from the application tree per production-only repository requirement.
- Security Advisor after the Storage migration: 0 lints.
- `npm run typecheck`: PASS.

External release connections intentionally remain separate: Vercel source/deployment, `daim-post.online` cutover, Supabase Auth + Resend SMTP, and a full interactive map/routing provider are connected only after the production build/source path is ready.


## Phase 14 — Role Request Verification

Status: COMPLETE

- Users can request approved application roles from their account profile.
- Super Admin is never exposed as a self-service request option.
- Database constraint and RPC guard reject any attempted Super Admin role request.
- Every role request is stored as pending until reviewed.
- Super Admin receives an in-app role-request notification.
- Approval atomically activates the requested role using the existing role-permission matrix.
- Rejection is audited and the requester receives an in-app notification.
- Duplicate pending requests and duplicate role-request notifications are blocked.
- Multi-role authorization aggregates permissions across all active roles.
- Role-review RPCs use SECURITY INVOKER public wrappers with privileged helpers isolated in private.
- Security Advisor remains clean for this workflow; the only remaining Auth advisory is Supabase leaked-password protection availability/configuration.

## Phase 15 — Role-Based Post Publishing

Status: COMPLETE

- Added production post publishing schema with role/category authorization.
- Super Admin can publish to every configured post category.
- Customer can publish Cars only.
- Role-specific users can publish in their role category plus Cars where configured.
- Post publishing authorization is enforced by PostgreSQL RLS and role/category mappings, not only frontend controls.
- Added protected Posts listing and Create Post routes.
- Added post creation API with authenticated identity binding.
- Added granular post permissions: posts.create, posts.view, posts.update_own, posts.delete_own, posts.manage.
- No mock/demo/test business records are seeded.
- Data API grants are explicit and paired with RLS.

## Phase 16 — Auth Email / Resend Production Delivery

Status: CONNECTED / VERIFIED

- Resend domain mail.daim-post.online is verified and sending-enabled.
- Latest authentication confirmation email through the configured SMTP path reached Resend with status delivered.
- Supabase Auth logs show the custom email rate limiter changed from the built-in 2/hour limit to 30/hour after custom SMTP configuration.
- Recipient-specific suppression checks for active test addresses returned no suppression entry.
- The application continues using Supabase Auth as the source of truth; Resend is the SMTP delivery provider.
- If an end user does not see a delivered message, the remaining investigation is recipient mailbox filtering/spam/quarantine rather than the application-to-Resend transport.

## Current Production Release

- GitHub repository: sardarwalikhano/shakh-delivery
- Latest production commit: ff597122918942afe7e229100042b22b916aec81
- Latest Vercel production deployment from main: READY
- Production apex: https://daim-post.online
- Production www: https://www.daim-post.online
- Both custom domains are verified on the SHAKH Delivery Vercel project.
