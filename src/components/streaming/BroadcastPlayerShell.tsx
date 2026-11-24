import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  LiveScoreData,
  LiveStreamData,
  ScoreboardPosition,
  SponsorOverlayData,
} from '../../types/index.ts';
import { YouTubePlayer } from './YouTubePlayer.tsx';
import { BroadcastScoreboardOverlay } from '../scoreboard/broadcast/BroadcastScoreboardOverlay.tsx';
import { StartingSoonGraphic } from './StartingSoonGraphic.tsx';
import { SponsorOverlayBanner } from './SponsorOverlayBanner.tsx';

interface BroadcastPlayerShellProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  videoId: string;
  title: string;
  autoplay?: boolean;
  startSeconds?: number | null;
  jumpKey?: number;
  sponsorOverlays?: SponsorOverlayData[];
}

function canUseElementFullscreen(el: HTMLElement | null): boolean {
  if (!el) return false;
  const doc = document as Document & {
    webkitFullscreenEnabled?: boolean;
  };
  const node = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const enabled =
    typeof document.fullscreenEnabled === 'boolean'
      ? document.fullscreenEnabled
      : Boolean(doc.webkitFullscreenEnabled);
  return (
    enabled &&
    (typeof el.requestFullscreen === 'function' || typeof node.webkitRequestFullscreen === 'function')
  );
}

