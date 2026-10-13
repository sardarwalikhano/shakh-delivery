import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPostImageUrl } from '@/lib/storage/postMedia';
import { supabase } from '@/lib/supabase/client';
import { getFoodPostCart, removeFoodPostCartItem, updateFoodPostCartQuantity, type FoodPostCartItem } from '../foodPostCart';

function itemPrice(item: FoodPostCartItem): number {
  const base = Number(item.post?.price_iqd ?? 0);
  const discount = Math.max(0, Math.min(99, item.post?.discount_percent ?? 0));
  return Math.round(base * (100 - discount) / 100);
}

export function FoodPostCartSection({ userId }: { userId: string }) {
  const [items, setItems] = useState<FoodPostCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setError(null);
      setItems(await getFoodPostCart(userId));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا سەلەی چێشتخانە بخوێندرێتەوە.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const channel = supabase.channel('food-post-cart-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_post_cart_items', filter: 'user_id=eq.' + userId }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const changeQuantity = async (item: FoodPostCartItem, quantity: number) => {
    try {
      setError(null);
      if (quantity < 1) await removeFoodPostCartItem(userId, item.id);
      else await updateFoodPostCartQuantity(userId, item.id, quantity);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'گۆڕینی ژمارەی خواردن سەرنەکەوت.');
    }
  };

  if (loading || items.length === 0) {
    return error ? <div role="alert" className="mt-5 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">{error}</div> : null;
  }

  const total = items.reduce((sum, item) => sum + itemPrice(item) * item.quantity, 0);

  return (
    <section className="mt-6 rounded-[28px] border border-[var(--shakh-orange)]/20 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-xs font-black text-[var(--shakh-orange)]">سەلەی چێشتخانە</div><h2 className="mt-1 text-xl font-black">خواردنەکانت</h2></div>
        <Link to="/food-post-checkout" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white"><ShoppingBag size={16}/> تەواوکردنی داواکاری</Link>
      </div>
      {error ? <div role="alert" className="mt-4 rounded-2xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{error}</div> : null}
      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const unavailable = !item.post || item.post.status !== 'active' || itemPrice(item) <= 0 || item.post.author_id === userId;
          return <article key={item.id} className="flex gap-3 rounded-2xl bg-[var(--shakh-bg)] p-3">
            <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-white">
              {item.post?.images?.[0]?.storage_path ? <img src={getPostImageUrl(item.post.images[0].storage_path)} alt={item.post.title} className="h-full w-full object-cover" loading="lazy"/> : null}
            </div>
            <div className="min-w-0 flex-1">
              <Link to={item.post ? '/posts/' + item.post.id : '/posts'} className="font-black leading-6">{item.post?.title ?? 'پۆستی خواردن بەردەست نییە'}</Link>
              <div className="mt-1 text-sm font-black">{itemPrice(item).toLocaleString('en-US')} د.ع <span className="text-xs font-bold text-black/40">بۆ هەر دانە</span></div>
              <div className={`mt-1 text-xs font-bold ${unavailable ? 'text-red-600' : 'text-emerald-700'}`}>{unavailable ? 'ئەم خواردنە بۆ داواکردن بەردەست نییە' : 'بەردەستە بۆ داواکردن'}</div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" aria-label="کەمکردنەوەی ژمارە" onClick={() => void changeQuantity(item,item.quantity-1)} className="grid size-8 place-items-center rounded-lg bg-white"><Minus size={14}/></button>
                <span className="min-w-6 text-center text-sm font-black">{item.quantity}</span>
                <button type="button" aria-label="زیادکردنی ژمارە" disabled={unavailable || item.quantity >= 100} onClick={() => void changeQuantity(item,item.quantity+1)} className="grid size-8 place-items-center rounded-lg bg-white disabled:opacity-40"><Plus size={14}/></button>
                <button type="button" onClick={() => void changeQuantity(item,0)} className="ms-auto rounded-lg p-2 text-black/40 hover:text-red-600" aria-label="لابردن لە سەلە"><Trash2 size={16}/></button>
              </div>
            </div>
          </article>;
        })}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4"><span className="text-sm font-bold text-black/45">کۆی کاتی خواردنەکان</span><span className="text-lg font-black">{total.toLocaleString('en-US')} د.ع</span></div>
      <p className="mt-2 text-xs leading-5 text-black/40">گەیاندن و کرێی پلاتفۆرم لە کاتی داواکردندا لەلایەن Supabase هەژمار دەکرێت.</p>
    </section>
  );
}
