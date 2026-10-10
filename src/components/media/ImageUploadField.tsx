import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowDown, ArrowUp, Camera, ImagePlus, Star, X } from 'lucide-react';

export type ExistingUploadImage = {
  id: string;
  url: string;
  label?: string | null;
};

type ImageUploadFieldProps = {
  files: File[];
  onChange: (files: File[]) => void;
  onReorder?: (from: number, to: number) => void;
  existingImages?: ExistingUploadImage[];
  label?: string;
  hint?: string;
  maxFiles?: number;
  disabled?: boolean;
  required?: boolean;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validateSelectedImage(file: File): void {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('تەنها وێنەی JPG، PNG یان WebP ڕێگەپێدراوە.');
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error('قەبارەی هەر وێنەیەک دەبێت لە ٥MB زیاتر نەبێت و فایلەکە بەتاڵ نەبێت.');
  }
}

export function ImageUploadField({
  files,
  onChange,
  onReorder,
  existingImages = [],
  label = 'وێنەکانی بەرهەم',
  hint = 'JPG، PNG یان WebP؛ هەر وێنەیەک تا ٥MB.',
  maxFiles = 8,
  disabled = false,
  required = false,
}: ImageUploadFieldProps) {
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => () => {
    previews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [previews]);

  const totalCount = existingImages.length + files.length;
  const remaining = Math.max(0, maxFiles - totalCount);

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = Array.from(input.files ?? []);
    input.value = '';
    if (!selected.length) return;

    try {
      if (totalCount + selected.length > maxFiles) {
        throw new Error(`زۆرترین ژمارەی وێنە ${maxFiles} دانەیە.`);
      }
      selected.forEach(validateSelectedImage);
      onChange([...files, ...selected]);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'هەڵبژاردنی وێنە سەرکەوتوو نەبوو.');
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= files.length || from === to) return;
    const next = [...files];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    onChange(next);
    onReorder?.(from, to);
    setError(null);
  };

  const remove = (index: number) => {
    onChange(files.filter((_, itemIndex) => itemIndex !== index));
    setError(null);
  };

  return (
    <section className="space-y-3 rounded-3xl border border-dashed border-black/15 bg-white p-4 sm:p-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><ImagePlus size={19} /></span>
          <div>
            <h3 className="font-black">{label}{required ? ' *' : ''}</h3>
            <p className="mt-1 text-xs leading-6 text-black/45">{hint}</p>
          </div>
        </div>
        <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black text-black/55">{totalCount}/{maxFiles}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
        <div className="flex min-w-0 gap-2">
          <label className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-3 py-3 text-sm font-black text-white transition hover:opacity-90">
            <Camera size={17} />
            وێنەگرتن بە کامێرا
            <input
              ref={cameraInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture={cameraFacing}
              onChange={addFiles}
              className="sr-only"
              disabled={disabled || remaining === 0}
            />
          </label>
          <select
            aria-label="جۆری کامێرا"
            value={cameraFacing}
            onChange={(event) => setCameraFacing(event.target.value as 'environment' | 'user')}
            className="max-w-28 rounded-xl border border-black/10 bg-white px-2 text-xs font-bold"
            disabled={disabled}
          >
            <option value="environment">کامێرای پشتەوە</option>
            <option value="user">کامێرای پێشەوە</option>
          </select>
        </div>

        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 py-3 text-sm font-black text-black/70 transition hover:border-[var(--shakh-orange)]">
          <ImagePlus size={17} />
          هەڵبژاردن لە گەلەری / فایلەکان
          <input
            ref={galleryInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={addFiles}
            className="sr-only"
            disabled={disabled || remaining === 0}
          />
        </label>
      </div>

      {existingImages.length ? (
        <div>
          <div className="mb-2 text-xs font-black text-black/45">وێنە پاشەکەوتکراوەکان</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {existingImages.map((image, index) => (
              <div key={image.id} className="relative overflow-hidden rounded-2xl border border-black/10 bg-[var(--shakh-bg)]">
                <img src={image.url} alt={image.label || `وێنەی پێشوو ${index + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
                {index === 0 ? <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--shakh-navy)] px-2 py-1 text-[10px] font-black text-white"><Star size={11} fill="currentColor" /> سەرەکی</span> : null}
                <div className="truncate px-2 py-2 text-[10px] font-bold text-black/55">{image.label || `وێنەی ${index + 1}`}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {previews.length ? (
        <div>
          <div className="mb-2 text-xs font-black text-black/45">پێشبینین و ڕێکخستنی وێنە نوێیەکان</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {previews.map((item, index) => (
              <article key={`${item.file.name}-${item.file.size}-${item.file.lastModified}-${index}`} className="relative overflow-hidden rounded-2xl border border-black/10 bg-white">
                <img src={item.url} alt={item.file.name} className="aspect-square w-full object-cover" />
                {!existingImages.length && index === 0 ? <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--shakh-orange)] px-2 py-1 text-[10px] font-black text-white"><Star size={11} fill="currentColor" /> وێنەی سەرەکی</span> : null}
                <div className="truncate px-2 pt-2 text-[10px] font-bold text-black/55">{item.file.name}</div>
                <div className="flex items-center justify-between gap-1 px-2 pb-2 pt-1">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(index, index - 1)} disabled={disabled || index === 0} className="grid size-8 place-items-center rounded-lg border border-black/10 disabled:opacity-25" aria-label="بەرزکردنەوەی ڕیزی وێنە"><ArrowUp size={14} /></button>
                    <button type="button" onClick={() => move(index, index + 1)} disabled={disabled || index === files.length - 1} className="grid size-8 place-items-center rounded-lg border border-black/10 disabled:opacity-25" aria-label="نزمکردنەوەی ڕیزی وێنە"><ArrowDown size={14} /></button>
                  </div>
                  <button type="button" onClick={() => remove(index)} disabled={disabled} className="grid size-8 place-items-center rounded-lg bg-red-50 text-red-600 disabled:opacity-40" aria-label="سڕینەوەی وێنە"><X size={15} /></button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : !existingImages.length ? (
        <div className="rounded-2xl bg-[var(--shakh-bg)] p-5 text-center text-sm font-bold text-black/35">هێشتا هیچ وێنەیەک هەڵنەبژێردراوە.</div>
      ) : null}

      {remaining === 0 ? <p className="text-xs font-bold text-amber-700">ژمارەی زۆرترین وێنە تەواو بووە.</p> : null}
      {required && totalCount === 0 ? <p className="text-xs font-bold text-amber-700">لانیکەم یەک وێنە پێویستە.</p> : null}
      {error ? <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold leading-6 text-red-700">{error}</div> : null}

      <p className="text-[11px] leading-5 text-black/35">وێنەکان لە هەنگاوی پاشەکەوتکردندا بۆ Supabase Storage دەنێردرێن؛ تەنها پێشبینین لە وێبگەڕەکەتە.</p>
    </section>
  );
}
