import { FileText, Send, Tag, MapPin, BadgeDollarSign } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import type { AppRole } from '@/lib/permissions/AuthorizationContext';
import { createPost, getAllowedPostTargets } from '../api';
import { postCategoryLabels, postRoleLabels } from '../labels';
import type { PostTarget } from '../types';

export function CreatePostPage() {
  const navigate = useNavigate();
  const [targets, setTargets] = useState<PostTarget[]>([]);
  const [role, setRole] = useState<AppRole | ''>('');
  const [category, setCategory] = useState<PostTarget['category'] | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextTargets = await getAllowedPostTargets();
      setTargets(nextTargets);
      if (nextTargets[0]) {
        setRole(nextTargets[0].publisher_role);
        setCategory(nextTargets[0].category);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا دەسەڵاتەکانی پۆستکردن بخوێندرێنەوە.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const roles = useMemo(
    () => [...new Set(targets.map((item) => item.publisher_role))],
    [targets],
  );

  const categories = useMemo(
    () => targets.filter((item) => item.publisher_role === role).map((item) => item.category),
    [role, targets],
  );

  useEffect(() => {
    if (category && categories.includes(category)) return;
    setCategory(categories[0] ?? '');
  }, [categories, category]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !role || !category) return;
    setError(null);
    if (title.trim().length < 3) return setError('ناونیشانی پۆست دەبێت لانیکەم 3 پیت بێت.');
    if (content.trim().length > 12000) return setError('ناوەڕۆک زۆر درێژە.');

    const numericPrice = price.trim() ? Number(price.replace(/,/g, '')) : null;
    if (numericPrice !== null && (!Number.isFinite(numericPrice) || numericPrice < 0)) {
      return setError('نرخی پۆست دروست نییە.');
    }

    setBusy(true);
    try {
      await createPost({
        publisherRole: role,
        category,
        title,
        content,
        priceIqd: numericPrice,
        location,
      });
      setSuccess(true);
      setTimeout(() => navigate('/posts', { replace: true }), 500);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پۆستکردن سەرکەوتوو نەبوو.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <AuthPageShell><div className="mx-auto max-w-xl text-center text-sm font-bold text-black/50">پشکنینی دەسەڵاتی پۆستکردن...</div></AuthPageShell>;
  }

  if (!targets.length) {
    return <AuthPageShell><AuthCard title="پۆستکردن بەردەست نییە" description="ئەم هەژمارە هیچ Role ـێکی ڕێگەپێدراو بۆ پۆستکردنی نییە."><AuthFeedback error="هیچ category ـێکت بۆ پۆستکردن نییە." /></AuthCard></AuthPageShell>;
  }

  return (
    <AuthPageShell>
      <AuthCard title="پۆستکردنی نوێ" description="Role و category ـەکە هەڵبژێرە؛ database ـەکەش هەمان دەسەڵاتەکە enforce دەکات.">
        <form className="space-y-5" onSubmit={submit} noValidate>
          <AuthFeedback error={error} />
          {success ? <AuthSuccess>پۆستەکە بە سەرکەوتوویی بڵاوکرایەوە.</AuthSuccess> : null}

          {roles.length > 1 ? (
            <Field label="پۆست لە ناوی Role">
              <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
                {roles.map((item) => <option key={item} value={item}>{postRoleLabels[item]}</option>)}
              </select>
            </Field>
          ) : (
            <div className="rounded-2xl bg-[var(--shakh-bg)] p-4">
              <div className="text-xs font-bold text-black/40">Role</div>
              <div className="mt-1 font-black">{postRoleLabels[roles[0]]}</div>
            </div>
          )}

          <Field label="جۆری پۆست">
            <div className="relative">
              <Tag className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/35" size={17} />
              <select className={inputClass + ' ps-11'} value={category} onChange={(event) => setCategory(event.target.value as PostTarget['category'])}>
                {categories.map((item) => <option key={item} value={item}>{postCategoryLabels[item]}{item === 'cars' ? ' — ئۆتۆمبێل' : ''}</option>)}
              </select>
            </div>
          </Field>

          <Field label="ناونیشان">
            <div className="relative">
              <FileText className="pointer-events-none absolute start-4 top-4 text-black/30" size={17} />
              <input className={inputClass + ' ps-11'} required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="ناونیشانی پۆست" />
            </div>
          </Field>

          <Field label="ناوەڕۆک">
            <textarea className={inputClass + ' min-h-40 resize-y'} value={content} onChange={(event) => setContent(event.target.value)} maxLength={12000} placeholder="زانیارییەکانی پۆست..." />
          </Field>

          <Field label="نرخ (IQD)" hint="ئەم خانەیە بۆ پۆستە بازرگانییەکانە؛ دەتوانێت بەتاڵ بێت.">
            <div className="relative">
              <BadgeDollarSign className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/30" size={17} />
              <input className={inputClass + ' ps-11'} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" dir="ltr" />
            </div>
          </Field>

          <Field label="شوێن">
            <div className="relative">
              <MapPin className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/30" size={17} />
              <input className={inputClass + ' ps-11'} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="هەولێر" />
            </div>
          </Field>

          <button className={primaryButtonClass} type="submit" disabled={busy}>
            {busy ? 'بڵاوکردنەوە...' : <><Send size={17} /> <span className="ms-2">بڵاوکردنەوەی پۆست</span></>}
          </button>
        </form>
      </AuthCard>
    </AuthPageShell>
  );
}
