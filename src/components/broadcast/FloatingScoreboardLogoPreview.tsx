import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { GripHorizontal, LocateFixed, Monitor, Smartphone, Sparkles, X } from 'lucide-react';
import { useBroadcastPreview } from '../../context/BroadcastPreviewContext.tsx';
import { HotstarBroadcastOverlay } from '../obs/HotstarBroadcastOverlay.tsx';
import { BroadcastBrandLogoBug } from '../obs/ObsBrandMark.tsx';
import { BroadcastSponsorAdBanner } from '../obs/BroadcastSponsorAdBanner.tsx';
import { TimeoutFullscreenSponsorAd } from '../obs/TimeoutFullscreenSponsorAd.tsx';
import { JioHotstarFullScoreboard } from '../obs/JioHotstarFullScoreboard.tsx';
import {
  resolveMatchTimeoutState,
  resolveTimeoutOverlayDecision,
} from '../../utils/matchTimeout.ts';
import stadiumHeroImg from '../../assets/images/stadium_floodlight_hero_1795011087164.jpg';

const EDGE_MARGIN = 12;

function estimatePanelDimensions(
  el: HTMLElement | null,
  isPortrait: boolean
): { width: number; height: number } {
  if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
    return { width: el.offsetWidth, height: el.offsetHeight };
  }
  return isPortrait ? { width: 264, height: 500 } : { width: 444, height: 312 };
}

function clampPreviewPoint(
  pt: { x: number; y: number },
  el: HTMLElement | null,
  isPortrait: boolean
): { x: number; y: number } {
  if (typeof window === 'undefined') return pt;
  const { width, height } = estimatePanelDimensions(el, isPortrait);
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN);
  return {
    x: Math.round(Math.min(maxX, Math.max(EDGE_MARGIN, pt.x))),
    y: Math.round(Math.min(maxY, Math.max(EDGE_MARGIN, pt.y))),
  };
}

function getDefaultCornerPosition(
  el: HTMLElement | null,
  isPortrait: boolean
): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  const { width, height } = estimatePanelDimensions(el, isPortrait);
  return clampPreviewPoint(
    {
      x: window.innerWidth - width - 16,
      y: window.innerHeight - height - 16,
    },
    el,
    isPortrait
  );
}