export function BroadcastPlayerShell({
  stream,
  score,
  videoId,
  title,
  autoplay = false,
  startSeconds = null,
  jumpKey = 0,
  sponsorOverlays = [],
}: BroadcastPlayerShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const storageKey = `maidanlive_sb_vis_${stream.id || stream._id || videoId}`;

  const [scoreboardVisible, setScoreboardVisible] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    } catch {
      // Ignore storage access errors in restricted iframes
    }
    return stream.scoreboardVisibleByDefault ?? true;
  });

  const [showUpcomingVideoPreview, setShowUpcomingVideoPreview] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isExpandedFallback, setIsExpandedFallback] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'true') {
        setScoreboardVisible(true);
      } else if (saved === 'false') {
        setScoreboardVisible(false);
      } else {
        setScoreboardVisible(stream.scoreboardVisibleByDefault ?? true);
      }
    } catch {
      setScoreboardVisible(stream.scoreboardVisibleByDefault ?? true);
    }
  }, [storageKey, stream.scoreboardVisibleByDefault]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const fsEl = document.fullscreenElement || doc.webkitFullscreenElement || null;
      setIsNativeFullscreen(Boolean(fsEl && fsEl === containerRef.current));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!isExpandedFallback) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpandedFallback(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpandedFallback]);

  const toggleScoreboard = useCallback(() => {
    setScoreboardVisible((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(storageKey, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, [storageKey]);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    if (isNativeFullscreen || doc.fullscreenElement || doc.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      } catch {
        setIsNativeFullscreen(false);
      }
      return;
    }

    if (isExpandedFallback) {
      setIsExpandedFallback(false);
      return;
    }

    const el = containerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;

    if (canUseElementFullscreen(el) && el) {
      try {
        setFallbackNotice(null);
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
        return;
      } catch {
        // Fall back to Expanded Theater View
      }
    }

    setIsExpandedFallback(true);
    setFallbackNotice(
      'Expanded Broadcast View active (native container fullscreen is unavailable in this browser; overlays cannot appear inside iOS native player fullscreen).'
    );
  }, [isNativeFullscreen, isExpandedFallback]);

  const activeExpanded = isNativeFullscreen || isExpandedFallback;
  const position: ScoreboardPosition = stream.scoreboardPosition || 'BOTTOM';

  const getScoreboardAnchorClass = () => {
    switch (position) {
      case 'BOTTOM':
        // Sits cleanly centered above YouTube's bottom player control bar
        return 'bottom-12 left-2 right-2 sm:left-3 sm:right-3 flex justify-center';
      case 'LEFT':
        return 'top-12 left-2 sm:left-3 max-w-[85%] sm:max-w-[65%]';
      case 'RIGHT':
        return 'top-12 right-2 sm:right-3 max-w-[85%] sm:max-w-[65%] flex justify-end';
      case 'TOP':
      default:
        return 'top-2 left-2 right-28 sm:top-3 sm:left-3 sm:right-48';
    }
  };

  return (
    <div className="w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
      {/* Shared Parent Container for YouTube Iframe + Broadcast Scoreboard Overlay */}
      <div
        ref={containerRef}
        className={
          isExpandedFallback
            ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
            : isNativeFullscreen
              ? 'relative w-full h-full bg-black flex items-center justify-center'
              : 'relative w-full aspect-video bg-black'
        }
      >
        <div className="relative w-full h-full">
          <YouTubePlayer
            bare
            videoId={videoId}
            title={title}
            autoplay={autoplay}
            startSeconds={startSeconds}
            jumpKey={jumpKey}
          />

          {/* Starting Soon Graphic for UPCOMING streams */}
          {stream.status === 'UPCOMING' && !showUpcomingVideoPreview && (
            <StartingSoonGraphic
              stream={stream}
              onShowPreview={() => setShowUpcomingVideoPreview(true)}
            />
          )}

          {/* Top-Right Viewer Controls: Show/Hide Scoreboard + Custom Container Fullscreen */}
          <div className="pointer-events-none absolute top-2 right-2 sm:top-3 sm:right-3 z-30 flex items-center gap-1.5">
            {stream.status === 'UPCOMING' && showUpcomingVideoPreview && (
              <button
                type="button"
                onClick={() => setShowUpcomingVideoPreview(false)}
                className="pointer-events-auto min-h-[34px] px-2.5 py-1 rounded bg-amber-400 text-slate-950 text-[11px] font-bold cursor-pointer"
              >
                PRE-MATCH CARD
              </button>
            )}
            {score && (
              <button
                type="button"
                onClick={toggleScoreboard}
                aria-pressed={scoreboardVisible}
                title={scoreboardVisible ? 'Hide live scoreboard' : 'Show live scoreboard'}
                className="pointer-events-auto min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/85 hover:bg-slate-900 text-white text-[11px] font-semibold tracking-wide border border-white/15 backdrop-blur-md transition-colors cursor-pointer"
              >
                {scoreboardVisible ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                    <span>HIDE SCORE</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>SCORE</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={activeExpanded ? 'Exit broadcast fullscreen' : 'Broadcast fullscreen'}
              title={
                activeExpanded
                  ? 'Exit Fullscreen (keeps scoreboard overlay)'
                  : 'Fullscreen with Live Scoreboard Overlay'
              }
              className="pointer-events-auto min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950/85 hover:bg-slate-900 text-white text-[11px] font-semibold border border-white/15 backdrop-blur-md transition-colors cursor-pointer"
            >
              {activeExpanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">EXIT</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">FULLSCREEN</span>
                </>
              )}
            </button>
          </div>

          {/* Smart Positioned Scoreboard Overlay */}
          {scoreboardVisible && score && (
            <div className={`pointer-events-none absolute z-20 ${getScoreboardAnchorClass()}`}>
              <div className="pointer-events-auto inline-block max-w-full">
                <BroadcastScoreboardOverlay stream={stream} score={score} compact={false} />
              </div>
            </div>
          )}

          {/* Active Sponsor Overlay Strip (positioned away from scoreboard when possible) */}
          {sponsorOverlays.length > 0 && (
            <div
              className={`pointer-events-none absolute z-20 ${
                position === 'BOTTOM'
                  ? 'top-2 left-2 sm:top-3 sm:left-3 max-w-[65%]'
                  : 'bottom-12 right-2 sm:right-3 max-w-[75%] flex justify-end'
              }`}
            >
              <SponsorOverlayBanner overlays={sponsorOverlays} />
            </div>
          )}
        </div>
      </div>

      {/* Footer Strip outside player container */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 text-xs text-slate-300 border-t border-slate-800">
        <span className="truncate">
          {fallbackNotice ||
            'Adaptive YouTube quality: click the gear icon in player for 360p/480p on slower networks. Use Fullscreen above to keep scoreboard visible.'}
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
}
