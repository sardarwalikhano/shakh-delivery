# SHAKH Dashboard — Phase 1 Audit and Implementation Notes

Date: 2026-10-24
Repository: https://github.com/sardarwalikhano/shakh-delivery
Base branch: fix/role-scoped-dashboard-navigation
Working branch: feat/dashboard-phase1-functional-navigation

## Audit findings

1. The dashboard shell uses Supabase-backed role and permission records, and route guards enforce permission checks. The active development branch also adds explicit role allowlists to role-specific routes and sidebar items.
2. The sidebar contained links to `/dashboard/payments`, `/dashboard/users`, `/dashboard/reports`, `/dashboard/support`, and `/dashboard/audit`, but those routes do not have corresponding page implementations in `src/app/App.tsx`. The wildcard dashboard route catches them and renders the generic dashboard, so the links do not open the promised section.
3. The dashboard quick actions also advertised a Reports destination without a matching route implementation.
4. Quick-action role filtering used a permissive fallback for destinations without an explicit role allowlist. This could cause a newly added action to appear based only on its permission code; the fallback is changed to deny-by-default.
5. No schema changes are required for this navigation correction. Existing business data and migration history are preserved.

## Phase 1 changes

- Remove sidebar entries whose destination pages do not exist yet, instead of presenting non-functional links as complete modules.
- Remove the non-functional Reports quick action.
- Make quick-action role filtering deny-by-default when an action has no explicit role allowlist.
- Keep the existing permission checks and explicit role allowlists for implemented sections.

## Security findings requiring separate review before release

The Supabase Security Advisor returned a warning that leaked-password protection is disabled. It also reported multiple public-schema `SECURITY DEFINER` RPC functions callable by the `authenticated` role. These notices do not prove each function is exploitable, but each function must be reviewed for caller identity, permission checks, and intended execute grants before changing privileges. No production database policy or function was modified as part of this dashboard navigation patch.

## Verification status

- Repository and route definitions inspected through GitHub.
- Supabase schema/security advisor inspected.
- Automated build/typecheck not yet run in this tool session; do not treat this report as a passing build.
- Production deployment not performed.
