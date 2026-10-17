import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCart, removeCartItem, updateCartItem } from '../api';
import type { CartItem } from '../types';
import { useAuth } from '@/lib/auth/AuthContext';
import { getProductImageUrl } from '@/lib/storage/catalogMedia';
import { formatSupermarketQuantity, isSupermarketItemExpired } from '@/lib/catalog/supermarket';
import { isRestaurantMenuAvailable, restaurantMenuCategoryLabels } from '@/lib/catalog/restaurant';
import { supabase } from '@/lib/supabase/client';
import { FoodPostCartSection } from '@/features/posts/components/FoodPostCartSection';

export function CartPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try { const result = await getCart(user.id); setItems(result.items); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!user) return;
    void refresh();
    const channel = supabase.channel('cart-inventory-live-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_menu_details' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_menu_option_groups' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_menu_options' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  const isRestaurant = (item: CartItem) => Boolean(item.product?.restaurantMenu);
  const currentPrice = (item: CartItem) => {
    if (item.product?.restaurantMenu) {
      const basePrice = item.variant?.price_iqd ?? item.product.base_price_iqd;
      return basePrice + item.selectedOptions.reduce((sum, option) => sum + Number(option.price_iqd), 0);
    }
    return item.variant?.price_iqd ?? item.product?.base_price_iqd ?? item.added_price_iqd;
  };
  const availableStock = (item: CartItem) => isRestaurant(item) ? 99 : item.variant?.stock_quantity ?? item.product?.stock_quantity ?? 0;
  const isExpired = (item: CartItem) => isSupermarketItemExpired(item.product?.expiry_date) || isSupermarketItemExpired(item.variant?.expiry_date);
  const menuAvailable = (item: CartItem) => {
    const menu = item.product?.restaurantMenu;
    return !menu || isRestaurantMenuAvailable(menu.is_available, menu.available_from, menu.available_until);
  };
  const isUnavailable = (item: CartItem) => {
    if (isRestaurant(item)) return !menuAvailable(item) || item.hasUnavailableOptions || Boolean(item.variant && !item.variant.is_active);
    return isExpired(item) || availableStock(item) <= 0 || item.quantity > availableStock(item);
  };
  const hasUnavailableItems = items.some(isUnavailable);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + currentPrice(item) * item.quantity, 0), [items]);

  const changeQuantity = async (item: CartItem, delta: number) => {
    if (!user) return;
    const stock = availableStock(item);
    const requested = item.quantity + delta;
    const next = delta < 0 ? Math.min(requested, stock) : requested;
    setMessage(null);
    try { await updateCartItem(user.id, item.id, next); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'گۆڕینی ژمارەی کاڵا سەرنەکەوت.'); }
  };

  const remove = async (item: CartItem) => {
    if (!user) return;
    setMessage(null);
    try { await removeCartItem(user.id, item.id); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'سڕینەوەی کاڵا لە سەبەتە سەرنەکەوت.'); }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-white"><ShoppingBag size={21} /></div><div><div className="text-xs font-black text-[var(--shakh-blue)]">سەبەتە</div><h1 className="text-3xl font-black">بەرهەمەکانت</h1></div></div>
        {message ? <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700">{message}</div> : null}
        {loading ? <div className="mt-6 rounded-[1.5rem] bg-white p-10 text-center text-sm font-bold text-[var(--shakh-muted)]">بارکردن...</div> : items.length === 0 ? <div className="mt-6 rounded-[1.5rem] border border-dashed border-black/10 bg-white px-6 py-16 text-center"><h2 className="text-xl font-black">سەلەی بەرهەمەکانی بازاڕ بەتاڵە</h2><p className="mt-2 text-sm leading-7 text-[var(--shakh-muted)]">بەرهەمێک زیاد بکە؛ سەلەی خواردنی چێشتخانە لە بەشی خوارەوە دەردەکەوێت.</p><Link to="/search" className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">بچۆ بۆ بازاڕ</Link></div> : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3">{items.map((item) => <div key={item.id} className="rounded-[1.4rem] border border-[var(--shakh-border)] bg-white p-4 shadow-[var(--shakh-shadow-sm)]"><div className="flex gap-4"><div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-[var(--shakh-bg)]">{item.product?.images?.[0] ? <img src={getProductImageUrl(item.product.images[0].storage_path)} alt={item.product.images[0].alt_ku ?? item.product.name_ku} className="h-full w-full object-cover" loading="lazy" /> : null}</div><div className="min-w-0 flex-1"><div className="font-black leading-6">{item.product?.name_ku ?? 'بەرهەم'}</div>{item.variant ? <div className="mt-1 text-xs font-bold text-[var(--shakh-muted)]">{item.variant.name_ku}</div> : null}
{item.product?.restaurantMenu ? <div className="mt-1 text-[11px] font-bold text-[var(--shakh-muted)]">{restaurantMenuCategoryLabels[item.product.restaurantMenu.menu_category] ?? 'خواردن'} · {item.product.restaurantMenu.prep_time_minutes} خولەک</div> : null}
{item.selectedOptions.length ? <div className="mt-2 space-y-1 rounded-xl bg-[var(--shakh-bg)] p-2.5">{item.selectedOptions.map((option) => <div key={option.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-black/55">{option.group_name_ku}: <strong className="text-black/75">{option.name_ku}</strong></span><span className="font-bold tabular-nums">{Number(option.price_iqd) > 0 ? '+' + Number(option.price_iqd).toLocaleString('en-US') + ' د.ع' : 'بەخۆڕایی'}</span></div>)}</div> : null}
<div className="mt-3 text-sm font-black">{currentPrice(item).toLocaleString('en-US')} د.ع <span className="text-[11px] font-bold text-[var(--shakh-muted)]">بۆ هەر دانە</span></div>{formatSupermarketQuantity(item.variant?.quantity_value ?? item.product?.quantity_value, item.variant?.quantity_unit ?? item.product?.quantity_unit, item.variant?.package_count ?? item.product?.package_count) ? <div className="mt-1 text-xs font-bold text-[var(--shakh-blue)]">{formatSupermarketQuantity(item.variant?.quantity_value ?? item.product?.quantity_value, item.variant?.quantity_unit ?? item.product?.quantity_unit, item.variant?.package_count ?? item.product?.package_count)}</div> : null}{item.variant?.flavor ? <div className="mt-1 text-xs font-bold text-[var(--shakh-blue)]">تام: {item.variant.flavor}</div> : null}<div className={`mt-1 text-[11px] font-bold ${isUnavailable(item) ? 'text-red-600' : 'text-[var(--shakh-muted)]'}`}>{item.product?.restaurantMenu ? !menuAvailable(item) ? 'ئەم خواردنە ئێستا بەردەست نییە' : item.hasUnavailableOptions ? 'زیادکراوەیەک گۆڕاوە؛ لاببە و دووبارە هەڵیبژێرە' : 'بەردەستە بۆ داواکردن' : isExpired(item) ? 'بەسەرچووە — کڕین ڕاگیراوە' : availableStock(item) <= 0 ? 'کۆگا بەتاڵە' : item.quantity > availableStock(item) ? `تەنها ${availableStock(item)} دانە ماوە؛ ژمارەکە کەم بکەرەوە` : `${availableStock(item).toLocaleString('en-US')} دانە بەردەستە`}</div><div className="mt-3 flex items-center gap-2"><button onClick={() => void changeQuantity(item, -1)} disabled={item.quantity <= 1 && availableStock(item) > 0} className="grid size-9 place-items-center rounded-xl bg-[var(--shakh-bg)] disabled:opacity-30"><Minus size={15} /></button><span className="w-8 text-center text-sm font-black">{item.quantity}</span><button disabled={isUnavailable(item) || item.quantity >= availableStock(item)} onClick={() => void changeQuantity(item, 1)} className="grid size-9 place-items-center rounded-xl bg-[var(--shakh-bg)] disabled:opacity-30" aria-label="زیادکردنی دانە"><Plus size={15} /></button></div></div><button onClick={() => void remove(item)} className="self-start rounded-xl p-2 text-black/35 hover:text-red-600" aria-label="سڕینەوە"><Trash2 size={18} /></button></div></div>)}</div>
            <aside className="h-fit rounded-[1.5rem] border border-[var(--shakh-border)] bg-white p-5 shadow-[var(--shakh-shadow-sm)] lg:sticky lg:top-24"><h2 className="text-lg font-black">کورتەی سەبەتە</h2><div className="mt-5 flex justify-between text-sm"><span className="text-[var(--shakh-muted)]">کۆی بەرهەمەکان</span><span className="font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div><div className="mt-4 flex justify-between border-t border-[var(--shakh-border)] pt-4"><span className="font-black">کۆی گشتی</span><span className="text-xl font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div>{hasUnavailableItems ? <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-800">هەندێک کاڵا بەردەست نییە، ستۆکی گۆڕاوە یان زیادکراوەیەک لە چێشتخانە ناچالاک کراوە. پێش checkout، هەڵبژاردەکان نوێ بکەرەوە یان کاڵاکە لە سەبەتە لاببە.</div> : null}{hasUnavailableItems ? <button type="button" disabled className="mt-5 flex w-full cursor-not-allowed items-center justify-center rounded-2xl bg-black/10 px-5 py-4 text-sm font-black text-black/35">پێداچوونەوە بە کۆگا پێویستە</button> : <Link to="/checkout" className="mt-5 flex w-full items-center justify-center rounded-2xl bg-[var(--shakh-navy)] px-5 py-4 text-sm font-black text-white">چێکئاوت و تەواوکردن</Link>}<p className="mt-3 text-xs leading-5 text-black/35">نرخی کۆتایی، بەرواری بەسەرچوون و ستۆک لە کاتی checkout لەسەر داتابەیس پشتڕاست دەکرێنەوە.</p></aside>
          </div>
        )}
        {user ? <FoodPostCartSection userId={user.id} /> : null}
      </div>
    </section>
  );
}
