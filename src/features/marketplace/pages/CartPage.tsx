import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCart, removeCartItem, updateCartItem } from '../api';
import type { CartItem } from '../types';
import { useAuth } from '@/lib/auth/AuthContext';
import { getProductImageUrl } from '@/lib/storage/catalogMedia';

export function CartPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try { const result = await getCart(user.id); setItems(result.items); } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [user]);

  const currentPrice = (item: CartItem) => item.variant?.price_iqd ?? item.product?.base_price_iqd ?? item.added_price_iqd;
  const availableStock = (item: CartItem) => item.variant?.stock_quantity ?? item.product?.stock_quantity ?? 0;
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + currentPrice(item) * item.quantity, 0), [items]);

  const changeQuantity = async (item: CartItem, delta: number) => {
    if (!user) return;
    const next = item.quantity + delta;
    try { await updateCartItem(user.id, item.id, next); await refresh(); } catch { /* keep server state visible */ }
  };

  const remove = async (item: CartItem) => {
    if (!user) return;
    try { await removeCartItem(user.id, item.id); await refresh(); } catch { /* keep server state visible */ }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-white"><ShoppingBag size={21} /></div><div><div className="text-xs font-black text-[var(--shakh-blue)]">سەبەتە</div><h1 className="text-3xl font-black">بەرهەمەکانت</h1></div></div>
        {loading ? <div className="mt-6 rounded-[28px] bg-white p-10 text-center text-sm font-bold text-black/45">بارکردن...</div> : items.length === 0 ? <div className="mt-6 rounded-[28px] border border-dashed border-black/10 bg-white px-6 py-16 text-center"><h2 className="text-xl font-black">سەبەتەکەت بەتاڵە</h2><p className="mt-2 text-sm leading-7 text-black/45">بچۆ بۆ بازاڕ و بەرهەمێک زیاد بکە.</p><Link to="/search" className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">بچۆ بۆ بازاڕ</Link></div> : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3">{items.map((item) => <div key={item.id} className="rounded-[26px] border border-black/[0.06] bg-white p-4 shadow-[0_12px_35px_rgba(16,22,35,.035)]"><div className="flex gap-4"><div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-[var(--shakh-bg)]">{item.product?.images?.[0] ? <img src={getProductImageUrl(item.product.images[0].storage_path)} alt={item.product.images[0].alt_ku ?? item.product.name_ku} className="h-full w-full object-cover" loading="lazy" /> : null}</div><div className="min-w-0 flex-1"><div className="font-black leading-6">{item.product?.name_ku ?? 'بەرهەم'}</div>{item.variant ? <div className="mt-1 text-xs font-bold text-black/40">{item.variant.name_ku}</div> : null}<div className="mt-3 text-sm font-black">{currentPrice(item).toLocaleString('en-US')} د.ع</div>{item.product?.quantity_value != null && item.product.quantity_unit ? <div className="mt-1 text-xs text-black/45">{item.product.quantity_value} {item.product.quantity_unit}{item.product.package_count && item.product.package_count > 1 ? ` · ${item.product.package_count} پاکێت` : ''}</div> : null}{item.variant?.flavor ? <div className="mt-1 text-xs font-bold text-[var(--shakh-blue)]">{item.variant.flavor}</div> : null}<div className="mt-3 flex items-center gap-2"><button onClick={() => void changeQuantity(item, -1)} className="grid size-9 place-items-center rounded-xl bg-[var(--shakh-bg)]"><Minus size={15} /></button><span className="w-8 text-center text-sm font-black">{item.quantity}</span><button disabled={item.quantity >= availableStock(item)} onClick={() => void changeQuantity(item, 1)} className="grid size-9 place-items-center rounded-xl bg-[var(--shakh-bg)] disabled:opacity-30" aria-label="زیادکردنی دانە"><Plus size={15} /></button></div></div><button onClick={() => void remove(item)} className="self-start rounded-xl p-2 text-black/35 hover:text-red-600" aria-label="سڕینەوە"><Trash2 size={18} /></button></div></div>)}</div>
            <aside className="h-fit rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)] lg:sticky lg:top-24"><h2 className="text-lg font-black">کورتەی سەبەتە</h2><div className="mt-5 flex justify-between text-sm"><span className="text-black/45">کۆی بەرهەمەکان</span><span className="font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div><div className="mt-4 flex justify-between border-t border-black/[0.06] pt-4"><span className="font-black">کۆی گشتی</span><span className="text-xl font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div><Link to="/checkout" className="mt-5 flex w-full items-center justify-center rounded-2xl bg-[var(--shakh-navy)] px-5 py-4 text-sm font-black text-white">چێکئاوت و تەواوکردن</Link><p className="mt-3 text-xs leading-5 text-black/35">نرخی کۆتایی و stock لە قۆناغی checkout لەسەر server پشتڕاست دەکرێتەوە.</p></aside>
          </div>
        )}
      </div>
    </section>
  );
}
