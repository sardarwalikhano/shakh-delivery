import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { createPostShareLink } from '../shareRewards';
import type { Post } from '../types';

export function SharePostButton({ post }: { post: Post }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const share = async () => {
    if (!user) {
      navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const linkId = await createPostShareLink(post.id);
      const url = new URL('/posts/' + post.id, window.location.origin);
      url.searchParams.set('via', linkId);
      const urlText = url.toString();
      setShareUrl(urlText);

      if (navigator.share) {
        try {
          await navigator.share({
            title: post.title,
            text: Number(post.share_reward_iqd ?? 0) > 0
              ? 'SHAKH ـەوە ئەم پۆستە ببینە؛ بۆ کڕینی سەرکەوتوو خەڵات هەیە.'
              : post.title,
            url: urlText,
          });
          setMessage('لینکی تایبەتت بۆ شێرکردن ئامادەیە.');
          return;
        } catch (shareError) {
          if (shareError instanceof Error && shareError.name === 'AbortError') {
            setMessage('لینکی تایبەت دروست کرا؛ دەتوانیت لە خوارەوە کۆپیی بکەیت.');
            return;
          }
        }
      }

      try {
        await navigator.clipboard.writeText(urlText);
        setMessage('لینکی تایبەت کۆپی کرا؛ بڵاوی بکەرەوە بۆ وەرگرتنی خەڵات.');
      } catch {
        setMessage('لینکی تایبەت ئامادەیە؛ لە خانەکەی خوارەوە کۆپیی بکە.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'دروستکردنی لینکی شێرکردن سەرکەوتوو نەبوو.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage('لینک کۆپی کرا.');
    } catch {
      setMessage('لینکەکە دیارە؛ دەقی خانەکە هەڵبژێرە و کۆپیی بکە.');
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--shakh-orange)]/20 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]">
          <Share2 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black">شێر بکە و خەڵات وەربگرە</p>
          <p className="mt-1 text-xs leading-5 text-black/50">
            {Number(post.share_reward_iqd ?? 0) > 0
              ? 'بۆ هەر کڕینێکی تەواوکراو لە ڕێگەی لینکە تایبەتەکەتەوە ' + Number(post.share_reward_iqd).toLocaleString('en-US') + ' د.ع وەردەگریت.'
              : 'ئەم پۆستە خەڵاتی شێرکردنی بۆ دانەنراوە؛ هێشتا دەتوانیت لینکەکەی شێر بکەیت.'}
          </p>
        </div>
        <button type="button" onClick={() => void share()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
          <Share2 size={16} />
          {busy ? 'ئامادەکردنی لینک...' : 'شێرکردن'}
        </button>
      </div>
      {shareUrl ? (
        <div className="mt-3 flex gap-2">
          <input readOnly value={shareUrl} dir="ltr" onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-xl border border-black/10 bg-[var(--shakh-bg)] px-3 py-2 text-xs" aria-label="لینکی تایبەتی شێرکردن" />
          <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-black"><Copy size={15} /> کۆپی</button>
        </div>
      ) : null}
      {message ? <p role="status" aria-live="polite" className="mt-3 flex items-start gap-2 text-xs font-bold leading-5 text-[var(--shakh-blue)]"><Check size={15} className="mt-0.5 shrink-0" />{message}</p> : null}
    </div>
  );
}