export function FloatingScoreboardLogoPreview() {
  const location = useLocation();
  const {
    overlayPreview,
    overlayPreviewPosition,
    updateOverlayPreviewPosition,
    resetOverlayPreviewPosition,
    closeOverlayPreview,
  } = useBroadcastPreview();
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const prevRouteRef = useRef(`${location.pathname}${location.search}`);
  const panelRef = useRef<HTMLElement | null>(null);

  const isPortrait = orientation === 'portrait';
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() =>
    overlayPreviewPosition
      ? clampPreviewPoint(overlayPreviewPosition, null, isPortrait)
      : getDefaultCornerPosition(null, isPortrait)
  );
  const posRef = useRef(pos);
  posRef.current = pos;

  const dragRef = useRef<{
    dragging: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    dragging: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  // Close automatically when user switches route or URL tab (?tab=...)
  useEffect(() => {
    const nextRoute = `${location.pathname}${location.search}`;
    if (prevRouteRef.current !== nextRoute) {
      prevRouteRef.current = nextRoute;
      if (overlayPreview.open) {
        closeOverlayPreview();
      }
    }
  }, [location.pathname, location.search, overlayPreview.open, closeOverlayPreview]);

  const isIsolatedRoute =
    location.pathname.startsWith('/broadcast/overlay') ||
    location.pathname.startsWith('/camera-connect');

  const isVisible =
    !isIsolatedRoute &&
    overlayPreview.open &&
    Boolean(overlayPreview.stream) &&
    Boolean(overlayPreview.config);

  // Sync & clamp position whenever preview opens, orientation changes, or viewport resizes
  useEffect(() => {
    if (!isVisible) return;
    const syncBounds = () => {
      setPos((prev) =>
        overlayPreviewPosition
          ? clampPreviewPoint(overlayPreviewPosition, panelRef.current, isPortrait)
          : getDefaultCornerPosition(panelRef.current, isPortrait)
      );
    };
    const raf = window.requestAnimationFrame(syncBounds);
    window.addEventListener('resize', syncBounds);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', syncBounds);
    };
  }, [isVisible, isPortrait, overlayPreviewPosition]);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest('button, a, input, select')) {
        return;
      }
      e.preventDefault();
      dragRef.current = {
        dragging: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: posRef.current.x,
        origY: posRef.current.y,
      };
      setIsDragging(true);
    },
    []
  );

  useEffect(() => {
    if (!isDragging) return;

    const onPointerMove = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st.dragging || e.pointerId !== st.pointerId) return;
      const next = clampPreviewPoint(
        {
          x: st.origX + (e.clientX - st.startX),
          y: st.origY + (e.clientY - st.startY),
        },
        panelRef.current,
        isPortrait
      );
      posRef.current = next;
      setPos(next);
    };

    const stopDragging = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st.dragging || e.pointerId !== st.pointerId) return;
      st.dragging = false;
      setIsDragging(false);
      updateOverlayPreviewPosition(posRef.current);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [isDragging, isPortrait, updateOverlayPreviewPosition]);

  function handleResetPosition() {
    resetOverlayPreviewPosition();
    setPos(getDefaultCornerPosition(panelRef.current, isPortrait));
  }

  if (!isVisible || !overlayPreview.stream || !overlayPreview.config) {
    return null;
  }

  const canvasW = isPortrait ? 1080 : 1920;
  const canvasH = isPortrait ? 1920 : 1080;
  const boxW = isPortrait ? 240 : 420;
  const boxH = Math.round((boxW * canvasH) / canvasW);
  const scale = boxW / canvasW;
  const timeoutInfo = resolveMatchTimeoutState(overlayPreview.stream, overlayPreview.score);
  const timeoutDecision = resolveTimeoutOverlayDecision(overlayPreview.config, timeoutInfo);

  return (
    <aside
      ref={panelRef}
      data-floating-overlay-preview="true"
      aria-label="Live Scoreboard and Brand Logo Floating Preview"
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
      className={`fixed top-0 left-0 z-[90] w-auto max-w-[calc(100vw-24px)] rounded-2xl border bg-slate-950/95 text-white backdrop-blur-md overflow-hidden transition-[border-color] duration-150 ${
        isDragging
          ? 'border-[#EA580C] shadow-[0_28px_70px_rgba(0,0,0,0.92),0_0_28px_rgba(234,88,12,0.3)]'
          : 'border-purple-500/40 shadow-[0_24px_60px_rgba(0,0,0,0.85),0_0_24px_rgba(168,85,247,0.22)]'
      }`}
    >
      {/* Draggable Header */}
      <div
        onPointerDown={handleHeaderPointerDown}
        onDoubleClick={(e) => {
          if (e.target instanceof Element && e.target.closest('button, a, input, select')) return;
          handleResetPosition();
        }}
        title="Drag to move preview anywhere on screen (double-click to reset corner)"
        className={`px-3 py-2 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between gap-3 select-none touch-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
          <Sparkles className="w-3.5 h-3.5 text-pink-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-white truncate">
              Live Style &amp; Logo Preview
            </p>
            <p className="text-[10px] font-mono tabular-nums text-slate-400 truncate">
              {overlayPreview.config.style} · {Math.round(overlayPreview.config.customScale * 100)}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-0.5">
            <button
              type="button"
              onClick={() => setOrientation('landscape')}
              title="16:9 Landscape Preview"
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                !isPortrait ? 'bg-[#EA580C] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-2.5 h-2.5" />
              <span>16:9</span>
            </button>
            <button
              type="button"
              onClick={() => setOrientation('portrait')}
              title="9:16 Portrait Preview"
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                isPortrait ? 'bg-[#EA580C] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-2.5 h-2.5" />
              <span>9:16</span>
            </button>
          </div>

          {overlayPreviewPosition && (
            <button
              type="button"
              onClick={handleResetPosition}
              aria-label="Reset floating style preview position"
              title="Snap back to bottom-right corner"
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <LocateFixed className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={closeOverlayPreview}
            aria-label="Close floating style preview"
            title="Close Preview"
            className="p-1 rounded-lg bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scaled Live Broadcast Canvas */}
      <div className="p-2.5 bg-slate-950 flex justify-center">
        <div
          style={{ width: boxW, height: boxH }}
          className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shrink-0"
        >
          <img
            src={stadiumHeroImg}
            alt="Broadcast stage backdrop"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover brightness-75 pointer-events-none"
          />
          <div
            style={{
              width: canvasW,
              height: canvasH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            className="absolute top-0 left-0 pointer-events-none"
          >
            <BroadcastBrandLogoBug
              config={overlayPreview.config}
              serverLogoUrl={overlayPreview.brandLogoUrl}
              variant="canvas"
              zIndex={24}
            />
            <BroadcastSponsorAdBanner
              config={overlayPreview.config}
              variant="canvas"
              zIndex={26}
              suppress={timeoutDecision.isAnyTakeoverActive}
            />
            {!timeoutDecision.isAnyTakeoverActive && (
              <HotstarBroadcastOverlay
                stream={overlayPreview.stream}
                score={overlayPreview.score}
                config={overlayPreview.config}
                isPortrait={isPortrait}
                serverClockOffsetMs={overlayPreview.serverClockOffsetMs}
              />
            )}
            <JioHotstarFullScoreboard
              stream={overlayPreview.stream}
              score={overlayPreview.score}
              config={overlayPreview.config}
              timeoutInfo={timeoutInfo}
              isPortrait={isPortrait}
              variant="canvas"
              serverClockOffsetMs={overlayPreview.serverClockOffsetMs}
              zIndex={31}
              visible={timeoutDecision.showFullScoreboard}
            />
            <TimeoutFullscreenSponsorAd
              stream={overlayPreview.stream}
              score={overlayPreview.score}
              config={overlayPreview.config}
              timeoutInfo={timeoutInfo}
              variant="canvas"
              isPortrait={isPortrait}
              zIndex={32}
              visible={timeoutDecision.showFullscreenSponsorAd}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
