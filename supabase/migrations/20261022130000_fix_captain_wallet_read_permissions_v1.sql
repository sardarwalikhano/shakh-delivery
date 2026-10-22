-- Restore scoped read access for captain wallet/earnings screens.
-- All affected tables already have RLS SELECT policies limiting captains to their
-- own rows and wallet managers to finance-wide rows; this only adds the missing
-- SQL table privileges so those policies can be evaluated by PostgREST.

grant select on table
  public.prepaid_wallet_transactions,
  public.captain_delivery_earnings,
  public.captain_delivery_commission_holds,
  public.captain_commission_rules
to authenticated;
