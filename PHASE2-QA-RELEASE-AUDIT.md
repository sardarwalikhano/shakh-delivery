# SHAKH SUPER — Phase 2 QA & Release Audit
Date: 2026-10-24
Status: NOT APPROVED FOR PRODUCTION RELEASE

## Verified repository and deployment facts
- Repository: sardarwalikhano/shakh-delivery; default branch: main.
- Phase 1 PR: #55, draft, open, base `fix/role-scoped-dashboard-navigation`, head `feat/dashboard-phase1-functional-navigation`.
- Head commit: `872288e9f1a71c4935122817e2083edfb691b7c6`.
- Preview deployment: `dpl_FfxuFFNxNcDdw7RhK6mMCg5VLwMQ`, state READY; preview URL `https://shakh-delivery-git-feat-dashbo-12035c-sardars-projects-d8734553.vercel.app`.
- Preview logs show environment validation, `tsc -b`, Vite production bundling and deployment completion. The generated JS bundle is about 1.19 MB (gzip ~290 KB), triggering Vite's >500 kB chunk warning.
- Production alias `shakh-delivery-two.vercel.app` is still attached to the existing production deployment on main commit `ab7a31619f1293073e1e630bcc988cac568b8082`; Phase 1 commit is not deployed to production.
- GitHub Actions query for the Phase 1 branch returned no workflow runs. Existing workflow triggers only on pull requests targeting `main` and pushes to `main`, so the PR against a non-main base does not exercise this workflow.
- Vercel type/build is verified for the preview; browser E2E, role-by-role accounts, wallet/order mutation tests, mobile visual checks, and actual login/logout were not executed in this session.

## Phase 1 diff review
Files in PR #55:
- `DASHBOARD-PHASE1-AUDIT.md` (new)
- `src/features/dashboard/DashboardLayout.tsx` (modified)
- `src/features/dashboard/DashboardPage.tsx` (modified)

Changes remove sidebar links to payments, users, reports, support, and audit because their dedicated route/page implementations do not exist; remove the Reports quick action; and change unspecified action allowlists from permissive default to deny-by-default. The route guards on the branch support explicit role allowlists.

Limitations:
- The code removes menu entries rather than delivering those requested admin modules, so they remain incomplete.
- The dashboard's wildcard route for `/dashboard/*` renders the general dashboard when a path has no implemented route. This masks unknown dashboard URLs instead of returning a clear 404.
- The branch's role scoping is primarily front-end plus route-guard behavior. This does not replace checking each RPC and RLS boundary.
- Phase 1 PR is still a draft and not merged.

## Supabase production project checks (read-only)
Project ref: `jjtmtxrkbewmdxdmgtrf`.
- Public tables without RLS: 0 (catalog query).
- Public tables with RLS enabled but no policy: 1 — `public.whatsapp_message_outbox`. The table appears to be used as a protected queue/outbox, but its intended trusted service/worker access and grants must be reviewed; do not add a broad policy just to silence the advisor.
- `SECURITY DEFINER` functions in public executable by `authenticated`: 44.
- The 44 finding is not proof that all 44 are vulnerable: the function definitions show that many have internal permission, ownership, and/or identity checks. Individual authorization review is still required, especially for wrapper functions that delegate to another RPC and public helper-like functions.
- `SECURITY DEFINER` functions executable by `anon`: 0 among the inspected public-schema functions.
- Performance advisor: 25 unindexed foreign-key findings and 39 unused-index INFO findings at audit time. These need workload-aware triage; don't automatically remove indexes or perform wide index creation in production without reviewing query patterns and write impact.
- Security advisor also warns `pg_net` is installed in the public schema, and leaked-password protection is disabled. Confirm compatibility and project plan/configuration before changing either setting.
- Production migration list includes the application and wallet/receipt migrations through `queue_sale_receipts_until_consent_v1`; Phase 1 introduced no database migrations, and this audit applied none.

## Test matrix
- Vercel preview deployment: PASS (state READY).
- Environment guard: PASS (log says public environment configuration validated; values were not printed).
- TypeScript build step (`tsc -b`): PASS as part of the successful Vercel build.
- Vite production bundle: PASS with a large-chunk warning.
- GitHub Actions for Phase 1 branch: NOT RUN (API returned no runs; workflow trigger doesn't include the PR's base branch).
- Separate `npm run typecheck` / `npm run lint`: NOT RUN. Note: package `lint` script currently aliases `tsc --noEmit`; no dedicated ESLint script is configured.
- Unit/integration tests: NOT RUN; package scripts expose no test script.
- Authenticated E2E / one test account per role: NOT RUN.
- Real-time subscriptions, orders, wallet mutation / financial reconciliation: NOT RUN.
- Browser console, mobile, RTL/LTR screenshots, and actual public production URL interaction: NOT RUN.
- RLS cross-user isolation tests: NOT RUN.
- Production schema/data untouched by this audit (read-only SQL only).

## Release blockers / required follow-up
1. Add/adjust automated tests and ensure CI runs for the actual PR target/main before merge.
2. Review and mitigate the 44 SECURITY DEFINER advisor findings function-by-function; preserve required authenticated workflows and explicitly revoke only confirmed unintended grants.
3. Review `public.whatsapp_message_outbox` grants and worker model; ensure app roles cannot read/write queue records directly unless explicitly intended.
4. Configure leaked-password protection in Supabase Auth (may depend on plan).
5. Implement or formally defer the missing dashboard pages; do not represent removed modules as complete.
6. Fix route catch-all behavior so unknown `/dashboard/*` routes don't silently show the dashboard page.
7. Run role-based E2E tests with authorized accounts/staging and validate the critical financial/order workflows without mutating production records.
8. Reduce/split the initial JS bundle and triage foreign-key indexes against query workload.
9. Only then merge and deploy after explicit release approval, then verify the production alias points to the intended commit.

## Rollback / recovery
- No production change was made by this Phase 2 audit.
- If PR #55 is later merged and the release is approved, rollback by promoting the last known-good Vercel production deployment (the current production is `dpl_J6ni6dzhKfTmhi9jJLTZYTLQJqNU`, from main commit `ab7a31619f1293073e1e630bcc988cac568b8082`) through Vercel rollback/promote tooling. Do not roll back or reset the Supabase database for a UI-only release.
- Any future database migration must be additive/backward-compatible where possible, reviewed with a recovery plan, and applied only after approval.
