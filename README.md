# SHAKH Delivery

SHAKH is a Kurdish-first, RTL-first marketplace and delivery web app. The production frontend is built with React, TypeScript, Vite, Tailwind CSS v4, React Router, and Supabase.

## Architecture and source of truth

- **Application:** React + TypeScript + Vite.
- **UI:** Tailwind CSS v4; Kurdish-first RTL, with `ku-Arab` document direction.
- **Navigation:** React Router SPA routes with direct-route fallback through Vercel.
- **Data and auth:** Supabase Auth and PostgreSQL via `@supabase/supabase-js`.
- **Authorization:** database-backed roles and permissions, route guards in the UI, and PostgreSQL RLS as the data-security boundary.
- **Product media:** Supabase Storage.
- **PWA:** generated manifest and Workbox service worker through `vite-plugin-pwa`; install instructions and update prompts are implemented in the app.
- **Deployment:** Vercel. CI checks TypeScript and generates a production build.

Supabase is the source of truth for users, roles, products, carts, orders, payments, posts, deliveries, and notifications. Do not replace live database data with mock arrays or browser storage.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Replace the example Supabase URL and publishable key with values from the intended Supabase project.
3. Install dependencies and start Vite:

```bash
npm install
npm run dev
```

Before a production build, the environment validator checks that the browser build has a Supabase URL and publishable/anon key, uses HTTPS outside local development, and does not expose an environment variable named like a service-role or secret key:

```bash
npm run check:env
npm run typecheck
npm run build
```

Required public build variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (Supabase publishable key, or legacy anon key only)
- `VITE_PUBLIC_APP_URL` (recommended; use the canonical public origin for production auth callbacks)

**Never** put a Supabase `service_role`, `sb_secret_`, private key, or other server-only secret into a `VITE_*` variable. Vite embeds `VITE_*` values into browser assets.

## PWA installation, deep links, and updates

- The app manifest includes an app identity, RTL language, app icons, and shortcuts to search, cart, and orders.
- Android/desktop browsers that support the install prompt use native installation. Other browsers receive platform-specific instructions, including iOS Safari's Share → Add to Home Screen flow.
- The service worker checks for updates periodically and when the browser comes back online. A new version is activated after the user selects **نوێکردنەوە**.
- Vercel rewrites app routes to `index.html`, preserving direct links to product, cart, order, and dashboard routes.
- The service worker caches the app shell and static assets. It does **not** make live Supabase data, checkout, payments, or order submission available offline.

## Security requirements

- Route guards and permission-based navigation improve UX; they are not substitutes for database security.
- Every exposed table must have appropriate RLS enabled and least-privilege table grants. Policies should restrict private rows by `auth.uid()`, store ownership, or a database-verified permission.
- Exposed `SECURITY DEFINER` RPCs need a fixed safe `search_path`, explicit authentication, ownership/role/permission checks, input validation, and valid state transitions. Do not blindly revoke these RPCs: some are required for transactional checkout, inventory, and delivery flows. Review each function before changing its grants.
- Authentication return paths are constrained to same-origin paths. Push-notification links are restricted to the app's own origin.
- Vercel sends HTTPS/HSTS, CSP, framing, MIME-sniffing, referrer, and permissions-policy headers.
- The repository's CI runs TypeScript checks and a production build using public placeholder values; it does not connect to production data.

### Supabase advisory follow-up

The live project's Security Advisor may still report operational items that cannot be safely fixed by frontend code alone, including the `pg_net` extension's schema placement, callable but guarded `SECURITY DEFINER` business RPCs, and leaked-password protection being disabled. Check the current Security Advisor after migrations. Do not break required checkout/order RPCs merely to silence a generic warning, and enable leaked-password protection only when the project's plan/settings support it.

## Database changes

- Keep every schema change as a versioned SQL migration in `supabase/migrations/`.
- Apply and verify migrations against the intended project before production release.
- Prefer additive, backward-compatible migrations; preserve existing rows and features.
- Check table RLS, grants, policies, function search paths, and Supabase Security Advisor after security-related changes.

## Production deployment

Configure the production variables in Vercel Project Settings before building. Recommended canonical origin: `https://daim-post.online`. The CI workflow checks pull requests to `main`; Vercel creates and serves deployment previews according to the repository's linked project settings.
