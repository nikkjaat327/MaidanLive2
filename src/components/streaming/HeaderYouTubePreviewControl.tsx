import { useState } from 'react';
import type React from 'react';
import { Play, X, Youtube } from 'lucide-react';
import { extractYouTubeVideoId } from '../../utils/youtube.ts';
import { useBroadcastPreview } from '../../context/BroadcastPreviewContext.tsx';

interface HeaderYouTubePreviewControlProps {
  tone?: 'light' | 'dark';
  compact?: boolean;
  className?: string;
}

export function HeaderYouTubePreviewControl({
  tone = 'dark',
  compact = false,
  className = '',
}: HeaderYouTubePreviewControlProps) {
  const { youtubePreview, openYouTubePreview, setYouTubeInputDraft } = useBroadcastPreview();
  const [invalidFlash, setInvalidFlash] = useState(false);

  const value = youtubePreview.rawInput;

  const tryAutoOpen = (nextVal: string) => {
    setYouTubeInputDraft(nextVal);
    setInvalidFlash(false);
    const trimmed = nextVal.trim();
    if (!trimmed) return;
    const parsed = extractYouTubeVideoId(trimmed);
    if (parsed.valid && parsed.videoId) {
      openYouTubePreview(trimmed);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = openYouTubePreview(value);
    if (!res.valid) {
      setInvalidFlash(true);
      window.setTimeout(() => setInvalidFlash(false), 1600);
    }
  };

  const isDark = tone === 'dark';

  return (
    <form
      onSubmit={handleSubmit}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 transition-colors ${
        invalidFlash
          ? 'border-red-500 ring-1 ring-red-500/40'
          : isDark
            ? 'border-slate-700/90 bg-slate-900/90 focus-within:border-red-500/70'
            : 'border-slate-300 bg-slate-50/90 focus-within:border-[#EA580C]'
      } ${compact ? 'h-[34px] max-w-[190px] sm:max-w-[230px]' : 'h-[36px] max-w-[210px] sm:max-w-[250px]'} ${className}`}
      title="Paste any YouTube live or video link to open a floating resizable preview"
    >
      <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => tryAutoOpen(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData?.getData('text');
          if (pasted) {
            const parsed = extractYouTubeVideoId(pasted);
            if (parsed.valid && parsed.videoId) {
              e.preventDefault();
              openYouTubePreview(pasted);
            }
          }
        }}
        placeholder="YouTube preview link..."
        aria-label="YouTube embed preview link"
        className={`w-full min-w-[90px] bg-transparent text-[11px] font-medium outline-none ${
          isDark
            ? 'text-slate-100 placeholder:text-slate-500'
            : 'text-slate-800 placeholder:text-slate-400'
        }`}
      />
      {value.trim() && (
        <button
          type="button"
          onClick={() => setYouTubeInputDraft('')}
          aria-label="Clear YouTube link"
          className={`p-0.5 rounded transition-colors shrink-0 ${
            isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
      <button
        type="submit"
        aria-label="Open floating YouTube preview"
        title="Preview YouTube Live"
        className="px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold inline-flex items-center gap-0.5 shrink-0"
      >
        <Play className="w-2.5 h-2.5 fill-current" />
        <span className="hidden md:inline">Live</span>
      </button>
    </form>
  );
}
