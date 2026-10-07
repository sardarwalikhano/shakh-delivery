export type Category = {
  id: string;
  parent_id: string | null;
  name_ku: string;
  name_ar: string;
  name_en: string;
  slug: string;
  icon_key: string | null;
  sort_order: number;
  is_active: boolean;
};

export type StoreSummary = {
  id: string;
  name_ku: string;
  name_ar: string;
  name_en: string;
  slug: string;
  logo_url: string | null;
  status: 'pending' | 'active' | 'suspended' | 'closed';
};

export type Product = {
  id: string;
  store_id: string;
  category_id: string | null;
  name_ku: string;
  name_ar: string;
  name_en: string;
  slug: string;
  description_ku: string | null;
  description_ar: string | null;
  description_en: string | null;
  base_price_iqd: number;
  compare_at_price_iqd: number | null;
  currency: 'IQD';
  status: 'draft' | 'active' | 'archived';
  stock_quantity: number;
  is_featured: boolean;
  store: StoreSummary | null;
  category: Category | null;
  images: ProductImage[];
  variants: ProductVariant[];
};

export type ProductImage = {
  id: string;
  product_id: string;
  storage_path: string;
  alt_ku: string | null;
  alt_ar: string | null;
  alt_en: string | null;
  sort_order: number;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  name_ku: string;
  name_ar: string;
  name_en: string;
  sku: string | null;
  price_iqd: number | null;
  stock_quantity: number;
  is_active: boolean;
};

export type Cart = {
  id: string;
  user_id: string;
  currency: 'IQD';
};

export type CartItem = {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  added_price_iqd: number;
  product: Pick<Product, 'id' | 'slug' | 'name_ku' | 'name_ar' | 'name_en' | 'base_price_iqd' | 'stock_quantity'> | null;
  variant: Pick<ProductVariant, 'id' | 'name_ku' | 'name_ar' | 'name_en' | 'price_iqd' | 'stock_quantity'> | null;
};
