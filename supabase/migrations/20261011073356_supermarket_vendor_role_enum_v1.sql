-- Register an independently approved supermarket seller role.
-- Keep this enum alteration in its own migration because PostgreSQL does not allow
-- a newly-added enum label to be used until the transaction that adds it has committed.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supermarket_vendor';
