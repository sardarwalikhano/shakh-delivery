import { Baby, House, Shirt, ShoppingBag, Smartphone, Sparkles, Store, Utensils } from 'lucide-react';
import type { ComponentType } from 'react';

const icons: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  utensils: Utensils,
  shirt: Shirt,
  smartphone: Smartphone,
  home: House,
  sparkles: Sparkles,
  baby: Baby,
  'shopping-bag': ShoppingBag,
  store: Store,
};

export function CategoryIcon({ iconKey, size = 20 }: { iconKey: string | null; size?: number }) {
  const Icon = (iconKey && icons[iconKey]) || ShoppingBag;
  return <Icon size={size} strokeWidth={2.2} />;
}
