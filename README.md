# SHAKH Delivery

New standalone project foundation. This repository is intentionally isolated from SHAKH2027.

## Scope of Phase 0

- React + TypeScript + Vite
- Tailwind CSS v4
- Supabase JS client dependency (not connected to any project yet)
- PWA manifest + Workbox service worker generation
- Mobile-first RTL foundation
- SPA routing + Vercel rewrite
- Security response headers baseline
- Environment-variable boundary
- Feature-oriented source tree

## Non-negotiable rules

1. Supabase is the source of truth for application data.
2. No mock marketplace data.
3. No localStorage for auth, orders, payments, or marketplace state.
4. Never expose Supabase secret/service-role keys to the browser.
5. Authorization must be enforced in PostgreSQL RLS / trusted backend logic, not only in UI.
6. Each production environment has its own secrets and external service configuration.
7. SHAKH2027 is not a dependency, data source, Git remote, or deployment target.

## Next phase

Phase 0 completion requires a new Supabase project selection and a new GitHub repository. After isolation is verified, Phase 1 implements authentication end-to-end: signup, verification, login, logout, forgot/reset password, session handling, protected routes, and Resend email delivery.

## Current cloud foundation

Supabase project: `shakh-delivery-prod` (`jjtmtxrkbewmdxdmgtrf`) in `eu-central-1`.

The local `.env.local` is intentionally gitignored. Only the publishable browser key belongs there; no secret/service-role key is stored in the frontend.
