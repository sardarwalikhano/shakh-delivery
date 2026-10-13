-- Extend the existing catalog schema to match fields already used by the vendor product editor,
-- and persist custom multilingual product specifications for every product category.
ALTER TABLE public.products
  ADD COLUMN apparel_product_type text,
  ADD COLUMN brand text,
  ADD COLUMN material text,
  ADD COLUMN country_of_origin text,
  ADD COLUMN season text,
  ADD COLUMN seller_location text,
  ADD COLUMN attributes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.products
  ADD CONSTRAINT products_apparel_product_type_check
    CHECK (
      apparel_product_type IS NULL OR apparel_product_type IN (
        'mens_clothing', 'womens_clothing', 'kids_clothing',
        'mens_shoes', 'womens_shoes', 'kids_shoes',
        'bags', 'sportswear', 'homewear', 'fashion_beauty', 'accessories'
      )
    ),
  ADD CONSTRAINT products_season_check
    CHECK (season IS NULL OR season IN ('summer', 'winter', 'all_seasons')),
  ADD CONSTRAINT products_attributes_array_check
    CHECK (
      CASE
        WHEN jsonb_typeof(attributes) = 'array'
          THEN jsonb_array_length(attributes) <= 30
        ELSE false
      END
    );

-- These products columns use explicit column-level grants in this project.
-- The grants supplement (and do not replace) the existing Row Level Security policies.
GRANT SELECT (
  apparel_product_type, brand, material, country_of_origin,
  season, seller_location, attributes
) ON TABLE public.products TO anon, authenticated;

GRANT INSERT (
  apparel_product_type, brand, material, country_of_origin,
  season, seller_location, attributes
) ON TABLE public.products TO authenticated;

GRANT UPDATE (
  apparel_product_type, brand, material, country_of_origin,
  season, seller_location, attributes
) ON TABLE public.products TO authenticated;
