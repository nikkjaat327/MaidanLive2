import React, { useState } from 'react';
import { Download, CheckCircle2, Share } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';

interface PWAInstallButtonProps {
  className?: string;
  compact?: boolean;
}

export function PWAInstallButton({ className = '', compact = false }: PWAInstallButtonProps) {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const { t } = useLanguage();
  const [showIosTip, setShowIosTip] = useState(false);

  if (isInstalled) {
    if (compact) return null;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 ${className}`}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        App Installed
      </span>
    );
  }

  if (!canInstall) return null;

  const handleClick = async () => {
    const res = await promptInstall();
    if (res === 'ios-guide') {
      setShowIosTip((v) => !v);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#EA580C] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 ${className}`}
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>{t('pwa.install')}</span>
      </button>

      {showIosTip && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-900">
            <Share className="h-3.5 w-3.5 text-[#EA580C]" />
            Install on iPhone / iPad
          </div>
          <p className="leading-relaxed">
            Tap the <span className="font-semibold">Share</span> button in Safari, then choose{' '}
            <span className="font-semibold">Add to Home Screen</span>.
          </p>
        </div>
      )}
    </div>
  );
}
