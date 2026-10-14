import { useEffect, useState } from 'react';
import { Download, RefreshCw, Share, Smartphone, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || navigatorWithStandalone.standalone === true;
}

/**
 * Owns PWA install UX, update prompts, and periodic update checks.
 * App data remains online/Supabase-backed; offline support is limited to the cached app shell.
 */
export function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(isStandaloneMode);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swUrl, nextRegistration) => {
      if (nextRegistration) setRegistration(nextRegistration);
    },
    onRegisterError: (error) => {
      // A registration issue must not prevent the main application from being used.
      console.error('SHAKH service worker registration failed:', error);
    },
  });

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallHelpOpen(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => setIsInstalled(isStandaloneMode());
    standaloneMedia.addEventListener('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      standaloneMedia.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  useEffect(() => {
    if (!registration) return undefined;

    // Check for new builds periodically and when connectivity returns.
    // The UI asks the user before activating a waiting update.
    const checkForUpdate = () => {
      if (navigator.onLine) void registration.update().catch(() => undefined);
    };
    const intervalId = window.setInterval(checkForUpdate, 15 * 60 * 1000);
    window.addEventListener('online', checkForUpdate);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', checkForUpdate);
    };
  }, [registration]);

  const installApplication = async () => {
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }

    const promptEvent = installPrompt;
    setInstallPrompt(null);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') setIsInstalled(true);
    } catch {
      // Browsers can reject installation if the prompt is no longer available.
      setInstallHelpOpen(true);
    }
  };

  const isIOS = typeof navigator !== 'undefined'
    && (/iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  return (
    <>
      {!isInstalled ? (
        <button
          type="button"
          onClick={() => void installApplication()}
          className="fixed bottom-4 start-4 z-[60] inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-900/15 transition hover:-translate-y-0.5 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shakh-orange)]"
          aria-haspopup="dialog"
        >
          <Download size={18} aria-hidden="true" />
          <span>دامەزراندنی ئەپ</span>
        </button>
      ) : null}

      {needRefresh ? (
        <section
          role="status"
          aria-live="polite"
          dir="rtl"
          className="fixed inset-x-4 bottom-20 z-[70] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl sm:inset-x-auto sm:end-4 sm:bottom-4"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <RefreshCw size={19} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black text-[var(--shakh-ink)]">وەشانی نوێی شاخ ئامادەیە</p>
            <p className="mt-1 text-xs leading-5 text-black/55">نوێ بکەرەوە بۆ بەکارهێنانی دوا گۆڕانکارییەکان.</p>
          </div>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 text-sm font-black text-white hover:opacity-90"
          >
            <RefreshCw size={15} aria-hidden="true" />
            نوێکردنەوە
          </button>
          <button type="button" onClick={() => setNeedRefresh(false)} className="grid size-9 place-items-center rounded-xl text-black/50 hover:bg-black/5" aria-label="داخستن">
            <X size={18} />
          </button>
        </section>
      ) : offlineReady ? (
        <section
          role="status"
          aria-live="polite"
          dir="rtl"
          className="fixed inset-x-4 bottom-20 z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl sm:inset-x-auto sm:end-4 sm:bottom-4"
        >
          <div className="min-w-0 flex-1">
            <p className="font-black text-[var(--shakh-ink)]">بەشی سەرەکیی ئەپ ئامادەیە</p>
            <p className="mt-1 text-xs leading-5 text-black/55">هەندێک بەشی پێشوو لە کاتی نەبوونی ئینتەرنێت دەکرێت بکڕێنەوە؛ داواکاری و زانیارییەکان هێشتا پێویستیان بە پەیوەندیی ئینتەرنێت هەیە.</p>
          </div>
          <button type="button" onClick={() => setOfflineReady(false)} className="grid size-9 shrink-0 place-items-center rounded-xl text-black/50 hover:bg-black/5" aria-label="داخستن">
            <X size={18} />
          </button>
        </section>
      ) : null}

      {installHelpOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => setInstallHelpOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            dir="rtl"
            className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-orange-50 text-[var(--shakh-orange)]">
                <Smartphone size={23} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="pwa-install-title" className="text-lg font-black text-[var(--shakh-ink)]">دامەزراندنی SHAKH</h2>
                <p className="mt-1 text-sm leading-6 text-black/55">ئەپەکە زیاد بکە بۆ شاشەی سەرەکی بۆ دەستگەیشتنی خێراتر و کردنەوەی وەک ئەپ.</p>
              </div>
              <button type="button" onClick={() => setInstallHelpOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-xl text-black/45 hover:bg-black/5" aria-label="داخستن">
                <X size={18} />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-5 space-y-3 text-sm leading-6 text-black/70">
                <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 font-black">١</span><span>لە Safari، دوگمەی Share ـی خوارەوە یان سەرەوە بکەوە.</span></li>
                <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 font-black">٢</span><span>هەڵبژاردەی <strong dir="ltr">Add to Home Screen</strong> هەڵبژێرە.</span></li>
                <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 font-black">٣</span><span>بە <strong>Add</strong> پشتڕاستی بکەرەوە.</span></li>
              </ol>
            ) : (
              <div className="mt-5 space-y-3 text-sm leading-6 text-black/70">
                {installPrompt ? (
                  <p>لەو دوگمەیەی خوارەوە بەکاربهێنە بۆ دامەزراندنی ڕاستەوخۆ.</p>
                ) : (
                  <p>لە Chrome یان Edge، مینۆی سێ خاڵ بکەوە و <strong dir="ltr">Install app</strong> یان <strong dir="ltr">Add to Home screen</strong> هەڵبژێرە. ئەگەر هەڵبژاردەکە نەبوو، وێبسایتەکە لە وێبگەڕێکی پشتگیریکراو بکەرەوە.</p>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {installPrompt ? (
                <button
                  type="button"
                  onClick={() => { setInstallHelpOpen(false); void installApplication(); }}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white hover:brightness-95"
                >
                  <Download size={17} />
                  دامەزراندن
                </button>
              ) : isIOS ? (
                <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
                  <Share size={17} />
                  Share ← Add to Home Screen
                </span>
              ) : null}
              <button type="button" onClick={() => setInstallHelpOpen(false)} className="min-h-11 rounded-xl border border-black/10 px-4 py-3 text-sm font-bold text-black/65 hover:bg-black/5">باشە</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
