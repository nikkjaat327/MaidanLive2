import React, { useState } from 'react';
import { Award, Check, Copy, Share2 } from 'lucide-react';
import { ShareCardModal, ShareCardPayload } from './ShareCardModal.tsx';

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  compact?: boolean;
  variant?: 'default' | 'card-icon';
  shareCard?: ShareCardPayload;
}

export function ShareButton({
  title,
  text,
  url,
  compact = false,
  variant = 'default',
  shareCard,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);

  const shareUrl =
    url || (typeof window !== 'undefined' ? window.location.href : 'https://maidanlive.app');
  const shareText = text ? `${title} — ${text}` : title;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;

  async function handleNativeShare(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
        return;
      } catch {
        // Fallback to copy if cancelled or unsupported
      }
    }
    await handleCopy();
  }

  async function handleCopy(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  }

  function handleOpenCard(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (shareCard) {
      setCardModalOpen(true);
    } else {
      void handleNativeShare(e);
    }
  }

  return (
    <>
      {variant === 'card-icon' ? (
        <button
          type="button"
          onClick={handleOpenCard}
          aria-label={`Share ${title}`}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-white text-[11px] font-semibold transition-colors shadow-sm whitespace-nowrap"
        >
          {shareCard ? (
            <Award className="w-3 h-3 text-orange-400" />
          ) : (
            <Share2 className="w-3 h-3 text-orange-400" />
          )}
          <span>Share</span>
        </button>
      ) : (
        <div
          className="inline-flex flex-wrap items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {shareCard && (
            <button
              type="button"
              onClick={handleOpenCard}
              className={`${
                compact ? 'min-h-[34px] px-2.5 py-1 text-xs' : 'min-h-[36px] px-3 py-1.5 text-xs'
              } inline-flex items-center gap-1.5 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap`}
            >
              <Award className="w-3.5 h-3.5 text-orange-400" />
              <span>Share Card</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => void handleNativeShare(e)}
            className={`${
              compact ? 'min-h-[34px] px-2.5 py-1 text-xs' : 'min-h-[36px] px-3 py-1.5 text-xs'
            } inline-flex items-center gap-1.5 font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`${
              compact ? 'min-h-[34px] px-2.5 py-1 text-xs' : 'min-h-[36px] px-3 py-1.5 text-xs'
            } inline-flex items-center gap-1.5 font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap`}
          >
            <span>WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={(e) => void handleCopy(e)}
            aria-label="Copy link"
            className={`${
              compact ? 'min-h-[34px] px-2 py-1 text-xs' : 'min-h-[36px] px-2.5 py-1.5 text-xs'
            } inline-flex items-center gap-1 font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap`}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      )}

      {shareCard && (
        <ShareCardModal
          open={cardModalOpen}
          onClose={() => setCardModalOpen(false)}
          card={{ ...shareCard, shareUrl }}
        />
      )}
    </>
  );
}
