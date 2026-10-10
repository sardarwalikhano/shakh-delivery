import type { AppRole } from '@/lib/permissions/AuthorizationContext';

export type PostCategory =
  | 'general' | 'food' | 'fashion' | 'electronics' | 'home_living'
  | 'beauty' | 'kids' | 'online_stores' | 'cars' | 'umrah' | 'delivery';

export type ApparelType =
  | 'mens_clothing'
  | 'womens_clothing'
  | 'kids_clothing'
  | 'mens_shoes'
  | 'womens_shoes'
  | 'kids_shoes'
  | 'bags'
  | 'sportswear'
  | 'home_textiles'
  | 'beauty_fashion_accessories'
  | 'other_accessories';

export type ApparelSeason = 'summer' | 'winter' | 'all_seasons';
export type ApparelAudience = 'men' | 'women' | 'kids' | 'all';
export type ApparelCondition = 'new' | 'used';
export type PostStatus = 'active' | 'archived' | 'deleted';

export type PostTarget = {
  publisher_role: AppRole;
  category: PostCategory;
};

export type PostImage = {
  storage_path: string;
  alt_ku?: string | null;
};

export type ApparelVariant = {
  id: string;
  post_id: string;
  color_name: string;
  color_hex: string;
  size_label: string;
  stock_quantity: number;
  price_iqd: number | null;
  image_path: string | null;
  created_at: string;
  updated_at: string;
};

export type Post = {
  id: string;
  author_id: string;
  publisher_role: AppRole;
  category: PostCategory;
  title: string;
  content: string;
  images: PostImage[];
  price_iqd: number | null;
  location: string | null;
  status: PostStatus;
  apparel_type: ApparelType | null;
  brand: string | null;
  material: string | null;
  country_of_origin: string | null;
  season: ApparelSeason | null;
  discount_percent: number;
  item_condition: ApparelCondition | null;
  apparel_audience: ApparelAudience | null;
  created_at: string;
  updated_at: string;
};
