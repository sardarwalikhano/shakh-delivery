# SHAKH uploaded snapshot reconciliation — 2026-10-15

## Safety baseline

The canonical source is the current `main` branch. The uploaded RAR archive is a source snapshot, not a replacement for repository history. No force push, history rewrite, database reset, or direct production migration should be used to import it.

## Current repository state observed

- Default branch: `main`
- Main HEAD at inspection: `9d13a46bfb0388c164957a2d02416724b39df227`
- Current main includes 50 SQL migrations.
- The uploaded archive has 54 SQL migrations and 164 tracked-eligible source/configuration files once generated artifacts, node_modules, and Git metadata are excluded.
- Feature branch `feat/post-share-rewards-referral-wallet-20261014` has 24 commits not present on current main at inspection. It includes referral/share reward and wallet work, checkout changes, and a large migration. This feature branch must be reconciled deliberately before any merge that affects shared files.

## Mandatory reconciliation process

1. Start from the latest `main` head and preserve its full Git history.
2. Compare the uploaded source files against main and all relevant unmerged branches.
3. Keep both current production changes and uploaded changes where they differ; resolve conflicts file by file.
4. Review migrations by dependency/order and schema behavior, especially RLS, role checks, wallet ledger, payment flows, checkout, and share reward accounting. Two uploaded migrations share the timestamp prefix `20261007200000`; verify tooling and order explicitly.
5. Do not commit `.env.local`, any private service-role/secret credentials, `node_modules`, generated `dist`, or local Vercel state. Preserve `.env.example` with placeholders only.
6. Run a clean dependency install, `npm run check:env`, `npm run typecheck`, and `npm run build`. Use placeholder public Supabase variables for CI only; never put production credentials in source control.
7. Review CI results and PR diffs. Do not merge failing/unreviewed changes.
8. Do not apply migrations against production or modify production data as part of importing source code.
9. After merging reviewed code, verify Vercel deployment state, environment configuration, and Supabase migration status separately.

## Validation notes from this session

- An attempted `npm ci` did not complete successfully in the available execution window.
- A TypeScript build attempt therefore reported missing/incomplete type definition packages (including React and other transitive type libraries). This is not a reliable verdict on whether the source compiles after a clean install.
- A production build has not been confirmed successful.
- The current Vercel project metadata showed the latest deployment in `ERROR` state at inspection; investigate deployment logs as a separate follow-up.

## Non-destructive Git actions

- A backup branch `backup/uploaded-snapshot-2026-10-15` was created from current main to mark the safe baseline. It has no additional changes yet.
- This review branch is for reconciliation documentation only; it does not overwrite source code or migrations.
