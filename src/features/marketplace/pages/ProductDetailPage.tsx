import { ArrowRight, Check, Heart, ShoppingBag, Store, Tag, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addToCart, getProductBySlug, isWishlisted, toggleWishlist } from '../api';
import type { Product, ProductVariant } from '../types';
import { useAuth } from '@/lib/auth/AuthContext';
import { getProductImageUrl } from '@/lib/storage/catalogMedia';
import { formatSupermarketQuantity, isSupermarketItemExpired, supermarketTypeLabel } from '@/lib/catalog/supermarket';
import { isRestaurantMenuAvailable, restaurantDietaryLabels, restaurantMenuCategoryLabels } from '@/lib/catalog/restaurant';
import { getVisibleCategoryDetails, normalizeCategoryRootSlug } from '@/lib/catalog/categoryDetails';
import { supabase } from '@/lib/supabase/client';

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [wishlisted, setWishlisted] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectedOptionIds([]);
    void (slug ? getProductBySlug(slug).then((item) => { if (!cancelled) { setProduct(item); setVariant(item?.variants[0] ?? null); setSelectedOptionIds([]); } }).catch(() => { if (!cancelled) setProduct(null); }).finally(() => { if (!cancelled) setLoading(false); }) : Promise.resolve());
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_menu_details', filter: 'product_id=eq.' + product.id }, () => {
        void getProductBySlug(product.slug).then((next) => { if (next) setProduct(next); }).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_menu_option_groups', filter: 'product_id=eq.' + product.id }, () => {
        void getProductBySlug(product.slug).then((next) => { if (next) { setProduct(next); setSelectedOptionIds((current) => current.filter((id) => next.restaurantOptionGroups.some((group) => group.options.some((option) => option.id === id)))); } }).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_menu_options' }, () => {
        void getProductBySlug(product.slug).then((next) => { if (next) { setProduct(next); setSelectedOptionIds((current) => current.filter((id) => next.restaurantOptionGroups.some((group) => group.options.some((option) => option.id === id)))); } }).catch(() => {});
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

  const restaurant = product.restaurantMenu;
  const categoryDetails = getVisibleCategoryDetails(normalizeCategoryRootSlug(product.category?.slug), product.category_details, product.apparel_product_type ?? '');
  const menuAvailable = restaurant
    ? isRestaurantMenuAvailable(restaurant.is_available, restaurant.available_from, restaurant.available_until)
    : false;
  const basePrice = variant?.price_iqd ?? product.base_price_iqd;
  const selectedOptions = product.restaurantOptionGroups.flatMap((group) => group.options.filter((option) => selectedOptionIds.includes(option.id)));
  const selectedOptionsPrice = selectedOptions.reduce((sum, option) => sum + Number(option.price_iqd), 0);
  const price = basePrice + selectedOptionsPrice;
  const maxStock = restaurant ? 99 : (variant?.stock_quantity ?? product.stock_quantity);
  const expired = !restaurant && (isSupermarketItemExpired(product.expiry_date) || isSupermarketItemExpired(variant?.expiry_date));
  const optionSelectionValid = !restaurant || product.restaurantOptionGroups.every((group) => {
    const count = selectedOptionIds.filter((id) => group.options.some((option) => option.id === id)).length;
    return count >= group.min_select && count <= group.max_select;
  });
  const canBuy = restaurant
    ? menuAvailable && (variant?.is_active ?? true)
    : maxStock > 0 && !expired && (variant?.is_active ?? true);

  const buy = async () => {
    setMessage(null);
    if (!optionSelectionValid) {
      setMessage('تکایە هەڵبژاردە پێویستەکانی خواردن دیاری بکە.');
      return;
    }
    if (!canBuy) {
      setMessage(restaurant ? 'ئەم خواردنە لە ئێستادا بەردەست نییە.' : 'ئەم بەرهەمە بەردەست نییە.');
      return;
    }
    if (!isAuthenticated || !user) {
      navigate('/login', { state: { from: `/product/${product.slug}` } });
      return;
    }
    try {
      await addToCart(user.id, product.id, variant?.id ?? null, Math.min(quantity, maxStock), price, selectedOptionIds);
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
    <section className="shakh-page py-6 sm:py-10">
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
            {product.expiry_date ? <p className={`mt-2 text-xs font-semibold ${isSupermarketItemExpired(product.expiry_date) ? 'text-red-600' : 'text-black/45'}`}>بەرواری بەسەرچوون: {product.expiry_date}{isSupermarketItemExpired(product.expiry_date) ? ' · بەسەرچووە' : ''}</p> : null}
            {variant?.manufacturing_date ? <p className="mt-2 text-xs font-semibold text-black/45">بەرواری بەرهەمهێنانی وەشان: {variant.manufacturing_date}</p> : null}
            {variant?.expiry_date ? <p className={`mt-2 text-xs font-semibold ${isSupermarketItemExpired(variant.expiry_date) || expired ? 'text-red-600' : 'text-black/45'}`}>بەرواری بەسەرچوونی وەشان: {variant.expiry_date}{isSupermarketItemExpired(variant.expiry_date) || expired ? ' · بەسەرچووە' : ''}</p> : null}
            {restaurant ? <div className="mt-5 space-y-3 rounded-2xl bg-[var(--shakh-bg)] p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-black"><span className="rounded-full bg-white px-3 py-2">{restaurantMenuCategoryLabels[restaurant.menu_category] ?? 'خواردن'}</span><span>{restaurant.prep_time_minutes} خولەک بۆ ئامادەکردن</span><span className={menuAvailable ? 'text-emerald-700' : 'text-red-600'}>{menuAvailable ? 'بەردەستە' : 'لە ئێستادا بەردەست نییە'}</span></div>
              {restaurant.available_from && restaurant.available_until ? <p className="text-xs font-bold text-black/50">کاتی بەردەستبوون: {restaurant.available_from.slice(0,5)} – {restaurant.available_until.slice(0,5)}</p> : null}
              {restaurant.ingredients ? <p className="text-sm leading-7 text-black/70"><strong>پێکهاتەکان:</strong> {restaurant.ingredients}</p> : null}
              {restaurant.allergen_warnings ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-800">هۆشداریی ئەلێرژی: {restaurant.allergen_warnings}</p> : null}
              {restaurant.dietary_tags.length ? <div className="flex flex-wrap gap-2">{restaurant.dietary_tags.map((tag) => <span key={tag} className="rounded-full bg-white px-3 py-2 text-xs font-bold text-black/55">{restaurantDietaryLabels[tag] ?? tag}</span>)}</div> : null}
              {restaurant.spice_level > 0 ? <p className="text-xs font-bold text-[var(--shakh-orange)]">ئاستی توندی: {['','کەم','مامناوەند','زۆر توند'][restaurant.spice_level] ?? 'توند'}</p> : null}
            </div> : null}
            {!restaurant && product.ingredients ? <p className="mt-3 text-sm leading-7 text-black/60">پێکهاتەکان: {product.ingredients}</p> : null}
            {!restaurant && product.allergen_warnings ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">هۆشداریی ئەلێرژی: {product.allergen_warnings}</p> : null}
            {product.storage_instructions ? <p className="mt-3 text-sm leading-7 text-black/60">ڕێنمایی هەڵگرتن: {product.storage_instructions}</p> : null}
            {product.cleaning_type ? <p className="mt-3 text-sm leading-7 text-black/60">جۆری پاککەرەوە: {product.cleaning_type}</p> : null}
            {categoryDetails.length ? <section className="mt-6 rounded-2xl border border-black/[0.07] bg-white p-4 sm:p-5">
              <div className="flex items-center gap-2"><div className="grid size-9 place-items-center rounded-xl bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]"><Tag size={17} /></div><h2 className="text-base font-black">وردەکاریی تایبەتی ئەم کاتەگۆرییە</h2></div>
              <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                {categoryDetails.map((item) => <div key={item.key} className="rounded-xl bg-[var(--shakh-bg)] px-3 py-3">
                  <dt className="text-xs font-bold text-black/45">{item.label}</dt>
                  <dd className="mt-1 break-words text-sm font-black text-black/80">{item.value}</dd>
                </div>)}
              </dl>
            </section> : null}
            {product.attributes.length ? <section className="mt-6 rounded-2xl border border-black/[0.07] p-4 sm:p-5">
              <h2 className="text-base font-black">تایبەتمەندییەکانی بەرهەم</h2>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                {product.attributes.map((attribute, index) => {
                  const label = attribute.name_ku || attribute.name_ar || attribute.name_en;
                  const value = attribute.value_ku || attribute.value_ar || attribute.value_en;
                  return label && value ? <div key={`${label}-${index}`} className="rounded-xl bg-[var(--shakh-bg)] px-3 py-3">
                    <dt className="text-xs font-bold text-black/45">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-black text-black/80">{value}</dd>
                  </div> : null;
                })}
              </dl>
            </section> : null}
            <div className="mt-6 flex flex-wrap items-end gap-3"><div><div className="text-3xl font-black tabular-nums">{price.toLocaleString('en-US')} <span className="text-sm text-black/40">د.ع</span></div>{restaurant && selectedOptionsPrice > 0 ? <div className="mt-1 text-xs font-bold text-black/45">زیادکراوەکان: +{selectedOptionsPrice.toLocaleString('en-US')} د.ع</div> : null}</div>{restaurant && product.compare_at_price_iqd && product.compare_at_price_iqd > product.base_price_iqd && (variant?.price_iqd == null || variant.price_iqd === product.base_price_iqd) ? <><div className="pb-1 text-sm text-black/35 line-through">{(product.compare_at_price_iqd + selectedOptionsPrice).toLocaleString('en-US')} د.ع</div><span className="rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1 text-xs font-black text-[var(--shakh-orange)]">{Math.max(0, Math.round((1 - price / (product.compare_at_price_iqd + selectedOptionsPrice)) * 100))}٪ داشکاندن</span></> : !restaurant && product.compare_at_price_iqd && product.compare_at_price_iqd > price && (variant?.price_iqd == null || variant.price_iqd === product.base_price_iqd) ? <><div className="pb-1 text-sm text-black/35 line-through">{product.compare_at_price_iqd.toLocaleString('en-US')} د.ع</div><span className="rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1 text-xs font-black text-[var(--shakh-orange)]">{Math.round((1 - price / product.compare_at_price_iqd) * 100)}٪ داشکاندن</span></> : null}</div>

            {restaurant && restaurant.is_available && product.restaurantOptionGroups.length ? <div className="mt-7 space-y-4">
              <div><h2 className="text-lg font-black">زیادکراوە و هەڵبژاردەکان</h2><p className="mt-1 text-xs leading-6 text-black/45">نرخ بە پێی قەبارە و زیادکراوە هەڵبژێردراوەکان دەگۆڕێت. هەڵبژاردەی پێویست دیاری بکە.</p></div>
              {product.restaurantOptionGroups.map((group) => {
                const groupSelected = selectedOptionIds.filter((id) => group.options.some((option) => option.id === id));
                return <section key={group.id} className="rounded-2xl border border-black/[0.07] p-4">
                  <div className="flex items-center justify-between gap-2"><h3 className="font-black">{group.name_ku}</h3><span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1 text-[10px] font-black text-black/50">{group.is_required ? 'پێویستە' : 'ئارەزوومەندانە'} · {group.min_select}–{group.max_select}</span></div>
                  <div className="mt-3 space-y-2">{group.options.map((option) => {
                    const checked = selectedOptionIds.includes(option.id);
                    const canSelectMore = checked || groupSelected.length < group.max_select;
                    return <label key={option.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition ${checked ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/[0.04]' : 'border-black/[0.06]'} ${!canSelectMore ? 'opacity-45' : ''}`}>
                      <span className="flex min-w-0 items-center gap-3"><input type={group.max_select === 1 && group.min_select > 0 ? 'radio' : 'checkbox'} name={'restaurant-group-' + group.id} checked={checked} disabled={!canSelectMore} onChange={() => {
                        setSelectedOptionIds((current) => {
                          if (checked) return current.filter((id) => id !== option.id);
                          if (group.max_select === 1) return [...current.filter((id) => !group.options.some((candidate) => candidate.id === id)), option.id];
                          if (groupSelected.length >= group.max_select) return current;
                          return [...current, option.id];
                        });
                        setMessage(null);
                      }} className="size-4 shrink-0 accent-[var(--shakh-blue)]" /><span className="text-sm font-bold">{option.name_ku}</span></span>
                      <span className="shrink-0 text-sm font-black tabular-nums">{Number(option.price_iqd) > 0 ? '+' + Number(option.price_iqd).toLocaleString('en-US') + ' د.ع' : 'بەخۆڕایی'}</span>
                    </label>;
                  })}</div>
                </section>;
              })}
            </div> : null}
            {product.variants.length ? (
              <div className="mt-7"><div className="text-sm font-black">قەبارە، تام و وەشانەکان</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{product.variants.map((item) => { const itemExpired = !restaurant && (isSupermarketItemExpired(product.expiry_date) || isSupermarketItemExpired(item.expiry_date)); const itemAvailable = restaurant ? menuAvailable : item.stock_quantity > 0 && !itemExpired; const itemPrice = item.price_iqd ?? product.base_price_iqd; return <button key={item.id} type="button" onClick={() => { setVariant(item); setQuantity(1); setMessage(null); }} className={`rounded-2xl border p-3 text-start transition ${variant?.id === item.id ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/8' : 'border-black/10 bg-white'}`}><span className="block text-sm font-black">{item.name_ku}</span>{formatSupermarketQuantity(item.quantity_value, item.quantity_unit, item.package_count) ? <span className="mt-1 block text-xs font-bold text-black/50">{formatSupermarketQuantity(item.quantity_value, item.quantity_unit, item.package_count)}</span> : null}{item.flavor ? <span className="mt-1 block text-xs font-bold text-[var(--shakh-blue)]">تام: {item.flavor}</span> : null}<span className="mt-2 flex flex-wrap items-center gap-2 text-xs font-black"><span>{itemPrice.toLocaleString('en-US')} د.ع</span><span className={itemAvailable ? 'text-emerald-700' : 'text-red-600'}>{restaurant ? (menuAvailable ? 'بەردەستە بۆ داواکردن' : 'لە ئێستادا بەردەست نییە') : itemExpired ? 'بەسەرچووە' : itemAvailable ? `${item.stock_quantity.toLocaleString('en-US')} دانە بەردەستە` : 'کۆگا بەتاڵە'}</span></span></button>; })}</div></div>
            ) : null}

            <div className="mt-7 flex items-center gap-3 rounded-2xl bg-[var(--shakh-bg)] p-3 text-sm font-bold"><span className={`grid size-9 place-items-center rounded-xl ${canBuy ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}><Check size={17} /></span>{restaurant ? (menuAvailable ? 'بەردەستە بۆ داواکردن' : 'لە کاتی ئێستادا داواکردن بەردەست نییە') : expired ? 'بەرواری بەسەرچوونی بەرهەم تێپەڕیوە' : canBuy ? `${maxStock} دانە بەردەستە` : 'ئەم بەرهەمە بەردەست نییە'}</div>
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
