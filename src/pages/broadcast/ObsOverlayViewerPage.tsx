import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { useObsOverlay } from '../../hooks/useObsOverlay.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { authService } from '../../services/auth/authService.ts';
import { applyOverlayQueryParams } from '../../utils/overlayConfig.ts';
import { computeObsLayoutBoxes } from '../../utils/obsLayoutGeometry.ts';
import {
  resolveMatchTimeoutState,
  resolveTimeoutOverlayDecision,
} from '../../utils/matchTimeout.ts';
import { HotstarBroadcastOverlay } from '../../components/obs/HotstarBroadcastOverlay.tsx';
import { BroadcastBrandLogoBug } from '../../components/obs/ObsBrandMark.tsx';
import { BroadcastSponsorAdBanner } from '../../components/obs/BroadcastSponsorAdBanner.tsx';
import { LiveMvpBroadcastOverlay } from '../../components/obs/LiveMvpBroadcastOverlay.tsx';
import { TimeoutFullscreenSponsorAd } from '../../components/obs/TimeoutFullscreenSponsorAd.tsx';
import { JioHotstarFullScoreboard } from '../../components/obs/JioHotstarFullScoreboard.tsx';
import { DraggableObsScorePanel } from '../../components/obs/DraggableObsScorePanel.tsx';
import { ObsGraphicsLayer } from '../../components/obsGraphics/ObsGraphicsLayer.tsx';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { obsStudioService } from '../../services/obs/obsStudioService.ts';
import { MultiCamSplitBorders } from '../../components/obsStudio/MultiCamSplitBorders.tsx';
import { useBroadcastEventQueue } from '../../hooks/useBroadcastEventQueue.ts';
import { BroadcastEventAnimationLayer } from '../../components/obs/BroadcastEventAnimationLayer.tsx';

