# SHAKH Delivery Supabase migration ledger

The remote production project is `shakh-delivery-prod` (`jjtmtxrkbewmdxdmgtrf`). Local migration filenames intentionally match the remote migration versions and names so the schema history is reproducible.

## Applied migrations

- 20261007114752 — core_rbac_profiles_permissions_v2
- 20261007114812 — security_harden_updated_at_search_path_v1
- 20261007115939 — customer_marketplace_catalog_v1
- 20261007120006 — marketplace_security_hardening_v1
- 20261007120346 — marketplace_policy_and_index_hardening_v1
- 20261007121730 — vendor_management_permissions_hardening_v1
- 20261007122510 — captain_delivery_core_v1
- 20261007122646 — captain_delivery_policy_security_hardening_v1
- 20261007122702 — dispatch_policy_consolidation_v1
- 20261007123203 — checkout_payments_foundation_v1
- 20261007123235 — checkout_cart_split_subtotal_fix_v1
- 20261007123429 — checkout_rpc_permission_hardening_v2
- 20261007124331 — notifications_realtime_foundation_v1
- 20261007124637 — notifications_privilege_hardening_v1
- 20261007125813 — least_privilege_data_api_hardening_v2
- 20261007125848 — least_privilege_trigger_execute_fix_v1
- 20261007134541 — product_media_storage_v1
- 20261007134947 — delivery_location_bounds_v1
- 20261007180348 — customer_phone_and_captain_offers_v1 (historical marker; superseded immediately)
- 20261007180454 — customer_phone_captain_delivery_offers_v2 (authoritative final implementation)

## Notes

- No mock marketplace, order, delivery, payment or notification records are seeded.
- The remote database is the application source of truth.
- The local CLI executable is not available in the current runtime, so remote migration state is verified through Supabase management tooling and local filenames are kept synchronized to that ledger.

### Authentication and delivery note

- New email/password accounts must provide a valid mobile number; the requirement is enforced both in the UI and the `auth.users` signup trigger.
- Checkout is blocked at the database RPC layer when the customer profile has no valid mobile number.
- New unassigned deliveries create realtime/in-app `delivery_offer` notifications for all captain-role users.
- Captains with `deliveries.claim` can atomically claim one pending delivery; the first successful claim wins.
