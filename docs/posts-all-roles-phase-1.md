# SHAKH — Posts Across All Roles (Phase 1)

## Scope
This phase widens the existing post-publishing flow without replacing it. The existing React/TypeScript/Vite app, Supabase source-of-truth, role/category policy, Apparel variant form, Cars listing form, edit/soft-delete, order history, and prior routes must remain intact.

## Current behavior found
- `CreatePostPage` loads role/category targets from `get_allowed_post_targets()`.
- SQL policy `posts_insert_scoped` requires: authenticated user owns the row, selected publisher role is a role actually assigned to that user, category is mapped to that role, and the role has `posts.create`.
- Super Admin is mapped to all current categories. Non-admin roles are mapped to role-specific categories plus Cars. Customer is mapped to Cars only.
- The role request flow supports multiple role rows, but a legacy/core migration defines `user_roles.user_id` as a primary key (one role per user). Do not claim multi-role assignment is functional until the production schema is confirmed/migrated safely.
- TypeScript includes `supermarket_vendor`, but the core database enum snapshot omits it; the current migration therefore avoids casting that role until the enum is reconciled through a separate safe migration.

## First change
Additive migration `20261013100000_post_publish_shared_category_all_roles_v1.sql` adds the `general` (shared marketplace) category as a publishing target for all enum-backed roles and ensures each already-supported role explicitly has `posts.create`. Existing categories, policies and records are not deleted or rewritten. Role-specific categories remain role-specific. Cars-specific and Apparel-specific forms remain in use.

## Important implementation follow-up
The form currently does not provide an explicit role selector despite rendering the role label. It chooses a preferred role and maps a selected category to a compatible target. Before claiming full multi-role support, improve the form so that:
1. Role selection is rendered only from server-provided `get_allowed_post_targets()` values for the authenticated user.
2. When role changes, category options are narrowed to the exact targets for that role.
3. Publisher role sent to `createPost()` always comes from the selected validated target, never a text input.
4. Authorization errors return clear Kurdish feedback and never fall back to an arbitrary role/category.
5. Preserve two-step review/publish flow; retain the current Cars and Apparel form requirements.
6. Do not use localStorage/mock data or service-role keys.
7. Test role/category combinations against real RLS before applying production SQL.

## Validation and deployment
- Run `npm run typecheck`, `npm run build`, and `git diff --check` in CI.
- Verify the additive migration on a staging clone first; do not apply blindly in production.
- Test all role/category targets: super_admin all categories; admin general + Cars; customer general + Cars; captain general + delivery + Cars; restaurant_vendor general + food + Cars; fashion_vendor general + fashion + Cars; car_dealer general + Cars; umrah_agency general + umrah + Cars; support general + Cars.
- Test unauthenticated inserts, forged `author_id`, forged `publisher_role`, and unauthorized categories are rejected by RLS.
- Test active/archived/deleted visibility, owner edit/soft-delete, existing Apparel variants and existing Cars details.
- Keep the change in a feature branch and PR; do not merge to `main` or trigger production deploy until tests pass.
