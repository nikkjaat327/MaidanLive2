import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const { t } = useLanguage();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="safe-px flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>{t('pwa.offline')}</span>
    </div>
  );
}
