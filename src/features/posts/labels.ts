import type { AppRole } from '@/lib/permissions/AuthorizationContext';
import type { PostCategory } from './types';

export const postCategoryLabels: Record<PostCategory, string> = {
  general: 'بازاڕی گشتی',
  food: 'خواردن',
  fashion: 'جل و بەرگ',
  electronics: 'ئەلیکترۆنیات',
  home_living: 'ماڵ و ژیان',
  beauty: 'جوانکاری',
  kids: 'منداڵان',
  online_stores: 'دۆکانی ئۆنلاین',
  cars: 'ئۆتۆمبێل',
  umrah: 'عومرە',
  delivery: 'گەیاندن',
};

export const postRoleLabels: Record<AppRole, string> = {
  super_admin: 'سوپەر ئەدمین',
  admin: 'ئەدمین',
  customer: 'کڕیار',
  captain: 'کاپتن',
  restaurant_vendor: 'فرۆشیاری ڕێستوران',
  fashion_vendor: 'فرۆشیاری جلوبەرگ',
  car_dealer: 'فرۆشیاری ئۆتۆمبێل',
  umrah_agency: 'ئەژانسی عومرە',
  support: 'پشتیوانی',
};
