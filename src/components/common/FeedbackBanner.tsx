import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

interface BannerProps {
  type?: 'error' | 'success' | 'info';
  message: string | null;
  onDismiss?: () => void;
  inline?: boolean;
}

const TOAST_CONTAINER_ID = 'maidanlive-floating-toast-root';

function getOrCreateToastRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(TOAST_CONTAINER_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = TOAST_CONTAINER_ID;
    root.className =
      'fixed top-4 right-4 z-[140] flex flex-col gap-2.5 w-[min(420px,calc(100vw-2rem))] pointer-events-none';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }
  return root;
}

export function FeedbackBanner({
  type = 'error',
  message,
  onDismiss,
  inline = false,
}: BannerProps) {
  const [toastRoot, setToastRoot] = useState<HTMLElement | null>(() =>
    inline ? null : getOrCreateToastRoot()
  );

  useEffect(() => {
    if (inline) return;
    setToastRoot(getOrCreateToastRoot());
  }, [inline, message]);

  if (!message) return null;

  const isError = type === 'error';
  const isInfo = type === 'info';

  if (inline || !toastRoot) {
    return (
      <div
        role="alert"
        className={`flex items-start justify-between gap-3 px-4 py-3 rounded-lg border text-sm ${
          isError
            ? 'bg-red-50 border-red-200 text-red-800'
            : isInfo
              ? 'bg-sky-50 border-sky-200 text-sky-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {isError ? (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
          ) : isInfo ? (
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-sky-600" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
          )}
          <span>{message}</span>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss message"
            className="text-current opacity-70 hover:opacity-100 p-0.5 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return createPortal(
    <div
      role="alert"
      style={{ animation: 'mlGfxSlideRight 220ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      className={`pointer-events-auto flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-xs sm:text-sm font-medium shadow-2xl backdrop-blur-md ${
        isError
          ? 'bg-red-950/95 border-red-500/60 text-red-50'
          : isInfo
            ? 'bg-slate-950/95 border-sky-500/60 text-sky-50'
            : 'bg-slate-950/95 border-emerald-500/60 text-emerald-50'
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {isError ? (
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
        ) : isInfo ? (
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-sky-400" />
        ) : (
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
        )}
        <span className="leading-snug break-words">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="text-current opacity-75 hover:opacity-100 p-0.5 shrink-0 rounded hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>,
    toastRoot
  );
}
