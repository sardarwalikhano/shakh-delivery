import type { AppRole } from '@/lib/permissions/AuthorizationContext';

export const roleLabels: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  customer: 'Customer',
  captain: 'Captain',
  restaurant_vendor: 'Restaurant Vendor',
  fashion_vendor: 'Fashion Vendor',
  car_dealer: 'Car Dealer',
  umrah_agency: 'Umrah Agency',
  support: 'Support',
};

export const roleLabelsKu: Record<AppRole, string> = {
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
