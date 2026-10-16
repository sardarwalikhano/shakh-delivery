import { BadgeDollarSign, FileText, MapPin, Send, Tag, Upload, WalletCards, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import { VehicleListingFields } from '../components/VehicleListingFields';
import { EMPTY_VEHICLE_LISTING, validateVehicleListing, type VehicleListingDraft, type VehiclePhotoKind } from '../vehicleTypes';
import type { AppRole } from '@/lib/permissions/AuthorizationContext';
import { MAX_POST_IMAGES } from '@/lib/storage/postMedia';
import { createPost, getAllowedPostTargets } from '../api';
import { postCategoryLabels, postRoleLabels } from '../labels';
import type { ApparelAudience, ApparelCondition, ApparelSeason, ApparelType, PostTarget } from '../types';
import { getCategoryDetailFields, getVisibleCategoryDetails, sanitizeCategoryDetails, type CategoryDetails } from '@/lib/catalog/categoryDetails';
import { getActiveManualPaymentMethods, type ManualPaymentMethod } from '../manualPayments';

type ApparelColor = { name: string; hex: string };
type VariantDraft = { enabled: boolean; stock: string; price: string; imageIndex: string };

const apparelTypes: Array<{ value: ApparelType; label: string; group: 'clothing' | 'shoes' | 'other' }> = [
  { value: 'mens_clothing', label: 'جل‌وبەرگی پیاوان', group: 'clothing' },
  { value: 'womens_clothing', label: 'جل‌وبەرگی ئافرەتان', group: 'clothing' },
  { value: 'kids_clothing', label: 'جل‌وبەرگی منداڵان', group: 'clothing' },
  { value: 'mens_shoes', label: 'پێڵاوی پیاوان', group: 'shoes' },
  { value: 'womens_shoes', label: 'پێڵاوی ئافرەتان', group: 'shoes' },
  { value: 'kids_shoes', label: 'پێڵاوی منداڵان', group: 'shoes' },
  { value: 'bags', label: 'جانتـا', group: 'other' },
  { value: 'sportswear', label: 'جل‌وبەرگی وەرزشی', group: 'clothing' },
  { value: 'home_textiles', label: 'جل‌وبەرگی ناوماڵ', group: 'other' },
  { value: 'beauty_fashion_accessories', label: 'کەلوپەلی جوانکاری و ئەکسسواراتی جل‌وبەرگ', group: 'other' },
  { value: 'other_accessories', label: 'پێداویستیی تر و ئەکسسوارات', group: 'other' },
];

const standardColors: ApparelColor[] = [
  { name: 'ڕەش', hex: '#171717' },
  { name: 'سپی', hex: '#FFFFFF' },
  { name: 'سوور', hex: '#DC2626' },
  { name: 'شین', hex: '#2563EB' },
  { name: 'خاکستەری', hex: '#6B7280' },
  { name: 'قاوەیی', hex: '#854D0E' },
  { name: 'سەوز', hex: '#15803D' },
  { name: 'زەرد', hex: '#EAB308' },
  { name: 'مۆر', hex: '#9333EA' },
  { name: 'پەمەیی', hex: '#EC4899' },
  { name: 'نارنجی', hex: '#F97316' },
  { name: 'کرێم', hex: '#F5F5DC' },
];

const electronicsColorSwatches: Record<string, string> = {
  black: '#171717', white: '#FFFFFF', blue: '#2563EB', silver: '#C0C0C0',
  gray: '#6B7280', gold: '#D4AF37', green: '#15803D', red: '#DC2626',
  purple: '#9333EA', pink: '#EC4899', other: '#9CA3AF',
};

function sizeOptionsFor(type: ApparelType): string[] {
  if (type === 'mens_shoes' || type === 'womens_shoes') return Array.from({ length: 11 }, (_, index) => String(index + 36));
  if (type === 'kids_shoes') return Array.from({ length: 13 }, (_, index) => String(index + 24));
  if (type === 'kids_clothing') return ['٢ ساڵ', '٣ ساڵ', '٤ ساڵ', '٥ ساڵ', '٦ ساڵ', '٧ ساڵ', '٨ ساڵ', '٩ ساڵ', '١٠ ساڵ', '١١ ساڵ', '١٢ ساڵ', '١٣ ساڵ', '١٤ ساڵ', 'XS', 'S', 'M', 'L', 'XL'];
  if (type === 'home_textiles') return ['یەک قەبارە', 'فردی', 'دوو کەسی', 'Queen', 'King'];
  if (type === 'bags' || type === 'beauty_fashion_accessories' || type === 'other_accessories') return ['یەک قەبارە'];
  return ['XS', 'S', 'M', 'L', 'XL', 'XXL', '44', '46', '48', '50', '52', '54', '56', '58', '60'];
}

function variantKey(colorHex: string, size: string): string {
  return colorHex.toLowerCase() + '::' + size.trim().toLocaleLowerCase();
}

export function CreatePostPage() {
  const navigate = useNavigate();
  const [targets, setTargets] = useState<PostTarget[]>([]);
  const [role, setRole] = useState<AppRole | ''>('');
  const [category, setCategory] = useState<PostTarget['category'] | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('');
  const [referralRewardIqd, setReferralRewardIqd] = useState('0');
  const [location, setLocation] = useState('');
  const [apparelType, setApparelType] = useState<ApparelType>('mens_clothing');
  const [brand, setBrand] = useState('');
  const [electronicsDetails, setElectronicsDetails] = useState<CategoryDetails>({});
  const [homeLivingDetails, setHomeLivingDetails] = useState<CategoryDetails>({});
  const [homeLivingPaymentStep, setHomeLivingPaymentStep] = useState(false);
  const [manualPaymentMethods, setManualPaymentMethods] = useState<ManualPaymentMethod[]>([]);
  const [manualPaymentMethodsLoading, setManualPaymentMethodsLoading] = useState(false);
  const [manualPaymentMethodsError, setManualPaymentMethodsError] = useState<string | null>(null);
  const [selectedManualPaymentMethodId, setSelectedManualPaymentMethodId] = useState('');
  const [manualPaymentReceipt, setManualPaymentReceipt] = useState<File | null>(null);
  const [electronicsColorImageFiles, setElectronicsColorImageFiles] = useState<Record<string, File>>({});
  const [material, setMaterial] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [season, setSeason] = useState<ApparelSeason>('all_seasons');
  const [itemCondition, setItemCondition] = useState<ApparelCondition>('new');
  const [apparelAudience, setApparelAudience] = useState<ApparelAudience>('men');
  const [reviewing, setReviewing] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [images, setImages] = useState<File[]>([]);
  const [vehicleListing, setVehicleListing] = useState<VehicleListingDraft>(() => ({ ...EMPTY_VEHICLE_LISTING, features: [] }));
  const [vehiclePhotoKinds, setVehiclePhotoKinds] = useState<Map<File, VehiclePhotoKind>>(() => new Map());
  const [colors, setColors] = useState<ApparelColor[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [customColorName, setCustomColorName] = useState('');
  const [customColorHex, setCustomColorHex] = useState('#0F766E');
  const [customSize, setCustomSize] = useState('');
  const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextTargets = await getAllowedPostTargets();
      setTargets(nextTargets);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا دەسەڵاتەکانی پۆستکردن بخوێندرێنەوە.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!homeLivingPaymentStep) return;
    let cancelled = false;
    setManualPaymentMethodsLoading(true);
    setManualPaymentMethodsError(null);
    void getActiveManualPaymentMethods()
      .then((methods) => {
        if (cancelled) return;
        setManualPaymentMethods(methods);
        setSelectedManualPaymentMethodId((current) => current || methods[0]?.id || '');
      })
      .catch((nextError) => {
        if (!cancelled) setManualPaymentMethodsError(nextError instanceof Error ? nextError.message : 'نەتوانرا ژمارەکانی پارەدان بخوێندرێنەوە.');
      })
      .finally(() => { if (!cancelled) setManualPaymentMethodsLoading(false); });
    return () => { cancelled = true; };
  }, [homeLivingPaymentStep]);

  const roles = useMemo(() => [...new Set(targets.map((item) => item.publisher_role))], [targets]);
  const preferredRole = useMemo(
    () => roles.find((item) => item !== 'customer' && item !== 'super_admin') ?? roles[0] ?? '',
    [roles],
  );
  const categories = useMemo(
    () => [...new Set(targets.filter((item) => item.publisher_role === role).map((item) => item.category))],
    [role, targets],
  );

  useEffect(() => {
    if (!targets.length) return;
    const nextRole = roles.includes(role as AppRole) ? role as AppRole : preferredRole;
    const roleTargets = targets.filter((item) => item.publisher_role === nextRole);
    const nextCategory = roleTargets.some((item) => item.category === category)
      ? category
      : roleTargets.find((item) => item.category !== 'cars')?.category
        ?? roleTargets[0]?.category
        ?? '';
    if (role !== nextRole) setRole(nextRole);
    if (category !== nextCategory) setCategory(nextCategory);
  }, [category, preferredRole, role, roles, targets]);

  const availableSizes = useMemo(() => sizeOptionsFor(apparelType), [apparelType]);
  const selectedElectronicsColors = useMemo(() => {
    const configured = typeof electronicsDetails.available_colors === 'string'
      ? electronicsDetails.available_colors.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    const fallback = typeof electronicsDetails.color === 'string' && electronicsDetails.color.trim()
      ? [electronicsDetails.color.trim()]
      : [];
    return [...new Set(configured.length ? configured : fallback)];
  }, [electronicsDetails.available_colors, electronicsDetails.color]);
  const combinations = useMemo(
    () => colors.flatMap((color) => sizes.map((size) => ({ color, size, key: variantKey(color.hex, size) }))),
    [colors, sizes],
  );
  const totalStock = useMemo(
    () => combinations.reduce((sum, item) => {
      const draft = variantDrafts[item.key];
      return sum + (draft?.enabled ? Math.max(0, Math.floor(Number(draft.stock || '0'))) : 0);
    }, 0),
    [combinations, variantDrafts],
  );

  const toggleColor = (color: ApparelColor) => {
    const removing = colors.some((item) => item.hex.toLowerCase() === color.hex.toLowerCase());
    setColors((current) => removing
      ? current.filter((item) => item.hex.toLowerCase() !== color.hex.toLowerCase())
      : [...current, color]);
    if (removing) {
      setVariantDrafts((current) => Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(color.hex.toLowerCase() + '::')),
      ));
    }
  };

  const toggleElectronicsColor = (colorValue: string) => {
    const removing = selectedElectronicsColors.includes(colorValue);
    if (!removing && selectedElectronicsColors.length >= MAX_POST_IMAGES) {
      setError(`بۆ هەر ڕەنگێک وێنەیەک پێویستە؛ زۆرترین ${MAX_POST_IMAGES} ڕەنگ هەڵبژێرە.`);
      return;
    }
    const nextColors = removing
      ? selectedElectronicsColors.filter((item) => item !== colorValue)
      : [...selectedElectronicsColors, colorValue];
    setElectronicsDetails((previous) => ({
      ...previous,
      color: nextColors[0] ?? '',
      available_colors: nextColors.join(','),
    }));
    if (removing) {
      setElectronicsColorImageFiles((previous) => {
        const next = { ...previous };
        delete next[colorValue];
        return next;
      });
    }
    setError(null);
  };

  const handleElectronicsColorImageChange = (colorValue: string, file: File | undefined) => {
    if (!file) return;
    if (!selectedElectronicsColors.includes(colorValue)) {
      setError('سەرەتا ئەم ڕەنگە هەڵبژێرە، پاشان وێنەی بۆ دابنێ.');
      return;
    }
    const previousFile = electronicsColorImageFiles[colorValue];
    const previousFileUsedByAnotherColor = Boolean(previousFile && Object.entries(electronicsColorImageFiles)
      .some(([otherColor, otherFile]) => otherColor !== colorValue && otherFile === previousFile));
    const canReplacePreviousFile = Boolean(previousFile && !previousFileUsedByAnotherColor);
    if (!images.includes(file) && images.length - (canReplacePreviousFile ? 1 : 0) >= MAX_POST_IMAGES) {
      setError(`کۆی وێنەکانی ئەم پۆستە نابێت لە ${MAX_POST_IMAGES} وێنە زیاتر بێت.`);
      return;
    }
    setImages((current) => {
      const withoutPrevious = canReplacePreviousFile ? current.filter((image) => image !== previousFile) : current;
      return withoutPrevious.includes(file) ? withoutPrevious : [...withoutPrevious, file];
    });
    setElectronicsColorImageFiles((current) => ({ ...current, [colorValue]: file }));
    setError(null);
  };

  const toggleSize = (size: string) => {
    const removing = sizes.some((item) => item.toLowerCase() === size.toLowerCase());
    setSizes((current) => removing
      ? current.filter((item) => item.toLowerCase() !== size.toLowerCase())
      : [...current, size]);
    if (removing) {
      setVariantDrafts((current) => Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.endsWith('::' + size.trim().toLocaleLowerCase())),
      ));
    }
  };

  const updateVariant = (key: string, patch: Partial<VariantDraft>) => {
    setVariantDrafts((current) => {
      const previous = current[key] ?? { enabled: false, stock: '', price: '', imageIndex: '' };
      return { ...current, [key]: { ...previous, ...patch } };
    });
  };

  const addCustomColor = () => {
    const name = customColorName.trim();
    if (!name) { setError('ناوی ڕەنگی تایبەت بنووسە.'); return; }
    if (colors.some((item) => item.hex.toLowerCase() === customColorHex.toLowerCase())) {
      setError('ئەم ڕەنگە پێشتر هەڵبژێردراوە.');
      return;
    }
    setColors((current) => [...current, { name, hex: customColorHex.toUpperCase() }]);
    setCustomColorName('');
    setError(null);
  };

  const addCustomSize = () => {
    const size = customSize.trim();
    if (!size) return;
    if (sizes.some((item) => item.toLowerCase() === size.toLowerCase())) {
      setError('ئەم قەبارەیە پێشتر هەڵبژێردراوە.');
      return;
    }
    setSizes((current) => [...current, size]);
    setCustomSize('');
    setError(null);
  };

  const updateImages = (nextImages: File[]) => {
    setVariantDrafts((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => {
      if (value.imageIndex === '') return [key, value];
      const oldFile = images[Number(value.imageIndex)];
      const nextIndex = oldFile ? nextImages.indexOf(oldFile) : -1;
      return [key, { ...value, imageIndex: nextIndex < 0 ? '' : String(nextIndex) }];
    })));
    setElectronicsColorImageFiles((current) => Object.fromEntries(
      Object.entries(current).filter(([, file]) => nextImages.includes(file)),
    ));
    setImages(nextImages);
  };

  const updateVehicleImages = (nextImages: File[]) => {
    setVehiclePhotoKinds((current) => new Map(nextImages.map((file) => [file, current.get(file) ?? ''])));
    updateImages(nextImages);
  };

  const updateVehiclePhotoKind = (file: File, kind: VehiclePhotoKind) => {
    setVehiclePhotoKinds((current) => {
      const next = new Map(current);
      next.set(file, kind);
      return next;
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !role || !category) return;
    setError(null);

    if (title.trim().length < 3) return setError('ناونیشانی پۆست دەبێت لانیکەم 3 پیت بێت.');
    if (content.trim().length > 12000) return setError('ناوەڕۆک زۆر درێژە.');

    if (category === 'cars') {
      const vehicleError = validateVehicleListing(vehicleListing);
      if (vehicleError) return setError(vehicleError);
      if (images.length < 1 || images.length > MAX_POST_IMAGES) return setError('بۆ پۆستی ئۆتۆمبێل لانیکەم یەک وێنە و زۆرترین ٨ وێنە هەڵبژێرە.');
      if (!reviewing) { setReviewing(true); return; }
      setBusy(true);
      try {
        const created = await createPost({
          publisherRole: role,
          category,
          title,
          content,
          priceIqd: Number(vehicleListing.price_amount),
          referralRewardIqd: 0,
          location: vehicleListing.location,
          images,
          vehicle: {
            details: vehicleListing,
            imageKinds: images.map((file) => vehiclePhotoKinds.get(file) ?? ''),
          },
        });
        setSuccess(true);
        navigate(`/posts/${created.id}`, { replace: true });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'پۆستکردنی ئۆتۆمبێل سەرکەوتوو نەبوو.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (category === 'electronics') {
      if (!brand.trim()) return setError('بڕاندی ئامێر دیاری بکە.');
      const numericPrice = price.trim() ? Number(price.replace(/,/g, '')) : null;
      if (numericPrice === null || !Number.isFinite(numericPrice) || numericPrice <= 0) return setError('نرخی ئەلیکترۆنیات دەبێت لە سفر زیاتر بێت.');
      if (images.length < 1 || images.length > MAX_POST_IMAGES) return setError('بۆ پۆستی ئەلیکترۆنیات لانیکەم یەک وێنە و زۆرترین ٨ وێنە هەڵبژێرە.');
      if (!selectedElectronicsColors.length) return setError('لانیکەم یەک ڕەنگی ئەلیکترۆنیات هەڵبژێرە.');
      const missingColorPhoto = selectedElectronicsColors.find((colorValue) => {
        const file = electronicsColorImageFiles[colorValue];
        return !file || !images.includes(file);
      });
      if (missingColorPhoto) {
        const label = getCategoryDetailFields('electronics').find((field) => field.key === 'color')?.options?.find((option) => option.value === missingColorPhoto)?.label ?? missingColorPhoto;
        return setError(`تکایە وێنەی ڕەنگی «${label}» دابنێ.`);
      }
      const colorImageIndexes = Object.fromEntries(selectedElectronicsColors.map((colorValue) => [colorValue, images.indexOf(electronicsColorImageFiles[colorValue])]));
      const details = sanitizeCategoryDetails('electronics', {
        ...electronicsDetails,
        color: selectedElectronicsColors[0],
        available_colors: selectedElectronicsColors.join(','),
        color_image_indexes: JSON.stringify(colorImageIndexes),
      });
      if (details.error) return setError(details.error);
      if (!reviewing) { setReviewing(true); return; }
      setBusy(true);
      try {
        const created = await createPost({
          publisherRole: role,
          category: 'electronics',
          title,
          content,
          priceIqd: numericPrice,
          referralRewardIqd: Number(referralRewardIqd || '0'),
          brand: brand.trim(),
          categoryDetails: details.values,
          location,
          images,
        });
        setSuccess(true);
        navigate(`/posts/${created.id}`, { replace: true });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'پۆستکردنی ئەلیکترۆنیات سەرکەوتوو نەبوو.');
      } finally {
        setBusy(false);
      }
      return;
    }

    const numericPrice = price.trim() ? Number(price.replace(/,/g, '')) : null;
    if (numericPrice !== null && (!Number.isFinite(numericPrice) || numericPrice < 0)) return setError('نرخی پۆست دروست نییە.');

    if (category === 'home_living') {
      const details = sanitizeCategoryDetails('home-living', homeLivingDetails);
      if (details.error) return setError(details.error);
      if (images.length < 1 || images.length > MAX_POST_IMAGES) return setError('بۆ ئەم پۆستە لانیکەم یەک و زۆرترین ٨ وێنە هەڵبژێرە.');
      const listingKind = String(details.values.listing_kind ?? '');
      const postingFee = listingKind === 'property' ? 5000 : listingKind === 'furniture' ? 2000 : 0;
      if (!listingKind) return setError('تکایە جۆری پۆست دیاری بکە.');
      if (!price.trim() || numericPrice === null || numericPrice <= 0) {
        return setError(listingKind === 'property' ? 'نرخی خانوو، زەوی یان موڵک بنووسە.' : 'نرخی مۆبیلیات یان کەلوپەل بنووسە.');
      }
      if (listingKind === 'property' && (!details.values.property_type || !details.values.deal_type)) return setError('جۆری موڵک و جۆری مامەڵە (فرۆشتن/کرێ) دیاری بکە.');
      if (!reviewing) { setReviewing(true); return; }
      if (!homeLivingPaymentStep) { setHomeLivingPaymentStep(true); return; }
      if (manualPaymentMethodsLoading) return setError('تکایە چاوەڕێ بکە تا شێوازەکانی پارەدان بار دەبن.');
      if (!manualPaymentMethods.some((method) => method.id === selectedManualPaymentMethodId)) {
        return setError(manualPaymentMethods.length
          ? 'شێوازی پارەدان هەڵبژێرە.'
          : 'سوپەر ئەدمین هێشتا ژمارەی فاستپەی، FIB یان ئاسیا حوالە ڕێک نەخستووە.');
      }
      if (!manualPaymentReceipt) return setError('تکایە وەسڵی ناردنی پارە هەڵبژێرە.');
      setBusy(true);
      try {
        const created = await createPost({
          publisherRole: role,
          category: 'home_living',
          title,
          content,
          priceIqd: numericPrice,
          referralRewardIqd: 0,
          brand: null,
          categoryDetails: { ...details.values, posting_fee_iqd: String(postingFee) },
          location,
          images,
          manualReviewRequired: true,
          manualPayment: {
            paymentMethodId: selectedManualPaymentMethodId,
            receiptFile: manualPaymentReceipt,
            amountIqd: postingFee,
          },
        });
        setSuccess(true);
        navigate(`/posts/${created.id}?submission=pending-review`, { replace: true });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'ناردنی پۆست بۆ پشکنین سەرکەوتوو نەبوو.');
      } finally {
        setBusy(false);
      }
      return;
    }

    const apparel = category === 'fashion';
    if (apparel) {
      if (numericPrice === null || numericPrice <= 0) return setError('نرخی بەرهەمی جل‌وبەرگ پێویستە و دەبێت لە سفر زیاتر بێت.');
      if (images.length < 1 || images.length > MAX_POST_IMAGES) return setError('لە ١ تا ٨ وێنەی ڕاستەقینەی بەرهەم هەڵبژێرە.');
      if (!colors.length) return setError('لانیکەم یەک ڕەنگ هەڵبژێرە.');
      if (!sizes.length) return setError('لانیکەم یەک قەبارە هەڵبژێرە.');
      if (!combinations.length) return setError('ڕەنگ و قەبارەکان پێکەوە هەڵبژێرە.');
      const activeCombinations = combinations.filter((item) => variantDrafts[item.key]?.enabled === true);
      if (!activeCombinations.length) return setError('تەنها تێکەڵەی ئەو ڕەنگ و قەبارانە نیشانە بکە کە بەڕاستی بەردەستن.');
      if (!totalStock) return setError('کۆگای لانیکەم یەک تێکەڵەی ڕەنگ و قەبارە دەبێت لە سفر زیاتر بێت.');

      const discount = Number(discountPercent);
      if (!Number.isInteger(discount) || discount < 0 || discount > 99) return setError('داشکاندن دەبێت لە ٠ تا ٩٩٪ بێت.');

      for (const item of activeCombinations) {
        const draft = variantDrafts[item.key] ?? { enabled: false, stock: '', price: '', imageIndex: '' };
        if (!draft.stock.trim()) return setError(`ژمارەی کۆگای ${item.color.name} / ${item.size} پێویستە.`);
        const stock = Number(draft.stock);
        const overridePrice = draft.price.trim() ? Number(draft.price.replace(/,/g, '')) : null;
        if (!Number.isInteger(stock) || stock < 0) return setError(`کۆگای ${item.color.name} / ${item.size} دروست نییە.`);
        if (overridePrice !== null && (!Number.isFinite(overridePrice) || overridePrice <= 0)) return setError(`نرخی تایبەتی ${item.color.name} / ${item.size} دروست نییە.`);
      }

      const apparelVariants = activeCombinations.map((item) => {
        const draft = variantDrafts[item.key] ?? { enabled: false, stock: '', price: '', imageIndex: '' };
        return {
          color_name: item.color.name,
          color_hex: item.color.hex,
          size_label: item.size,
          stock_quantity: Math.floor(Number(draft.stock || '0')),
          price_iqd: draft.price.trim() ? Number(draft.price.replace(/,/g, '')) : null,
          image_index: draft.imageIndex === '' ? null : Number(draft.imageIndex),
        };
      });

      if (!reviewing) { setReviewing(true); return; }
      setBusy(true);
      try {
        const created = await createPost({
          publisherRole: role,
          category,
          title,
          content,
          priceIqd: numericPrice,
          referralRewardIqd: Number(referralRewardIqd || '0'),
          location,
          itemCondition,
          apparelAudience,
          apparel: {
            apparel_type: apparelType,
            brand,
            material,
            country_of_origin: countryOfOrigin,
            season,
            discount_percent: Number(discountPercent),
            images,
            variants: apparelVariants,
          },
        });
        setSuccess(true);
        navigate(`/posts/${created.id}`, { replace: true });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'پۆستکردن سەرکەوتوو نەبوو.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!reviewing) { setReviewing(true); return; }
    setBusy(true);
    try {
      const created = await createPost({ publisherRole: role, category, title, content, priceIqd: numericPrice, referralRewardIqd: Number(referralRewardIqd || '0'), location, images });
      setSuccess(true);
      navigate(`/posts/${created.id}`, { replace: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پۆستکردن سەرکەوتوو نەبوو.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <AuthPageShell><div className="mx-auto max-w-xl text-center text-sm font-bold text-black/50">پشکنینی دەسەڵاتی پۆستکردن...</div></AuthPageShell>;

  if (!targets.length) {
    return <AuthPageShell><AuthCard title="پۆستکردن بەردەست نییە" description="ئەم هەژمارە هیچ Role ـێکی ڕێگەپێدراو بۆ پۆستکردنی نییە."><AuthFeedback error="هیچ category ـێکت بۆ پۆستکردن نییە." /></AuthCard></AuthPageShell>;
  }

  return (
    <AuthPageShell>
      <AuthCard title="پۆستکردنی نوێ" description="زانیاریی پۆستەکە پڕبکەرەوە؛ دەسەڵات و داتای ڕاستەقینە لە Supabase پشکنین دەکرێن.">
        <form className="space-y-6" onSubmit={submit} noValidate>
          <AuthFeedback error={error} />
          {success ? <AuthSuccess>پۆستەکە بە سەرکەوتوویی بڵاوکرایەوە.</AuthSuccess> : null}

          {category === 'food' || category === 'fashion' || category === 'electronics' ? (
            <section className="space-y-2 rounded-2xl border border-[var(--shakh-orange)]/20 bg-[var(--shakh-orange)]/[0.045] p-4">
              <label className="block text-sm font-black" htmlFor="post-referral-reward">
                خەڵاتی شێرکردن بۆ هەر داواکارییەکی تەواوبوو (د.ع)
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="post-referral-reward"
                  type="number"
                  min="0"
                  max="100000000"
                  step="1"
                  inputMode="numeric"
                  value={referralRewardIqd}
                  onChange={(event) => setReferralRewardIqd(event.target.value)}
                  disabled={busy}
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-orange)]"
                />
                <span className="shrink-0 text-sm font-black">د.ع</span>
              </div>
              <p className="text-xs leading-6 text-black/50">
                ٠ واتە خەڵات ناچالاکە. ئەگەر بڕێک دابنێیت، ئەو کەسەی لینکی تایبەتی خۆی شێر دەکات ئەگەر کڕیار لەو لینکەوە داوا بکات، دوای گەیاندن و پشتڕاستبوونەوەی پارەدان بڕە دیاریکراوەکە وەردەگرێت. خەڵات بۆ هەر داواکارییەکە، نەک بۆ هەر دانەیەک، هەژمار دەکرێت.
              </p>
            </section>
          ) : null}


          <Field label="بڵاوکردنەوە بە ناوی Role">
            <select
              className={inputClass}
              value={role}
              onChange={(event) => setRole(event.target.value as AppRole)}
              disabled={busy}
            >
              {roles.map((item) => (
                <option key={item} value={item}>{postRoleLabels[item]}</option>
              ))}
            </select>
          </Field>

          <Field label="جۆری پۆست">
            <div className="relative">
              <Tag className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/35" size={17} />
              <select className={inputClass + ' ps-11'} value={category} onChange={(event) => { setCategory(event.target.value as PostTarget['category']); setReviewing(false); setHomeLivingPaymentStep(false); setSelectedManualPaymentMethodId(''); setManualPaymentReceipt(null); }}>
                {categories.map((item) => <option key={item} value={item}>{postCategoryLabels[item]}</option>)}
              </select>
            </div>
          </Field>

          {category === 'cars' ? (
            <VehicleListingFields
              value={vehicleListing}
              onChange={setVehicleListing}
              title={title}
              onTitleChange={setTitle}
              content={content}
              onContentChange={setContent}
              images={images}
              onImagesChange={updateVehicleImages}
              imageKinds={vehiclePhotoKinds}
              onPhotoKindChange={updateVehiclePhotoKind}
              reviewing={reviewing}
              onEdit={() => setReviewing(false)}
              disabled={busy}
            />
          ) : (
            <>
          <ImageUploadField
            files={images}
            onChange={updateImages}
            maxFiles={MAX_POST_IMAGES}
            disabled={busy}
            required={category === 'fashion' || category === 'electronics' || category === 'home_living'}
            label={category === 'fashion' ? 'وێنەکانی جل‌وبەرگ' : category === 'electronics' ? 'وێنەکانی ئەلیکترۆنیات' : category === 'home_living' ? 'وێنەکانی موڵک یان کەلوپەل' : 'وێنەکانی پۆست / بەرهەم'}
            hint="کامێرا یان گەلەری بەکاربهێنە؛ ڕیزی وێنەکان دەتوانیت بگۆڕیت، وێنەی یەکەم وێنەی سەرەکییە."
          />

          {category === 'fashion' ? (
            <section className="space-y-5 rounded-[26px] border border-[var(--shakh-orange)]/20 bg-white p-4 sm:p-6">
              <div>
                <h2 className="text-xl font-black">زانیاریی جل‌وبەرگ</h2>
                <p className="mt-1 text-sm leading-6 text-black/45">تەنها ڕەنگ و قەبارەی ڕاستەقینەی بەردەست هەڵبژێرە. تۆمارکردن لە Supabase پاشەکەوت و دواتر بڵاو دەکرێتەوە.</p>
              </div>

              <Field label="١. جۆری بەرهەم">
                <select className={inputClass} value={apparelType} onChange={(event) => {
                    setApparelType(event.target.value as ApparelType);
                    setSizes([]);
                    setVariantDrafts({});
                  }} required>
                  {apparelTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="بۆ کێیە؟">
                  <select className={inputClass} value={apparelAudience} onChange={(event) => setApparelAudience(event.target.value as ApparelAudience)}>
                    <option value="men">پیاوان</option><option value="women">ئافرەتان</option><option value="kids">منداڵان</option><option value="all">هەمووان</option>
                  </select>
                </Field>
                <Field label="دۆخی کاڵا">
                  <select className={inputClass} value={itemCondition} onChange={(event) => setItemCondition(event.target.value as ApparelCondition)}>
                    <option value="new">نوێ</option><option value="used">بەکارهاتوو</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="براند / کۆمپانیا (ئارەزوومەندانە)">
                  <input className={inputClass} value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={120} placeholder="ناوی براند" />
                </Field>
                <Field label="جۆری پارچە / ماددە (ئارەزوومەندانە)">
                  <input className={inputClass} value={material} onChange={(event) => setMaterial(event.target.value)} maxLength={160} placeholder="وەک: پەمە، پۆلیستەر..." />
                </Field>
                <Field label="وڵاتی دروستکردن (ئارەزوومەندانە)">
                  <input className={inputClass} value={countryOfOrigin} onChange={(event) => setCountryOfOrigin(event.target.value)} maxLength={100} placeholder="وەک: تورکیا" />
                </Field>
                <Field label="وەرزی بەکارهێنان">
                  <select className={inputClass} value={season} onChange={(event) => setSeason(event.target.value as ApparelSeason)}>
                    <option value="summer">هاوین</option>
                    <option value="winter">زستان</option>
                    <option value="all_seasons">هەموو وەرزەکان</option>
                  </select>
                </Field>
              </div>

              <div>
                <Field label="٣. ڕەنگە بەردەستەکان">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {standardColors.map((item) => {
                      const selected = colors.some((color) => color.hex.toLowerCase() === item.hex.toLowerCase());
                      return (
                        <button key={item.hex} type="button" onClick={() => toggleColor(item)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${selected ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/8' : 'border-black/10 bg-white'}`}>
                          <span className="size-5 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: item.hex }} />
                          <span>{item.name}</span>
                          {selected ? <span className="ms-auto text-[var(--shakh-orange)]">✓</span> : null}
                        </button>
                      );
                    })}
                    {colors.filter((item) => !standardColors.some((preset) => preset.hex.toLowerCase() === item.hex.toLowerCase())).map((item) => (
                      <button key={item.hex} type="button" onClick={() => toggleColor(item)} className="flex items-center gap-2 rounded-xl border border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/8 px-3 py-2.5 text-sm font-bold">
                        <span className="size-5 rounded-full border border-black/15" style={{ backgroundColor: item.hex }} /><span>{item.name}</span><X size={14} className="ms-auto" />
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input className={inputClass} value={customColorName} onChange={(event) => setCustomColorName(event.target.value)} maxLength={60} placeholder="ناوی ڕەنگی تایبەت" />
                  <label className="flex h-12 items-center justify-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-bold">
                    ڕەنگ <input type="color" value={customColorHex} onChange={(event) => setCustomColorHex(event.target.value)} className="size-7 cursor-pointer border-0 bg-transparent" />
                  </label>
                  <button type="button" onClick={addCustomColor} className="rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white">زیادکردنی ڕەنگ</button>
                </div>
              </div>

              <div>
                <Field label="٤. قەبارەکان">
                  <div className="flex flex-wrap gap-2">
                    {availableSizes.map((item) => {
                      const selected = sizes.some((size) => size.toLowerCase() === item.toLowerCase());
                      return <button key={item} type="button" onClick={() => toggleSize(item)} className={`min-w-12 rounded-xl border px-3 py-2.5 text-sm font-black ${selected ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/8 text-[var(--shakh-blue)]' : 'border-black/10 bg-white'}`}>{item}</button>;
                    })}
                    {sizes.filter((item) => !availableSizes.some((preset) => preset.toLowerCase() === item.toLowerCase())).map((item) => (
                      <button key={item} type="button" onClick={() => toggleSize(item)} className="rounded-xl border border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/8 px-3 py-2.5 text-sm font-black">{item} <X size={12} className="ms-1 inline" /></button>
                    ))}
                  </div>
                </Field>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input className={inputClass} value={customSize} onChange={(event) => setCustomSize(event.target.value)} maxLength={40} placeholder="قەبارەی تایبەت: وەک 3XL یان ١٦ ساڵ" />
                  <button type="button" onClick={addCustomSize} className="shrink-0 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white">زیادکردنی قەبارە</button>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-black">٥. کۆگا: ڕەنگ × قەبارە</h3>
                    <p className="mt-1 text-xs leading-6 text-black/45">بۆ هەر تێکەڵەیەک کۆگا و نرخی جیاواز دابنێ. نرخی بەتاڵ واتە نرخی سەرەکی.</p>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-black text-emerald-700">کۆی دانەکان: {totalStock.toLocaleString('en-US')}</div>
                </div>
                {!combinations.length ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-black/15 p-5 text-sm font-bold text-black/45">سەرەتا ڕەنگ و قەبارە هەڵبژێرە بۆ دروستبوونی خشتەی کۆگا.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {combinations.map((item) => {
                      const draft = variantDrafts[item.key] ?? { enabled: false, stock: '', price: '', imageIndex: '' };
                      return (
                        <div key={item.key} className="rounded-2xl border border-black/10 bg-[var(--shakh-bg)] p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="size-5 rounded-full border border-black/15" style={{ backgroundColor: item.color.hex }} />
                              <span className="font-black">{item.color.name}</span>
                              <span className="text-black/25">/</span>
                              <span className="font-black">{item.size}</span>
                            </div>
                            <label className="flex cursor-pointer items-center gap-2 text-xs font-black">
                              <input type="checkbox" checked={draft.enabled} onChange={(event) => updateVariant(item.key, { enabled: event.target.checked })} className="size-4 accent-[var(--shakh-orange)]" />
                              تۆمارکردنی ئەم تێکەڵەیە
                            </label>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="ژمارەی بەردەست">
                              <input className={inputClass} type="number" min="0" step="1" inputMode="numeric" value={draft.stock} onChange={(event) => updateVariant(item.key, { stock: event.target.value })} required={draft.enabled} disabled={!draft.enabled} />
                            </Field>
                            <Field label="نرخی تایبەت (د.ع)">
                              <input className={inputClass} type="number" min="1" step="1" inputMode="decimal" value={draft.price} onChange={(event) => updateVariant(item.key, { price: event.target.value })} placeholder={price ? Number(price.replace(/,/g, '')).toLocaleString('en-US') : 'نرخی سەرەکی'} disabled={!draft.enabled} />
                            </Field>
                            <Field label="وێنەی ئەم ڕەنگە">
                              <select className={inputClass} value={draft.imageIndex} onChange={(event) => updateVariant(item.key, { imageIndex: event.target.value })} disabled={!draft.enabled || !images.length}>
                                <option value="">وێنەی گشتی بەکاربهێنە</option>
                                {images.map((image, imageIndex) => <option key={image.name + image.size + image.lastModified + imageIndex} value={imageIndex}>وێنەی {imageIndex + 1}</option>)}
                              </select>
                            </Field>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="٦. داشکاندن (%)" hint="ئەگەر داشکاندن نییە، ٠ بەجێبهێڵە.">
                  <input className={inputClass} type="number" min="0" max="99" step="1" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} />
                </Field>
                <div className="rounded-2xl bg-[var(--shakh-bg)] p-4">
                  <div className="text-xs font-bold text-black/40">نرخی پێشبینیکراو دوای داشکاندن</div>
                  <div className="mt-1 text-xl font-black">{price.trim() && Number(price.replace(/,/g, '')) > 0 ? Math.round(Number(price.replace(/,/g, '')) * (100 - Math.min(99, Math.max(0, Number(discountPercent) || 0))) / 100).toLocaleString('en-US') : '—'} <span className="text-xs text-black/40">د.ع</span></div>
                </div>
              </div>
            </section>
          ) : null}

          {category === 'home_living' ? (
            <section className="space-y-4 rounded-2xl border border-[var(--shakh-blue)]/15 bg-white p-4 sm:p-6">
              <div>
                <h2 className="text-lg font-black">وردەکاریی ماڵ و ژیان</h2>
                <p className="mt-1 text-sm leading-6 text-black/50">بەپێی جۆری پۆست، زانیاریی موڵک یان مۆبیلیات پڕ بکەرەوە.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {getCategoryDetailFields('home-living').filter((field) => field.key === 'listing_kind').flatMap((field) => (field.options ?? []).map((option) => {
                  const selected = homeLivingDetails.listing_kind === option.value;
                  return <button key={option.value} type="button" aria-pressed={selected} onClick={() => { setHomeLivingDetails({ listing_kind: option.value }); setReviewing(false); setError(null); }} className={`min-h-16 rounded-xl border px-3 py-3 text-sm font-black transition ${selected ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]' : 'border-black/10 bg-[var(--shakh-bg)] text-black/65'}`}>{option.label}</button>;
                }))}
              </div>
              {getCategoryDetailFields('home-living').filter((field) => {
                const kind = homeLivingDetails.listing_kind;
                if (field.key === 'listing_kind') return false;
                if (['property_type','deal_type','area_sqm','bedrooms','bathrooms','floor_number','property_condition','ownership_documents'].includes(field.key)) return kind === 'property';
                if (['furniture_condition','color','style','room_or_location','dimension_length','dimension_width','dimension_height','dimension_unit','weight_value','weight_unit','assembly_required','warranty_months','care_instructions'].includes(field.key)) return kind === 'furniture';
                return false;
              }).map((field) => {
                const current = homeLivingDetails[field.key];
                const value = typeof current === 'string' || typeof current === 'number' ? String(current) : '';
                const setValue = (nextValue: string) => { setHomeLivingDetails((previous) => ({ ...previous, [field.key]: nextValue })); setReviewing(false); };
                if (field.type === 'select') return <Field key={field.key} label={field.label}><select className={inputClass} value={value} onChange={(event) => setValue(event.target.value)}><option value="">هەڵبژاردەیەک دیاری بکە</option>{(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>;
                if (field.type === 'number') return <Field key={field.key} label={field.label} hint={field.unit}><input className={inputClass} type="number" min={field.min} max={field.max} step="1" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} placeholder={field.unit ?? 'ژمارە'} /></Field>;
                if (field.type === 'checkbox') return <label key={field.key} className="flex min-h-12 items-center gap-3 rounded-xl border border-black/10 px-3 text-sm font-bold"><input type="checkbox" checked={current === true} onChange={(event) => { setHomeLivingDetails((previous) => ({ ...previous, [field.key]: event.target.checked })); setReviewing(false); }} className="size-4 accent-[var(--shakh-orange)]" />{field.label}</label>;
                if (field.type === 'textarea') return <Field key={field.key} label={field.label}><textarea className={inputClass + ' min-h-24'} value={value} onChange={(event) => setValue(event.target.value)} maxLength={field.maxLength ?? 2000} /></Field>;
                return <Field key={field.key} label={field.label}><input className={inputClass} value={value} onChange={(event) => setValue(event.target.value)} maxLength={field.maxLength ?? 120} placeholder={field.placeholder ?? ''} /></Field>;
              })}
              {homeLivingDetails.listing_kind ? (
                <div className="rounded-xl border border-[var(--shakh-orange)]/20 bg-[var(--shakh-orange)]/[0.06] p-4">
                  <div className="text-sm font-black">کرێی پۆستکردن</div>
                  <div className="mt-1 text-2xl font-black text-[var(--shakh-orange)]">{homeLivingDetails.listing_kind === 'property' ? '٥,٠٠٠' : '٢,٠٠٠'} <span className="text-xs">د.ع</span></div>
                  <p className="mt-1 text-xs leading-6 text-black/50">{homeLivingDetails.listing_kind === 'property' ? 'بۆ خانوو، زەوی و موڵک.' : 'بۆ مۆبیلیات و کەلوپەل.'}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {category === 'electronics' ? (
            <section className="space-y-5 rounded-[26px] border border-[var(--shakh-blue)]/20 bg-white p-4 sm:p-6">
              <div>
                <h2 className="text-xl font-black">زانیاریی ئەلیکترۆنیات</h2>
                <p className="mt-1 text-sm leading-6 text-black/45">بڕاند، جۆری ئامێر، ڕەنگ، بیرگە، RAM و کۆگای بەردەست دیاری بکە. بۆ مۆبایل، تابلێت، لاپتۆپ و دیسکتۆپ RAM و Storage پێویستن.</p>
              </div>
              <Field label="بڕاند / کۆمپانیا *">
                <input className={inputClass} required value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={120} placeholder="وەک Apple، Samsung، Lenovo، Dell" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                {getCategoryDetailFields('electronics').map((field) => {
                  const current = electronicsDetails[field.key];
                  const memoryRequired = ['phone', 'tablet', 'laptop', 'desktop'].includes(String(electronicsDetails.product_type ?? ''))
                    && ['ram_capacity', 'storage_capacity'].includes(field.key);
                  const required = Boolean(field.required || memoryRequired);
                  const value = typeof current === 'string' ? current : '';
                  const changeValue = (nextValue: string) => setElectronicsDetails((previous) => ({ ...previous, [field.key]: nextValue }));
                  if (['available_colors', 'color_image_indexes', 'color_image_paths'].includes(field.key)) return null;
                  if (field.key === 'color') {
                    return (
                      <div key={field.key} className="sm:col-span-2">
                        <Field label="ڕەنگەکانی بەردەست *" hint="دەتوانیت زیاتر لە یەک ڕەنگ هەڵبژێریت.">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {(field.options ?? []).map((option) => {
                              const selected = selectedElectronicsColors.includes(option.value);
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => toggleElectronicsColor(option.value)}
                                  className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${selected ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/8' : 'border-black/10 bg-white hover:border-black/20'}`}
                                >
                                  <span className="size-5 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: electronicsColorSwatches[option.value] ?? '#9CA3AF' }} />
                                  <span>{option.label}</span>
                                  {selected ? <span className="ms-auto text-[var(--shakh-orange)]">✓</span> : null}
                                </button>
                              );
                            })}
                          </div>
                          {selectedElectronicsColors.length ? (
                            <p className="mt-2 text-xs font-bold text-[var(--shakh-blue)]">{selectedElectronicsColors.length} ڕەنگ هەڵبژێردراوە</p>
                          ) : null}
                          {selectedElectronicsColors.length ? (
                            <div className="mt-4 space-y-3">
                              {selectedElectronicsColors.map((colorValue) => {
                                const colorOption = (field.options ?? []).find((option) => option.value === colorValue);
                                const selectedFile = electronicsColorImageFiles[colorValue];
                                return (
                                  <div key={colorValue} className="grid gap-3 rounded-2xl border border-black/10 bg-[var(--shakh-bg)] p-3 sm:grid-cols-[1fr_1.2fr] sm:items-center">
                                    <div className="flex items-center gap-2 text-sm font-black">
                                      <span className="size-6 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: electronicsColorSwatches[colorValue] ?? '#9CA3AF' }} />
                                      {colorOption?.label ?? colorValue}
                                    </div>
                                    <label className="block text-xs font-bold text-black/55">
                                      وێنەی ئەم ڕەنگە *
                                      <input
                                        className="mt-2 block w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-normal"
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        required={!selectedFile}
                                        disabled={busy}
                                        onChange={(event) => handleElectronicsColorImageChange(colorValue, event.currentTarget.files?.[0])}
                                      />
                                      <span className="mt-1 block break-all text-[11px] leading-5 text-black/45">{selectedFile?.name ?? 'هیچ وێنەیەک هەڵنەبژێردراوە'}</span>
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </Field>
                      </div>
                    );
                  }
                  if (field.type === 'select') {
                    return (
                      <Field key={field.key} label={field.label + (required ? ' *' : '')}>
                        <select className={inputClass} required={required} value={value} onChange={(event) => changeValue(event.target.value)}>
                          <option value="">هەڵبژاردەیەک دیاری بکە</option>
                          {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </Field>
                    );
                  }
                  if (field.type === 'number') {
                    return (
                      <Field key={field.key} label={field.label + (required ? ' *' : '')} hint={field.unit}>
                        <input className={inputClass} type="number" min={field.min} max={field.max} step="1" required={required} value={value} onChange={(event) => changeValue(event.target.value)} placeholder={field.unit ?? 'ژمارە بنووسە'} />
                      </Field>
                    );
                  }
                  if (field.type === 'textarea') {
                    return (
                      <Field key={field.key} label={field.label + (required ? ' *' : '')}>
                        <textarea className={inputClass + ' min-h-24'} required={required} maxLength={field.maxLength ?? 2000} value={value} onChange={(event) => changeValue(event.target.value)} placeholder={field.placeholder ?? ''} />
                      </Field>
                    );
                  }
                  return (
                    <Field key={field.key} label={field.label + (required ? ' *' : '')}>
                      <input className={inputClass} required={required} maxLength={field.maxLength ?? 120} value={value} onChange={(event) => changeValue(event.target.value)} placeholder={field.placeholder ?? ''} />
                    </Field>
                  );
                })}
              </div>
            </section>
          ) : null}

          <Field label="ناوی بەرهەم / ناونیشانی پۆست">
            <div className="relative">
              <FileText className="pointer-events-none absolute start-4 top-4 text-black/30" size={17} />
              <input className={inputClass + ' ps-11'} required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder={category === 'fashion' ? 'ناوی جل‌وبەرگ یان بەرهەم' : 'ناونیشانی پۆست'} />
            </div>
          </Field>

          <Field label="وەسفی بەرهەم">
            <textarea className={inputClass + ' min-h-32 resize-y'} value={content} onChange={(event) => setContent(event.target.value)} maxLength={12000} placeholder="وردەکاریی بەرهەم، کوالێتی و تایبەتمەندییەکان..." />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={category === 'fashion' ? 'نرخی سەرەکی (د.ع)' : category === 'electronics' ? 'نرخی ئەلیکترۆنیات (د.ع)' : 'نرخ (IQD)'} hint={category === 'fashion' ? 'نرخی ئەو ڕەنگ و قەبارانەی نرخی تایبەتیان نییە.' : 'نرخی پۆست؛ ئەگەر گونجاوە.'}>
              <div className="relative">
                <BadgeDollarSign className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/30" size={17} />
                <input className={inputClass + ' ps-11'} type="number" min={category === 'fashion' || category === 'electronics' ? 1 : 0} step="1" inputMode="decimal" required={category === 'fashion' || category === 'electronics'} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" dir="ltr" />
              </div>
            </Field>
            <Field label="شوێنی فرۆشیار">
              <div className="relative">
                <MapPin className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/30" size={17} />
                <input className={inputClass + ' ps-11'} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="هەولێر" />
              </div>
            </Field>
          </div>
            </>
          )}

          {reviewing && category !== 'cars' ? (
            <section className="space-y-3 rounded-2xl border border-[var(--shakh-blue)]/20 bg-[var(--shakh-blue)]/[0.04] p-4" aria-live="polite">
              <h2 className="text-lg font-black">پێداچوونەوە پێش بڵاوکردنەوە</h2>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3"><span className="text-black/45">ناوی کاڵا:</span><strong className="ms-1">{title || '—'}</strong></div>
                <div className="rounded-xl bg-white p-3"><span className="text-black/45">نرخی سەرەکی:</span><strong className="ms-1">{price ? Number(price.replace(/,/g, '')).toLocaleString('en-US') + ' د.ع' : '—'}</strong></div>
                {category === 'home_living' && homeLivingDetails.listing_kind ? <div className="rounded-xl border border-[var(--shakh-orange)]/20 bg-[var(--shakh-orange)]/[0.06] p-3 sm:col-span-2"><span className="text-black/45">کرێی پۆستکردن:</span><strong className="ms-1 text-[var(--shakh-orange)]">{homeLivingDetails.listing_kind === 'property' ? '٥,٠٠٠' : '٢,٠٠٠'} د.ع</strong></div> : null}
                <div className="rounded-xl bg-white p-3"><span className="text-black/45">شوێنی فرۆشیار:</span><strong className="ms-1">{location.trim() || 'دیاری نەکراوە'}</strong></div>
                <div className="rounded-xl bg-white p-3"><span className="text-black/45">وێنەکان:</span><strong className="ms-1">{images.length} وێنە · {images.reduce((sum, image) => sum + image.size, 0) > 0 ? (images.reduce((sum, image) => sum + image.size, 0) / 1024 / 1024).toFixed(2) + ' MB' : '—'}</strong></div>
                <div className="rounded-xl bg-white p-3 sm:col-span-2"><span className="text-black/45">وەسف:</span><p className="mt-1 whitespace-pre-wrap break-words leading-6">{content.trim() || 'وەسف دانەنراوە.'}</p></div>
                {category === 'fashion' ? (
                  <>
                    <div className="rounded-xl bg-white p-3"><span className="text-black/45">جۆری بەرهەم:</span><strong className="ms-1">{apparelTypes.find((item) => item.value === apparelType)?.label ?? apparelType}</strong></div>
                    <div className="rounded-xl bg-white p-3"><span className="text-black/45">براند:</span><strong className="ms-1">{brand.trim() || 'دیاری نەکراوە'}</strong></div>
                    <div className="rounded-xl bg-white p-3"><span className="text-black/45">ماددە / وڵات:</span><strong className="ms-1">{material.trim() || 'نەزانراوە'} · {countryOfOrigin.trim() || 'نەزانراوە'}</strong></div>
                    <div className="rounded-xl bg-white p-3"><span className="text-black/45">وەرز:</span><strong className="ms-1">{season === 'summer' ? 'هاوین' : season === 'winter' ? 'زستان' : 'هەموو وەرزەکان'}</strong></div>
                    <div className="rounded-xl bg-white p-3"><span className="text-black/45">دۆخ / بۆ کێیە:</span><strong className="ms-1">{itemCondition === 'new' ? 'نوێ' : 'بەکارهاتوو'} · {({men:'پیاوان',women:'ئافرەتان',kids:'منداڵان',all:'هەمووان'} as Record<ApparelAudience,string>)[apparelAudience]}</strong></div>
                    <div className="rounded-xl bg-white p-3"><span className="text-black/45">داشکاندن:</span><strong className="ms-1">{Number(discountPercent || 0)}٪</strong></div>
                    <div className="rounded-xl bg-white p-3 sm:col-span-2"><span className="text-black/45">ڕەنگەکان:</span><div className="mt-2 flex flex-wrap gap-2">{colors.map((color) => <span key={color.hex} className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1"><span className="size-4 rounded-full border border-black/10" style={{backgroundColor:color.hex}}/>{color.name}</span>)}</div></div>
                    <div className="rounded-xl bg-white p-3 sm:col-span-2"><span className="text-black/45">قەبارەکان:</span><div className="mt-2 flex flex-wrap gap-2">{sizes.map((size) => <span key={size} className="rounded-lg border border-black/10 px-3 py-1 font-black">{size}</span>)}</div></div>
                    <div className="rounded-xl bg-white p-3 sm:col-span-2"><span className="text-black/45">تێکەڵەی کۆگا و نرخ:</span><div className="mt-2 space-y-2">{combinations.filter((item) => variantDrafts[item.key]?.enabled).map((item) => {
                      const draft = variantDrafts[item.key] ?? { enabled: false, stock: '', price: '', imageIndex: '' };
                      const rowPrice = draft.price.trim() ? Number(draft.price.replace(/,/g, '')) : Number(price.replace(/,/g, ''));
                      const rowDiscount = Number(discountPercent || 0);
                      const finalPrice = Math.round(rowPrice * (100 - rowDiscount) / 100);
                      const imageIndex = draft.imageIndex === '' ? -1 : Number(draft.imageIndex);
                      return <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--shakh-bg)] p-3"><span className="flex items-center gap-2 font-bold"><span className="size-4 rounded-full border border-black/10" style={{backgroundColor:item.color.hex}}/>{item.color.name} / {item.size}</span><span className="text-xs text-black/55">{Number(draft.stock || 0)} دانە</span><span className="text-xs font-black">{Number.isFinite(finalPrice) && finalPrice > 0 ? finalPrice.toLocaleString('en-US') + ' د.ع دوای داشکاندن' : 'نرخ پێویستە'}</span><span className="text-[11px] text-black/40">{imageIndex >= 0 ? 'وێنەی ' + (imageIndex + 1) : 'وێنەی گشتی'}</span></div>;
                    })}</div></div>
                  </>
                ) : null}
                {category === 'electronics' ? (
                  <>
                    <div className="rounded-xl bg-white p-3"><span className="text-black/45">بڕاند:</span><strong className="ms-1">{brand.trim() || '—'}</strong></div>
                    {getVisibleCategoryDetails('electronics', electronicsDetails).map((detail) => (
                      <div key={detail.key} className="rounded-xl bg-white p-3"><span className="text-black/45">{detail.label}:</span><strong className="ms-1 break-words">{detail.value}</strong></div>
                    ))}
                    <div className="rounded-xl bg-white p-3"><span className="text-black/45">خەڵاتی شێرکردن:</span><strong className="ms-1">{Number(referralRewardIqd || 0).toLocaleString('en-US')} د.ع بۆ هەر فرۆشتنێکی تەواوبوو</strong></div>
                  </>
                ) : null}
                <div className="rounded-xl bg-white p-3 sm:col-span-2"><span className="text-black/45">وێنەکان بە ڕیز:</span><div className="mt-2 space-y-1">{images.map((image, index) => <div key={image.name + image.size + image.lastModified + index} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-bold">وێنەی {index + 1}: {image.name}</span><span className="text-black/40">{(image.size / 1024).toFixed(0)} KB{index === 0 ? ' · وێنەی سەرەکی' : ''}</span></div>)}</div></div>
              </div>
              <p className="text-xs leading-6 text-black/50">بڵاوکردنەوە داتاکە لە Supabase پاشەکەوت دەکات؛ کڕین و کۆگا لە database پشتڕاست دەکرێنەوە.</p>
              <button type="button" onClick={() => { setReviewing(false); setHomeLivingPaymentStep(false); }} className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-black">گەڕانەوە بۆ دەستکاری</button>
            </section>
          ) : null}

          {category === 'home_living' && reviewing && homeLivingPaymentStep ? (
            <section className="space-y-4 rounded-2xl border border-[var(--shakh-orange)]/20 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><WalletCards size={21} /></div>
                <div>
                  <h2 className="text-lg font-black">پارەدان بە مۆبایل و ناردنی وەسڵ</h2>
                  <p className="mt-1 text-sm leading-6 text-black/55">پارە لە ڕێگەی بانکی ئۆنلاینەوە نەنێرە. بە ئەپی فاستپەی، FIB یان ئاسیا حوالە بۆ هەژماری نیشاندراو پارە بنێرە، وەسڵەکە باربکە و داواکارییەکە بۆ سوپەر ئەدمین بنێرە.</p>
                </div>
              </div>
              <div className="rounded-xl bg-[var(--shakh-orange)]/[0.07] p-4">
                <div className="text-xs font-bold text-black/50">بڕی پێویستی ناردن</div>
                <div className="mt-1 text-2xl font-black text-[var(--shakh-orange)]">{(homeLivingDetails.listing_kind === 'property' ? 5000 : 2000).toLocaleString('en-US')} د.ع</div>
                <p className="mt-1 text-xs leading-5 text-black/45">پۆستەکە دوای پشکنینی وەسڵ و پەسەندکردنی سوپەر ئەدمین بڵاو دەکرێتەوە.</p>
              </div>
              {manualPaymentMethodsLoading ? <div className="rounded-xl bg-[var(--shakh-bg)] p-4 text-sm font-bold text-black/50">بارکردنی ژمارەکانی پارەدان...</div> : null}
              {manualPaymentMethodsError ? <div role="alert" className="rounded-xl border border-red-500/20 bg-red-50 p-3 text-sm font-bold text-red-700">{manualPaymentMethodsError}</div> : null}
              {!manualPaymentMethodsLoading && !manualPaymentMethods.length && !manualPaymentMethodsError ? <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-50 p-4 text-sm leading-6 text-amber-900">ژمارەکانی پارەدان ئامادە نین. سوپەر ئەدمین دەبێت لە داشبۆرد ژمارەی فاستپەی، FIB یان ئاسیا حوالە زیاد بکات.</div> : null}
              {manualPaymentMethods.length ? (
                <div className="space-y-3">
                  <div className="text-sm font-black">شێوازی پارەدان هەڵبژێرە</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {manualPaymentMethods.map((method) => (
                      <button key={method.id} type="button" aria-pressed={selectedManualPaymentMethodId === method.id} onClick={() => setSelectedManualPaymentMethodId(method.id)} className={`min-w-0 rounded-xl border p-4 text-start transition ${selectedManualPaymentMethodId === method.id ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/[0.06] ring-1 ring-[var(--shakh-orange)]/20' : 'border-black/10 bg-white hover:border-black/20'}`}>
                        <div className="flex items-center justify-between gap-2"><span className="font-black">{method.label_ku}</span><span className={`grid size-5 place-items-center rounded-full border text-xs ${selectedManualPaymentMethodId === method.id ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)] text-white' : 'border-black/20'}`}>{selectedManualPaymentMethodId === method.id ? '✓' : ''}</span></div>
                        <div className="mt-3 break-all rounded-lg bg-[var(--shakh-bg)] px-3 py-2.5 text-base font-black tracking-wide" dir="ltr">{method.account_identifier}</div>
                        {method.account_holder ? <div className="mt-2 text-xs leading-5 text-black/55">ناوی خاوەن هەژمار: <span className="font-black text-black/75">{method.account_holder}</span></div> : null}
                        {method.instructions_ku ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-black/50">{method.instructions_ku}</p> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <label htmlFor="home-living-payment-receipt" className="block text-sm font-black">وەسڵ یان سکرین‌شۆتی پارەدان *</label>
                <div className="rounded-xl border border-dashed border-black/20 bg-[var(--shakh-bg)] p-4">
                  <label htmlFor="home-living-payment-receipt" className="flex cursor-pointer items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--shakh-blue)]"><Upload size={19} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-black">{manualPaymentReceipt?.name ?? 'هەڵبژاردنی وەسڵ'}</div>
                      <div className="mt-1 text-xs leading-5 text-black/45">JPG، PNG، WebP یان PDF تا ٥ مێگابایت</div>
                    </div>
                    <input id="home-living-payment-receipt" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; if (file && (!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0)) { setError('وەسڵ دەبێت JPG، PNG، WebP یان PDF بێت و لە ٥ مێگابایت زیاتر نەبێت.'); setManualPaymentReceipt(null); event.currentTarget.value = ''; return; } setManualPaymentReceipt(file); setError(null); }} />
                  </label>
                </div>
              </div>
              <p className="text-xs leading-6 text-black/50">سوپەر ئەدمین وەسڵەکە دەبینێت و بڕی پارە پشتڕاست دەکاتەوە. تا پەسەندکردن، پۆستەکە لە بازاڕدا نیشان نادرێت.</p>
            </section>
          ) : null}
          <button className={primaryButtonClass} type="submit" disabled={busy}>
            {busy ? 'ناردن بۆ سوپەر ئەدمین...' : <><Send size={17} /> <span className="ms-2">{category === 'home_living' ? (!reviewing ? 'پێداچوونەوە' : homeLivingPaymentStep ? 'ناردن بۆ پشکنینی سوپەر ئەدمین' : 'چوون بۆ پارەدان') : reviewing ? 'پشتڕاستکردنەوە و بڵاوکردنەوە' : 'پێداچوونەوە پێش بڵاوکردنەوە'}</span></>}
          </button>
        </form>
      </AuthCard>
    </AuthPageShell>
  );
}
