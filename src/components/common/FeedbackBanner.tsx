import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface BannerProps {
  type?: 'error' | 'success' | 'info';
  message: string | null;
  onDismiss?: () => void;
}

export function FeedbackBanner({ type = 'error', message, onDismiss }: BannerProps) {
  if (!message) return null;
  const isError = type === 'error';
  const isInfo = type === 'info';
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
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-sky-600" />
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
          className="text-current opacity-70 hover:opacity-100 p-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
