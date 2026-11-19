import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';

interface YouTubePlayerProps {
  videoId: string;
  title?: string;
  autoplay?: boolean;
  bare?: boolean;
  startSeconds?: number | null;
  jumpKey?: number;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Isolated memoized YouTube Live/Replay player.
 * Re-renders ONLY when videoId, title, autoplay, bare, startSeconds, or jumpKey changes —
 * score updates NEVER reload, interrupt, or restart the video stream.
 */
export const YouTubePlayer = React.memo(
  function YouTubePlayer({
    videoId,
    title = 'MaidanLive YouTube Stream',
    autoplay = false,
    bare = false,
    startSeconds = null,
    jumpKey = 0,
  }: YouTubePlayerProps) {
    const [loaded, setLoaded] = useState(false);

    if (!videoId || !VALID_ID_REGEX.test(videoId)) {
      return (
        <div
          className={`aspect-video w-full bg-slate-900 flex flex-col items-center justify-center text-center p-6 ${
            bare ? 'h-full' : 'rounded-xl border border-slate-800'
          }`}
        >
          <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
          <p className="text-sm font-medium text-white">Video stream unavailable</p>
          <p className="text-xs text-slate-400 mt-1">
            A valid 11-character YouTube Video ID is required to render the player.
          </p>
        </div>
      );
    }

    const startParam =
      typeof startSeconds === 'number' && Number.isFinite(startSeconds) && startSeconds >= 0
        ? `&start=${Math.floor(startSeconds)}`
        : '';
    const shouldAutoplay = autoplay || startParam !== '';
    const embedSrc = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1${
      shouldAutoplay ? '&autoplay=1' : ''
    }${startParam}`;
    const iframeKey = `${videoId}-${startSeconds ?? 'live'}-${jumpKey}`;

    if (bare) {
      return (
        <>
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-300 z-0">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mb-2" />
              <span className="text-xs font-medium">Loading YouTube stream...</span>
            </div>
          )}
          <iframe
            key={iframeKey}
            src={embedSrc}
            title={title}
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 w-full h-full border-0 z-10"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </>
      );
    }

    return (
      <div className="w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
        <div className="relative aspect-video w-full">
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-300 z-0">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mb-2" />
              <span className="text-xs font-medium">Loading YouTube stream...</span>
            </div>
          )}
          <iframe
            key={iframeKey}
            src={embedSrc}
            title={title}
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 w-full h-full border-0 z-10"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 text-xs text-slate-300 border-t border-slate-800">
          <span className="truncate">
            If third-party embedding is restricted or video buffers slowly, lower resolution in player settings or open on YouTube.
          </span>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-white hover:text-emerald-400 font-medium whitespace-nowrap shrink-0"
          >
            <span>Open YouTube</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.videoId === next.videoId &&
    prev.title === next.title &&
    prev.autoplay === next.autoplay &&
    prev.bare === next.bare &&
    prev.startSeconds === next.startSeconds &&
    prev.jumpKey === next.jumpKey
);
