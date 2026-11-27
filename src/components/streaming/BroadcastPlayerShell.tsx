import { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Unlock,
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
import { BroadcastBrandLogoBug } from '../obs/ObsBrandMark.tsx';
import { BroadcastSponsorAdBanner } from '../obs/BroadcastSponsorAdBanner.tsx';
import { TimeoutFullscreenSponsorAd } from '../obs/TimeoutFullscreenSponsorAd.tsx';
import { JioHotstarFullScoreboard } from '../obs/JioHotstarFullScoreboard.tsx';
import { normalizeOverlayConfig } from '../../utils/overlayConfig.ts';
import {
  resolveMatchTimeoutState,
  resolveTimeoutOverlayDecision,
} from '../../utils/matchTimeout.ts';
import { useBroadcastEventQueue } from '../../hooks/useBroadcastEventQueue.ts';
import { BroadcastEventAnimationLayer } from '../obs/BroadcastEventAnimationLayer.tsx';
import { useImmersivePlayer } from '../../hooks/useImmersivePlayer.ts';

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
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  const {
    stageRef: containerRef,
    controlsVisible,
    touchLocked,
    lockedHintVisible,
    isNativeFullscreen,
    isExpandedFallback,
    isFullscreenActive: activeExpanded,
    layout,
    showControlsTemporarily,
    hideControls,
    notifyUserInteraction,
    toggleTouchLock,
    showLockedHintBriefly,
    toggleFullscreen,
  } = useImmersivePlayer({
    autoHideMs: 3000,
    initiallyVisible: true,
    onFullscreenFallbackNotice: setFallbackNotice,
  });

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

  const position: ScoreboardPosition = stream.scoreboardPosition || 'BOTTOM';
  const normalizedOverlayConfig = normalizeOverlayConfig(stream.overlayConfig);
  const timeoutInfo = resolveMatchTimeoutState(stream, score);
  const timeoutDecision = resolveTimeoutOverlayDecision(normalizedOverlayConfig, timeoutInfo);
  const { activeItem: activeEventItem, isExiting: isEventExiting } = useBroadcastEventQueue({
    matchId: stream.id || stream._id,
    overlayConfig: normalizedOverlayConfig,
  });

  const getScoreboardAnchorClass = () => {
    switch (position) {
      case 'BOTTOM':
        return 'bottom-12 left-2 right-2 sm:left-3 sm:right-3 flex justify-center safe-pb safe-px';
      case 'LEFT':
        return 'top-14 left-2 sm:left-3 max-w-[85%] sm:max-w-[65%]';
      case 'RIGHT':
        return 'top-14 right-2 sm:right-3 max-w-[85%] sm:max-w-[65%] flex justify-end';
      case 'TOP':
      default:
        return 'top-14 left-2 right-2 flex justify-center';
    }
  };

  const showHud = controlsVisible && !touchLocked;

  return (
    <div className="w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
      {/* Shared Parent Container for YouTube Iframe + Broadcast Scoreboard Overlay */}
      <div
        ref={containerRef}
        onMouseMove={() => {
          if (!touchLocked) showControlsTemporarily();
        }}
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

          {/* Tap-to-hide backdrop while unified overlay is visible */}
          {showHud && (
            <div
              data-player-backdrop="true"
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation();
                hideControls();
              }}
              className="absolute inset-0 z-25 cursor-pointer"
            />
          )}

          {/* Non-blocking wake controls when auto-hidden */}
          {!controlsVisible && !touchLocked && (
            <>
              <div
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  showControlsTemporarily();
                }}
                className="absolute top-0 inset-x-0 h-14 z-25 cursor-pointer"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showControlsTemporarily();
                }}
                aria-label="Show player controls"
                className="absolute top-2.5 right-2.5 z-30 min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-slate-950/60 hover:bg-slate-950/90 text-white/80 hover:text-white border border-white/15 backdrop-blur-sm opacity-75 hover:opacity-100 transition-opacity cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Unified Auto-Hide Top Viewer Controls */}
          <div
            data-unified-hud="true"
            className={`pointer-events-none absolute inset-x-0 top-0 z-30 transition-opacity duration-200 ${
              showHud ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={`${
                showHud ? 'pointer-events-auto' : 'pointer-events-none'
              } bg-gradient-to-b from-black/75 via-black/35 to-transparent p-2 sm:p-3 pb-5 flex items-center justify-end gap-1.5 safe-pt safe-px`}
            >
              {stream.status === 'UPCOMING' && showUpcomingVideoPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUpcomingVideoPreview(false);
                    notifyUserInteraction();
                  }}
                  className="min-h-[38px] sm:min-h-[34px] px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 text-[11px] font-bold cursor-pointer"
                >
                  PRE-MATCH CARD
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTouchLock();
                }}
                title="Lock screen against accidental taps"
                aria-label="Lock player controls"
                className="min-h-[40px] sm:min-h-[36px] min-w-[40px] sm:min-w-[36px] inline-flex items-center justify-center rounded-lg bg-slate-950/85 hover:bg-slate-900 text-slate-200 border border-white/15 backdrop-blur-md cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
              </button>

              {score && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleScoreboard();
                    notifyUserInteraction();
                  }}
                  aria-pressed={scoreboardVisible}
                  title={scoreboardVisible ? 'Hide live scoreboard' : 'Show live scoreboard'}
                  className="min-h-[40px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/85 hover:bg-slate-900 text-white text-[11px] font-semibold tracking-wide border border-white/15 backdrop-blur-md transition-colors cursor-pointer"
                >
                  {scoreboardVisible ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                      <span className="hidden sm:inline">HIDE SCORE</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden sm:inline">SCORE</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                aria-label={activeExpanded ? 'Exit broadcast fullscreen' : 'Broadcast fullscreen'}
                title={
                  activeExpanded
                    ? 'Exit Fullscreen (keeps scoreboard overlay)'
                    : 'Fullscreen with Live Scoreboard Overlay'
                }
                className="min-h-[44px] sm:min-h-[36px] min-w-[44px] sm:min-w-[36px] inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/85 hover:bg-slate-900 text-white text-[11px] font-semibold border border-white/15 backdrop-blur-md transition-colors cursor-pointer"
              >
                {activeExpanded ? (
                  <>
                    <Minimize2 className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">EXIT</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">FULLSCREEN</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Touch Lock Protective Shield */}
          {touchLocked && (
            <div
              data-touch-lock-shield="true"
              onClick={(e) => {
                e.stopPropagation();
                showLockedHintBriefly();
              }}
              className="absolute inset-0 z-40 flex items-end justify-center pb-8 safe-pb cursor-pointer"
            >
              {lockedHintVisible && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-950/92 border border-white/20 text-white text-xs font-semibold shadow-2xl backdrop-blur-md"
                >
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Screen Locked</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTouchLock();
                    }}
                    className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Smart Positioned Container-Aware Scoreboard Overlay */}
          {scoreboardVisible && score && (
            <div className={`pointer-events-none absolute z-20 ${getScoreboardAnchorClass()}`}>
              <div className="pointer-events-auto inline-block max-w-full">
                <BroadcastScoreboardOverlay
                  stream={stream}
                  score={score}
                  compact={layout.isCompactStage}
                  layoutMode={layout.stageOrientation}
                />
              </div>
            </div>
          )}

          {/* Admin-Configured Brand Logo Bug */}
          <BroadcastBrandLogoBug
            config={normalizedOverlayConfig}
            variant="responsive"
            zIndex={22}
          />

          <BroadcastSponsorAdBanner
            config={normalizedOverlayConfig}
            variant="responsive"
            zIndex={23}
            suppress={timeoutDecision.isAnyTakeoverActive}
          />

          {/* Active Sponsor Overlay Strip */}
          {sponsorOverlays.length > 0 && (
            <div
              className={`pointer-events-none absolute z-20 ${
                position === 'BOTTOM'
                  ? 'top-2 left-2 sm:top-3 sm:left-3 max-w-[65%]'
                  : 'bottom-12 right-2 sm:right-3 max-w-[75%] flex justify-end'
              }`}
            >
              <SponsorOverlayBanner
                overlays={sponsorOverlays}
                suppress={timeoutDecision.isAnyTakeoverActive}
              />
            </div>
          )}

          <JioHotstarFullScoreboard
            stream={stream}
            score={score}
            config={normalizedOverlayConfig}
            timeoutInfo={timeoutInfo}
            variant="responsive"
            zIndex={27}
            visible={timeoutDecision.showFullScoreboard}
          />
          <TimeoutFullscreenSponsorAd
            stream={stream}
            score={score}
            config={normalizedOverlayConfig}
            timeoutInfo={timeoutInfo}
            fallbackSponsorOverlays={sponsorOverlays}
            variant="responsive"
            zIndex={28}
            visible={timeoutDecision.showFullscreenSponsorAd}
          />
          <BroadcastEventAnimationLayer
            activeItem={activeEventItem}
            isExiting={isEventExiting}
            overlayConfig={normalizedOverlayConfig}
            variant="responsive"
            zIndex={34}
          />
        </div>
      </div>

      {/* Footer Strip outside player container */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 text-xs text-slate-300 border-t border-slate-800">
        <span className="truncate">
          {fallbackNotice ||
            'Adaptive YouTube quality: click the gear icon in player for 360p/480p on slower networks. Use Fullscreen above for landscape overlay.'}
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
