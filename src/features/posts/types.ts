import type { AppRole } from '@/lib/permissions/AuthorizationContext';

export type PostCategory =
  | 'general' | 'food' | 'fashion' | 'electronics' | 'home_living'
  | 'beauty' | 'kids' | 'online_stores' | 'cars' | 'umrah' | 'delivery';

export type PostStatus = 'active' | 'archived' | 'deleted';

export type PostTarget = {
  publisher_role: AppRole;
  category: PostCategory;
};

export type Post = {
  id: string;
  author_id: string;
  publisher_role: AppRole;
  category: PostCategory;
  title: string;
  content: string;
  images: unknown[];
  price_iqd: number | null;
  location: string | null;
  status: PostStatus;
  created_at: string;
  updated_at: string;
};