export function ObsOverlayViewerPage() {
  const { matchId: routeMatchId } = useParams<{ matchId: string }>();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const followActive = routeMatchId === 'active' || searchParams.get('followActive') === '1';
  const bridgeFilter = searchParams.get('bridgeId')?.trim() || '';

  const [effectiveMatchId, setEffectiveMatchId] = useState<string | undefined>(() =>
    routeMatchId && routeMatchId !== 'active' ? routeMatchId : undefined
  );

  useEffect(() => {
    if (routeMatchId && routeMatchId !== 'active') {
      setEffectiveMatchId(routeMatchId);
      return;
    }
    if (routeMatchId === 'active') {
      let cancelled = false;
      obsStudioService
        .getActiveOverlayTarget(bridgeFilter || undefined)
        .then((res) => {
          if (!cancelled && res.matchId) {
            setEffectiveMatchId(res.matchId);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [routeMatchId, bridgeFilter]);

  useEffect(() => {
    if (!followActive) return;
    const socket = getSocketClient();

    const handleActiveChanged = (payload: { matchId?: string; bridgeId?: string | null }) => {
      if (!payload?.matchId) return;
      if (bridgeFilter && payload.bridgeId && payload.bridgeId.toUpperCase() !== bridgeFilter.toUpperCase()) {
        return;
      }
      setEffectiveMatchId(payload.matchId);
    };

    const handleReconnect = () => {
      if (routeMatchId === 'active') {
        obsStudioService
          .getActiveOverlayTarget(bridgeFilter || undefined)
          .then((res) => {
            if (res.matchId) setEffectiveMatchId(res.matchId);
          })
          .catch(() => {});
      }
    };

    socket.on('obs:active_match_changed', handleActiveChanged);
    socket.on('connect', handleReconnect);
    return () => {
      socket.off('obs:active_match_changed', handleActiveChanged);
      socket.off('connect', handleReconnect);
    };
  }, [followActive, bridgeFilter, routeMatchId]);

  const { adminUser, adminLoading } = useAuth();
  const {
    stream,
    score,
    setScore,
    overlayConfig,
    setOverlayConfig,
    graphicsState,
    obsLayout,
    brandLogoUrl,
    serverClockOffsetMs,
    loading,
    refetch,
  } = useObsOverlay(effectiveMatchId);

  const obsForced = searchParams.get('obs') === '1' || searchParams.get('controls') === '0';
  const sbOff = searchParams.get('sb') === '0';
  const isAdminAuthenticated =
    !adminLoading && Boolean(adminUser) && Boolean(authService.getAdminToken());
  const canShowAdminControls = isAdminAuthenticated && !obsForced;

  const [controlsOpen, setControlsOpen] = useState<boolean>(true);

  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

  // Enforce true transparent canvas and zero scrollbars/padding on OBS Browser Source route
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-obs-overlay-view', 'true');
    return () => {
      root.removeAttribute('data-obs-overlay-view');
    };
  }, []);

  // Ensure OBS Studio Browser Source never runs under a stale cached PWA Service Worker
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker
      .getRegistrations()
      .then(async (regs) => {
        if (regs.length === 0) return;
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
        if ('caches' in window) {
          const keys = await window.caches.keys().catch(() => []);
          await Promise.all(keys.map((k) => window.caches.delete(k).catch(() => false)));
        }
        if (hadController) {
          const reloadKey = 'maidanlive_obs_sw_cleared';
          try {
            if (!window.sessionStorage.getItem(reloadKey)) {
              window.sessionStorage.setItem(reloadKey, '1');
              window.location.reload();
            }
          } catch {
            // Ignore sessionStorage restrictions in private browser contexts
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onResize = () => {
      setViewport({
        w: window.innerWidth || 1920,
        h: window.innerHeight || 1080,
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const effectiveConfig = useMemo(
    () => applyOverlayQueryParams(overlayConfig, location.search),
    [overlayConfig, location.search]
  );

  const { activeItem: activeEventItem, isExiting: isEventExiting } = useBroadcastEventQueue({
    matchId: effectiveMatchId,
    overlayConfig: effectiveConfig,
  });

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const timeoutInfo = useMemo(
    () => resolveMatchTimeoutState(stream, score, nowMs + serverClockOffsetMs),
    [stream, score, nowMs, serverClockOffsetMs]
  );
  const timeoutDecision = useMemo(
    () => resolveTimeoutOverlayDecision(effectiveConfig, timeoutInfo),
    [effectiveConfig, timeoutInfo]
  );

  useEffect(() => {
    if (!timeoutInfo.isTimeout) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [timeoutInfo.isTimeout]);

  const isPortrait = viewport.h > viewport.w;

  const { canvasWidth, canvasHeight, scale } = useMemo(() => {
    if (isPortrait) {
      const w = 1080;
      const aspect = viewport.h / Math.max(1, viewport.w);
      const h = Math.max(1200, Math.round(w * aspect));
      return {
        canvasWidth: w,
        canvasHeight: h,
        scale: Math.max(0.2, viewport.w / w),
      };
    }
    const sw = viewport.w / 1920;
    const sh = viewport.h / 1080;
    return {
      canvasWidth: 1920,
      canvasHeight: 1080,
      scale: Math.max(0.2, Math.min(sw, sh)),
    };
  }, [viewport, isPortrait]);

  const multiCamBoxes = useMemo(() => {
    if (!obsLayout || obsLayout.activeLayoutType === 'SINGLE') return [];
    const ids = obsLayout.activeCameraIds.length
      ? obsLayout.activeCameraIds
      : obsLayout.activeCameraId
        ? [obsLayout.activeCameraId]
        : [];
    if (ids.length <= 1) return [];
    return computeObsLayoutBoxes(
      obsLayout.activeLayoutType,
      ids,
      obsLayout.activeCameraId || ids[0],
      canvasWidth,
      canvasHeight,
      {
        pipPosition: obsLayout.activePipPosition,
        pipSize: obsLayout.activePipSize,
      }
    );
  }, [obsLayout, canvasWidth, canvasHeight]);

  if (loading || !stream) {
    return <div className="w-screen h-screen bg-transparent overflow-hidden" />;
  }

  const showScoreboardOnYoutube = stream.showScoreboardOnYoutube !== false;
  const launcherCorner =
    effectiveConfig.position === 'bottom-right' ? 'bottom-4 left-4' : 'bottom-4 right-4';

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden relative flex items-center justify-center">
      <div
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        className="shrink-0 relative bg-transparent overflow-hidden pointer-events-none"
      >
        {/* Multi-Camera 2px White + Neon Accent Split Borders rendered in actual OBS Program output */}
        {obsLayout && obsLayout.activeLayoutType !== 'SINGLE' && multiCamBoxes.length > 1 && (
          <MultiCamSplitBorders
            layoutType={obsLayout.activeLayoutType}
            boxes={multiCamBoxes}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            zIndex={10}
          />
        )}

        {/* Positioned Brand Logo Overlay */}
        <BroadcastBrandLogoBug
          config={effectiveConfig}
          serverLogoUrl={brandLogoUrl}
          variant="canvas"
          zIndex={24}
        />

        {/* 1-Button Live Sponsor Advertisement Overlay */}
        <BroadcastSponsorAdBanner
          config={effectiveConfig}
          variant="canvas"
          zIndex={26}
          suppress={timeoutDecision.isAnyTakeoverActive}
        />

        {/* Featured Live MVP Broadcast Overlay */}
        <LiveMvpBroadcastOverlay
          stream={stream}
          score={score}
          config={effectiveConfig}
          variant="canvas"
          zIndex={27}
          suppress={timeoutDecision.isAnyTakeoverActive}
        />

        {showScoreboardOnYoutube && !sbOff && !timeoutDecision.isAnyTakeoverActive && (
          <HotstarBroadcastOverlay
            stream={stream}
            score={score}
            config={effectiveConfig}
            isPortrait={isPortrait}
            serverClockOffsetMs={serverClockOffsetMs}
          />
        )}

        <JioHotstarFullScoreboard
          stream={stream}
          score={score}
          config={effectiveConfig}
          timeoutInfo={timeoutInfo}
          isPortrait={isPortrait}
          variant="canvas"
          serverClockOffsetMs={serverClockOffsetMs}
          zIndex={31}
          visible={timeoutDecision.showFullScoreboard && !sbOff}
        />

        <TimeoutFullscreenSponsorAd
          stream={stream}
          score={score}
          config={effectiveConfig}
          timeoutInfo={timeoutInfo}
          variant="canvas"
          isPortrait={isPortrait}
          zIndex={32}
          visible={timeoutDecision.showFullscreenSponsorAd}
        />

        <ObsGraphicsLayer
          graphicsState={graphicsState}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          matchId={effectiveMatchId}
          tournamentId={stream.tournamentId || null}
        />

        <BroadcastEventAnimationLayer
          activeItem={activeEventItem}
          isExiting={isEventExiting}
          overlayConfig={effectiveConfig}
          variant="canvas"
          isPortrait={isPortrait}
          zIndex={42}
        />
      </div>

      {canShowAdminControls && (!showScoreboardOnYoutube || sbOff) && (
        <div className="fixed top-4 left-4 z-50 pointer-events-none px-3.5 py-2 rounded-lg border border-amber-500/40 bg-slate-950/90 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur-md">
          {sbOff
            ? 'Scoreboard hidden via ?sb=0 — multi-cam split borders & brand logo remain active.'
            : 'Scoreboard on YouTube is OFF — overlay hidden in OBS; visible only inside MaidanLive video player.'}
        </div>
      )}

      {canShowAdminControls && (
        controlsOpen ? (
          <DraggableObsScorePanel
            stream={stream}
            score={score}
            overlayPosition={effectiveConfig.position}
            overlayConfig={overlayConfig}
            onOverlayConfigChange={setOverlayConfig}
            onScoreChange={setScore}
            onRefresh={refetch}
            onClose={() => setControlsOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setControlsOpen(true)}
            className={`fixed ${launcherCorner} z-50 pointer-events-auto min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700/90 bg-slate-950/90 hover:bg-slate-900 text-xs font-semibold text-white shadow-xl backdrop-blur-md whitespace-nowrap`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Admin Score Controls</span>
          </button>
        )
      )}
    </div>
  );
}
