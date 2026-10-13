-- Category-aware product specifications stored independently from generic attributes.
-- The empty-object default keeps existing product rows compatible without rewriting them.
ALTER TABLE public.products
  ADD COLUMN category_details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products
  ADD CONSTRAINT products_category_details_object_check
  CHECK (jsonb_typeof(category_details) = 'object');

-- Extend explicit column-level permissions without replacing the existing RLS
-- ownership policies for products.
GRANT SELECT (category_details)
  ON TABLE public.products TO anon, authenticated;

GRANT INSERT (category_details)
  ON TABLE public.products TO authenticated;

GRANT UPDATE (category_details)
  ON TABLE public.products TO authenticated;
