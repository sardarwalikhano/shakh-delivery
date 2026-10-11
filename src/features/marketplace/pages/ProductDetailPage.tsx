import { ArrowRight, Check, Heart, ShoppingBag, Store, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addToCart, getProductBySlug, isWishlisted, toggleWishlist } from '../api';
import type { Product, ProductVariant } from '../types';
import { useAuth } from '@/lib/auth/AuthContext';
import { getProductImageUrl } from '@/lib/storage/catalogMedia';
import { formatSupermarketQuantity, isSupermarketItemExpired, supermarketTypeLabel } from '@/lib/catalog/supermarket';
import { supabase } from '@/lib/supabase/client';

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (slug ? getProductBySlug(slug).then((item) => { if (!cancelled) { setProduct(item); setVariant(item?.variants[0] ?? null); } }).catch(() => { if (!cancelled) setProduct(null); }).finally(() => { if (!cancelled) setLoading(false); }) : Promise.resolve());
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!product) return;
    const channel = supabase.channel('product-live-' + product.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: 'id=eq.' + product.id }, () => {
        void getProductBySlug(product.slug).then((next) => { if (next) { setProduct(next); setVariant((current) => next.variants.find((item) => item.id === current?.id) ?? next.variants[0] ?? null); setQuantity((current) => Math.min(current, next.stock_quantity || 1)); } }).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants', filter: 'product_id=eq.' + product.id }, () => {
        void getProductBySlug(product.slug).then((next) => { if (next) { setProduct(next); setVariant((current) => next.variants.find((item) => item.id === current?.id) ?? next.variants[0] ?? null); } }).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images', filter: 'product_id=eq.' + product.id }, () => {
        void getProductBySlug(product.slug).then((next) => { if (next) setProduct(next); }).catch(() => {});
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [product?.id]);

  useEffect(() => {
    if (!user || !product) { setWishlisted(false); return; }
    void isWishlisted(user.id, product.id).then(setWishlisted).catch(() => setWishlisted(false));
  }, [product, user]);

  if (loading) return <div className="grid min-h-[65dvh] place-items-center"><div className="text-sm font-bold text-black/45">بارکردن...</div></div>;
  if (!product) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-2xl font-black">بەرهەم نەدۆزرایەوە</h1><Link className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white" to="/search">گەڕانەوە بۆ بازاڕ</Link></div>;

  const price = variant?.price_iqd ?? product.base_price_iqd;
  const maxStock = variant?.stock_quantity ?? product.stock_quantity;
  const expired = isSupermarketItemExpired(product.expiry_date) || isSupermarketItemExpired(variant?.expiry_date);
  const canBuy = maxStock > 0 && !expired && (variant?.is_active ?? true);

  const buy = async () => {
    setMessage(null);
    if (!isAuthenticated || !user) {
      navigate('/login', { state: { from: `/product/${product.slug}` } });
      return;
    }
    try {
      await addToCart(user.id, product.id, variant?.id ?? null, Math.min(quantity, maxStock), price);
      setMessage('بەرهەمەکە زیادکرا بۆ سەبەتە.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'زیادکردن بۆ سەبەتە سەرنەکەوت.');
    }
  };

  const toggle = async () => {
    if (!user) { navigate('/login', { state: { from: `/product/${product.slug}` } }); return; }
    try { setWishlisted(await toggleWishlist(user.id, product.id, wishlisted)); } catch { setMessage('گۆڕینی دڵخوازەکان سەرنەکەوت.'); }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-6 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Link to="/search" className="inline-flex items-center gap-2 text-sm font-black text-black/45 hover:text-black"><ArrowRight size={17} /> گەڕانەوە</Link>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-[32px] border border-black/[0.06] bg-white p-3 shadow-[0_18px_55px_rgba(16,22,35,.05)] sm:p-5">
            <div className="overflow-hidden rounded-[26px] bg-[var(--shakh-bg)]">
              {product.images[0] ? (
                <img src={getProductImageUrl(product.images[0].storage_path)} alt={product.images[0].alt_ku ?? product.name_ku} className="aspect-square w-full object-cover" fetchPriority="high" />
              ) : (
                <div className="grid aspect-square place-items-center px-8 text-center"><span className="text-sm font-bold text-black/25">ئەم بەرهەمە هێشتا وێنەی تێدا نییە.</span></div>
              )}
            </div>
            {product.images.length > 1 ? (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {product.images.slice(0, 5).map((image) => <img key={image.id} src={getProductImageUrl(image.storage_path)} alt={image.alt_ku ?? product.name_ku} className="aspect-square w-full rounded-2xl object-cover" loading="lazy" />)}
              </div>
            ) : null}
          </div>
          <div className="rounded-[32px] border border-black/[0.06] bg-white p-5 shadow-[0_18px_55px_rgba(16,22,35,.05)] sm:p-8">
            <div className="flex items-center gap-2 text-xs font-black text-[var(--shakh-blue)]"><span>{product.category?.name_ku ?? 'بازاڕ'}</span>{product.store ? <><span className="text-black/20">/</span><span>{product.store.name_ku}</span></> : null}</div>
            <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{product.name_ku}</h1>
            <p className="mt-4 leading-8 text-black/55">{product.description_ku ?? 'زانیاریی وردی ئەم بەرهەمە لەلایەن فرۆشگا دابین دەکرێت.'}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-black/45">{product.brand ? <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-2">{product.brand}</span> : null}{formatSupermarketQuantity(product.quantity_value, product.quantity_unit, product.package_count) ? <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-2">{formatSupermarketQuantity(product.quantity_value, product.quantity_unit, product.package_count)}</span> : null}{supermarketTypeLabel(product.supermarket_type) ? <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-2">{supermarketTypeLabel(product.supermarket_type)}</span> : null}{product.country_of_origin ? <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-2">وڵاتی بەرهەمهێنان: {product.country_of_origin}</span> : null}{product.barcode ? <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-2">بارکۆد: {product.barcode}</span> : null}</div>
            {product.flavor ? <p className="mt-3 text-sm font-bold text-[var(--shakh-blue)]">تام: {product.flavor}</p> : null}
            {product.manufacturing_date ? <p className="mt-2 text-xs font-semibold text-black/45">بەرواری بەرهەمهێنان: {product.manufacturing_date}</p> : null}
            {product.expiry_date ? <p className={`mt-2 text-xs font-semibold ${expired ? 'text-red-600' : 'text-black/45'}`}>بەرواری بەسەرچوون: {product.expiry_date}{expired ? ' · بەسەرچووە' : ''}</p> : null}
            {product.ingredients ? <p className="mt-3 text-sm leading-7 text-black/60">پێکهاتەکان: {product.ingredients}</p> : null}
            {product.allergen_warnings ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">هۆشداریی ئەلێرژی: {product.allergen_warnings}</p> : null}
            {product.storage_instructions ? <p className="mt-3 text-sm leading-7 text-black/60">ڕێنمایی هەڵگرتن: {product.storage_instructions}</p> : null}
            {product.cleaning_type ? <p className="mt-3 text-sm leading-7 text-black/60">جۆری پاککەرەوە: {product.cleaning_type}</p> : null}
            <div className="mt-6 flex flex-wrap items-end gap-3"><div className="text-3xl font-black tabular-nums">{price.toLocaleString('en-US')} <span className="text-sm text-black/40">د.ع</span></div>{product.compare_at_price_iqd && product.compare_at_price_iqd > price && (variant?.price_iqd == null || variant.price_iqd === product.base_price_iqd) ? <><div className="pb-1 text-sm text-black/35 line-through">{product.compare_at_price_iqd.toLocaleString('en-US')} د.ع</div><span className="rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1 text-xs font-black text-[var(--shakh-orange)]">{Math.round((1 - price / product.compare_at_price_iqd) * 100)}٪ داشکاندن</span></> : null}</div>

            {product.variants.length ? (
              <div className="mt-7"><div className="text-sm font-black">قەبارە، تام و وەشانەکان</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{product.variants.map((item) => { const itemExpired = isSupermarketItemExpired(product.expiry_date) || isSupermarketItemExpired(item.expiry_date); const itemPrice = item.price_iqd ?? product.base_price_iqd; return <button key={item.id} type="button" onClick={() => { setVariant(item); setQuantity(1); setMessage(null); }} className={`rounded-2xl border p-3 text-start transition ${variant?.id === item.id ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/8' : 'border-black/10 bg-white'}`}><span className="block text-sm font-black">{item.name_ku}</span>{formatSupermarketQuantity(item.quantity_value, item.quantity_unit, item.package_count) ? <span className="mt-1 block text-xs font-bold text-black/50">{formatSupermarketQuantity(item.quantity_value, item.quantity_unit, item.package_count)}</span> : null}{item.flavor ? <span className="mt-1 block text-xs font-bold text-[var(--shakh-blue)]">تام: {item.flavor}</span> : null}<span className="mt-2 flex flex-wrap items-center gap-2 text-xs font-black"><span>{itemPrice.toLocaleString('en-US')} د.ع</span><span className={item.stock_quantity > 0 && !itemExpired ? 'text-emerald-700' : 'text-red-600'}>{itemExpired ? 'بەسەرچووە' : item.stock_quantity > 0 ? `${item.stock_quantity.toLocaleString('en-US')} دانە بەردەستە` : 'کۆگا بەتاڵە'}</span></span></button>; })}</div></div>
            ) : null}

            <div className="mt-7 flex items-center gap-3 rounded-2xl bg-[var(--shakh-bg)] p-3 text-sm font-bold"><span className={`grid size-9 place-items-center rounded-xl ${canBuy ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}><Check size={17} /></span>{expired ? 'بەرواری بەسەرچوونی بەرهەم تێپەڕیوە' : canBuy ? `${maxStock} دانە بەردەستە` : 'ئەم بەرهەمە بەردەست نییە'}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
              <div className="flex h-12 items-center rounded-2xl border border-black/10 bg-white"><button aria-label="کەمکردنەوەی ژمارە" className="grid size-12 place-items-center text-xl" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><span className="w-8 text-center font-black">{quantity}</span><button aria-label="زیادکردنی ژمارە" disabled={quantity >= maxStock || !canBuy} className="grid size-12 place-items-center text-xl disabled:opacity-30" onClick={() => setQuantity((value) => Math.min(maxStock, value + 1))}>+</button></div>
              <button disabled={!canBuy} onClick={() => void buy()} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><ShoppingBag size={18} /> زیادکردن بۆ سەبەتە</button>
            </div>
            <button onClick={() => void toggle()} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white text-sm font-black"><Heart size={18} fill={wishlisted ? 'currentColor' : 'none'} className={wishlisted ? 'text-[var(--shakh-orange)]' : ''} /> {wishlisted ? 'لە دڵخوازەکانە' : 'زیادکردن بۆ دڵخوازەکان'}</button>
            {message ? <div className="mt-4 rounded-2xl bg-emerald-500/8 px-4 py-3 text-sm font-bold leading-6 text-emerald-700">{message}</div> : null}
            <div className="mt-6 grid gap-3 border-t border-black/[0.06] pt-6 sm:grid-cols-2"><div className="flex gap-3"><Truck size={20} className="mt-0.5 text-[var(--shakh-blue)]" /><div><div className="text-sm font-black">گەیاندنی خێرا</div><div className="mt-1 text-xs leading-5 text-black/45">بەپێی شوێن و فرۆشگا دیاریدەکرێت.</div></div></div><div className="flex gap-3"><Store size={20} className="mt-0.5 text-[var(--shakh-orange)]" /><div><div className="text-sm font-black">{product.store?.name_ku ?? 'فرۆشگا'}</div><div className="mt-1 text-xs leading-5 text-black/45">فرۆشگای چالاک لە SHAKH.</div></div></div></div>
          </div>
        </div>
      </div>
    </section>
  );
}
